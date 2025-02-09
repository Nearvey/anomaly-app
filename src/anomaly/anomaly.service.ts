import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { IsolationForest } from 'ml-isolation-forest';
import { File as MulterFile } from 'multer';

@Injectable()
export class AnomalyService {
  async processFile(file: MulterFile): Promise<any> {
    // Wczytanie pliku (CSV, XLS, XLSX) przy użyciu biblioteki XLSX
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Usunięcie tymczasowego pliku
    fs.unlinkSync(file.path);

    // Grupowanie rekordów według kolumny 'TAGS'
    const groupedData = this.groupByTags(jsonData);

    // Analiza anomalii obiema metodami
    const zScoreResults = this.detectAnomaliesZScore(groupedData);
    const isolationForestResults = this.detectAnomaliesIsolationForest(groupedData);

    // Łączenie wyników dla każdej grupy
    const anomalyResults: any = {};
    Object.keys(groupedData).forEach(tag => {
      anomalyResults[tag] = {
        zScore: zScoreResults[tag],
        isolationForest: isolationForestResults[tag],
      };
    });

    return anomalyResults;
  }

  // Grupowanie rekordów na podstawie kolumny 'TAGS'
  groupByTags(data: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    data.forEach(row => {
      let tags = row['TAGS'];
      if (tags) {
        tags = String(tags)
          .split(',')
          .map(tag => tag.trim())
          .filter(tag => tag !== '');
        tags.forEach(tag => {
          if (!groups[tag]) {
            groups[tag] = [];
          }
          groups[tag].push(row);
        });
      }
    });
    return groups;
  }

  // Pomocnicza funkcja do liczenia średniej i odchylenia standardowego
  computeStats(values: number[]): { mean: number; std: number } {
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    return { mean, std };
  }

  // Wykrywanie anomalii metodą z-score (działa na pojedynczych kolumnach)
  detectAnomaliesZScore(groupedData: Record<string, any[]>): any {
    const results: any = {};
    Object.keys(groupedData).forEach(tag => {
      const records = groupedData[tag];
      const kwotaCols = Object.keys(records[0]).filter(col =>
        col.toLowerCase().includes('kwota')
      );

      if (records.length < 10) {
        results[tag] = { warning: 'Zbyt mało rekordów do wiarygodnej analizy', anomalies: [] };
        return;
      }
      if (kwotaCols.length === 0) {
        results[tag] = { warning: 'Brak kolumn zawierających "Kwota"', anomalies: [] };
        return;
      }

      const anomalies = [];
      kwotaCols.forEach(col => {
        const values = records.map(r => Number(r[col])).filter(val => !isNaN(val));
        if (values.length === 0) return;
        const { mean, std } = this.computeStats(values);
        const threshold = 3; // |z-score| > 3 traktujemy jako anomalię

        records.forEach(record => {
          const value = Number(record[col]);
          if (!isNaN(value) && std > 0) {
            const z = (value - mean) / std;
            if (Math.abs(z) > threshold) {
              anomalies.push({
                record,
                column: col,
                value: value,
                zScore: z,
                algorithm: 'zScore',
              });
            }
          }
        });
      });

      results[tag] = { anomalies };
    });
    return results;
  }

  // Wykrywanie anomalii przy użyciu Isolation Forest (przyjmujemy, że model zwraca miary anomalii)
  detectAnomaliesIsolationForest(groupedData: Record<string, any[]>): any {
    const results: any = {};
    Object.keys(groupedData).forEach(tag => {
      const records = groupedData[tag];
      const kwotaCols = Object.keys(records[0]).filter(col =>
        col.toLowerCase().includes('kwota')
      );

      if (records.length < 10) {
        results[tag] = { warning: 'Zbyt mało rekordów do wiarygodnej analizy', anomalies: [] };
        return;
      }
      if (kwotaCols.length === 0) {
        results[tag] = { warning: 'Brak kolumn zawierających "Kwota"', anomalies: [] };
        return;
      }

      // Przygotowujemy próbki jako wektory: każda próbka to tablica wartości z wszystkich kolumn "kwota"
      const samples = records.map(record =>
        kwotaCols.map(col => {
          const value = Number(record[col]);
          return isNaN(value) ? null : value;
        })
      ).filter(sample => !sample.some(val => val === null));

      if (samples.length === 0) {
         results[tag] = { warning: 'Brak poprawnych danych liczbowych w kolumnach "Kwota"', anomalies: [] };
         return;
      }
      
      try {
        // Dynamiczne ustawienie parametru contamination – zwiększamy wartość dla małych zbiorów
        const contaminationParam = Math.max(0.05, 1 / samples.length);
        const options = { nTrees: 100, contamination: contaminationParam };
        const forest = new IsolationForest(options);
        forest.train(samples);
        const predictions = forest.predict(samples); // Zakładamy, że predictions to miary anomalii

        // Ustalamy próg – przykładowo 0.6; jeśli wynik >= thresholdScore, próbka jest uznawana za anomalie
        const thresholdScore = 0.6;
        const anomalies = [];
        records.forEach((record, i) => {
          if (predictions[i] >= thresholdScore) {
            // Dla każdego rekordu, iterujemy po kolumnach, tworząc osobny wpis
            kwotaCols.forEach(col => {
              anomalies.push({
                record,
                column: col,
                value: record[col],
                anomalyScore: predictions[i],
                algorithm: 'IsolationForest',
              });
            });
          }
        });
        results[tag] = { anomalies };
      } catch (e) {
        console.error(`Błąd IsolationForest dla tagu ${tag}:`, e);
        results[tag] = { warning: 'Błąd w analizie Isolation Forest', anomalies: [] };
      }
    });
    return results;
  }
}
