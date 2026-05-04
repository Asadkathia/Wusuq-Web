import { Module, Logger } from '@nestjs/common';
import { FileStorageProvider } from './file-storage-provider';
import { LocalDiskFileStorage } from './local-disk-file-storage';
import { R2FileStorage } from './r2-file-storage';
import { LocalFilesController } from './local-files.controller';

export const FILE_STORAGE_PROVIDER = Symbol('FILE_STORAGE_PROVIDER');

function buildProvider(): FileStorageProvider {
  const logger = new Logger('FileStorageModule');
  const r2Bucket = process.env.R2_BUCKET?.trim();

  if (r2Bucket) {
    const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? '';
    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? '';
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
    const endpoint = process.env.R2_ENDPOINT?.trim() || undefined;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'R2_BUCKET is set but R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are missing. ' +
          'Either set all four (real R2) or unset R2_BUCKET (use local disk).',
      );
    }
    logger.log(`File storage: R2 (bucket=${r2Bucket})`);
    return new R2FileStorage({
      accountId,
      bucket: r2Bucket,
      accessKeyId,
      secretAccessKey,
      endpoint,
    });
  }

  logger.log('File storage: LocalDisk (no R2_BUCKET set)');
  return new LocalDiskFileStorage();
}

@Module({
  controllers: [LocalFilesController],
  providers: [
    LocalDiskFileStorage,
    {
      provide: FILE_STORAGE_PROVIDER,
      useFactory: buildProvider,
    },
  ],
  exports: [FILE_STORAGE_PROVIDER, LocalDiskFileStorage],
})
export class FileStorageModule {}
