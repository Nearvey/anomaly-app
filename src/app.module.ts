import { Module } from '@nestjs/common';
import { AnomalyModule } from './anomaly/anomaly.module';

@Module({
  imports: [AnomalyModule],
})
export class AppModule {}
