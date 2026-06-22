import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadRuntimeConfig } from './config/runtime-config';
import { UPLOADS_BUCKETS, getUploadsBucketDir } from './config/uploads';

async function bootstrap() {
  const runtime = loadRuntimeConfig();
  for (const bucket of Object.values(UPLOADS_BUCKETS)) {
    mkdirSync(getUploadsBucketDir(bucket), { recursive: true });
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind Render's load balancer the immediate peer is the proxy, so without
  // this `req.ip` resolves to the proxy IP for EVERY request — the
  // ThrottlerGuard then buckets all users under one shared rate-limit and trips
  // the limits under normal multi-user load (the prod "Too Many Requests" /
  // network-error symptom). Trust the first proxy hop so `req.ip` reflects the
  // real client (X-Forwarded-For) and each client gets its own bucket.
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || runtime.corsAllowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
  });
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
