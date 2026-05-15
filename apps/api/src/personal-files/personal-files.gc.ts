import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_STORAGE_PROVIDER } from '../file-storage/file-storage.module';
import type { FileStorageProvider } from '../file-storage/file-storage-provider';
import { PersonalFilesService } from './personal-files.service';

const RESTORE_WINDOW_DAYS = 30;

@Injectable()
export class PersonalFilesGc {
  private readonly logger = new Logger(PersonalFilesGc.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
    private readonly service: PersonalFilesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async hardDeleteExpired() {
    const cutoff = new Date(
      Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const expired = await this.prisma.personalFile.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true, storageKey: true, displayName: true },
    });

    let deleted = 0;
    for (const f of expired) {
      try {
        await this.storage.delete(f.storageKey);
        await this.service.hardDeleteRow(f.id);
        deleted += 1;
      } catch (e) {
        this.logger.error(
          `hard-delete failed for ${f.id} (${f.displayName}): ${(e as Error).message}`,
        );
      }
    }
    if (expired.length > 0) {
      this.logger.log(
        `PersonalFilesGc: hard-deleted ${deleted}/${expired.length} expired files`,
      );
    }
  }
}
