import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileStorageProvider, SignedUrlOptions } from './file-storage-provider';

const TOKEN_TTL_MAX_SEC = 600;

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
};

@Injectable()
export class R2FileStorage implements FileStorageProvider {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(cfg: R2Config) {
    this.bucket = cfg.bucket;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint:
        cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
      }),
    );
  }

  async getSignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    opts?: SignedUrlOptions,
  ): Promise<string> {
    const ttl = Math.min(Math.max(1, ttlSeconds), TOKEN_TTL_MAX_SEC);
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.downloadName
        ? `attachment; filename="${encodeURIComponent(opts.downloadName)}"`
        : undefined,
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: ttl });
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
