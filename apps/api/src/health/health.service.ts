import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const db = await this.pingDatabase();
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      database: db,
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
