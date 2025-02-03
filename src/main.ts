import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Udostępniamy statyczne pliki z katalogu 'public'
  app.useStaticAssets(join(__dirname, '..', 'public'));
  await app.listen(3000);
}
bootstrap();
