import { Module } from '@nestjs/common';
import { AnomalyController } from './anomaly.controller';
import { AnomalyService } from './anomaly.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads', // Tymczasowy katalog do przechowywania przesłanych plików
    }),
  ],
  controllers: [AnomalyController],
  providers: [AnomalyService],
})
export class AnomalyModule {}
