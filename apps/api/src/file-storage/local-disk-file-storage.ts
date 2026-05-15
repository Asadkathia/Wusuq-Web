import { promises as fs } from 'node:fs';
import { dirname, resolve, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FileStorageProvider, SignedUrlOptions } from './file-storage-provider';
import {
  UPLOADS_BUCKETS,
  getUploadsBucketAbsoluteDir,
} from '../config/uploads';

type Token = {
  key: string;
  mimeType: string;
  downloadName?: string;
  expiresAt: number;
};

const TOKEN_TTL_MAX_SEC = 600;

/**
 * Local-disk implementation of FileStorageProvider.
 *
 * Files live under `<UPLOADS_DIR>/personal-files/<key>`. Signed URLs are
 * opaque tokens kept in an in-memory LRU; the LocalFilesController consumes
 * them to stream bytes back to the client. This matches the auth-stream
 * pattern already used for wallet-receipts and ticket-documents.
 */
@Injectable()
export class LocalDiskFileStorage implements FileStorageProvider {
  private readonly logger = new Logger(LocalDiskFileStorage.name);
  private readonly tokens = new Map<string, Token>();
  private readonly bucketRoot: string;

  constructor() {
    this.bucketRoot = getUploadsBucketAbsoluteDir(
      UPLOADS_BUCKETS.personalFiles,
    );
  }

  async put(key: string, bytes: Buffer, _mimeType: string): Promise<void> {
    const fullPath = this.resolveKey(key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, bytes);
  }

  getSignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    opts?: SignedUrlOptions,
  ): Promise<string> {
    const ttl = Math.min(Math.max(1, ttlSeconds), TOKEN_TTL_MAX_SEC);
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, {
      key,
      mimeType: 'application/octet-stream',
      downloadName: opts?.downloadName,
      expiresAt: Date.now() + ttl * 1000,
    });
    this.gcTokens();
    return Promise.resolve(`/api/files/personal/${token}`);
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveKey(key);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Internal: consumed by LocalFilesController. */
  consumeToken(token: string): Token | null {
    const t = this.tokens.get(token);
    if (!t) return null;
    if (t.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return t;
  }

  resolveKey(key: string): string {
    // Defense-in-depth: refuse keys that escape the bucket root.
    const fullPath = resolve(this.bucketRoot, key);
    const normalized = normalize(fullPath);
    if (
      !normalized.startsWith(this.bucketRoot + '/') &&
      normalized !== this.bucketRoot
    ) {
      throw new Error(`storage key escapes bucket: ${key}`);
    }
    return normalized;
  }

  private gcTokens() {
    if (this.tokens.size < 1024) return;
    const now = Date.now();
    for (const [k, v] of this.tokens) {
      if (v.expiresAt < now) this.tokens.delete(k);
    }
  }
}
