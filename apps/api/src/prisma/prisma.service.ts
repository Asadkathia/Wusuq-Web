import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  onModuleInit() {
    if (
      !process.env.DATABASE_URL ||
      process.env.DATABASE_URL.trim().length === 0
    ) {
      const allowMissingDb =
        process.env.ALLOW_START_WITHOUT_DB === 'true' &&
        process.env.NODE_ENV !== 'production';
      if (!allowMissingDb) {
        throw new Error(
          'DATABASE_URL is required (or set ALLOW_START_WITHOUT_DB=true for non-production local boot).',
        );
      }
      this.logger.warn(
        'DATABASE_URL is not set. Booting without DB due to ALLOW_START_WITHOUT_DB=true.',
      );
      return Promise.resolve();
    }
    return this.$connect();
  }

  enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
