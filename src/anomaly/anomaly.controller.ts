import { Controller, Post, UploadedFile, UseInterceptors, Get, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AnomalyService } from './anomaly.service';
import { Response } from 'express';
import { File as MulterFile } from 'multer';

@Controller('anomaly')
export class AnomalyController {
  constructor(private readonly anomalyService: AnomalyService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: MulterFile, @Res() res: Response) {
    try {
      const result = await this.anomalyService.processFile(file);
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  @Get()
  getIndex(@Res() res: Response) {
    res.sendFile('index.html', { root: 'public' });
  }
}
