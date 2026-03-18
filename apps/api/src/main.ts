import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdirSync } from 'node:fs';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  mkdirSync('./uploads/ticket-documents', { recursive: true });
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
