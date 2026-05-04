// apps/api/src/file-storage/file-storage-provider.ts

export type SignedUrlOptions = {
  /** Filename advertised by the Content-Disposition header on download. */
  downloadName?: string;
};

export interface FileStorageProvider {
  /**
   * Write bytes to `key`. Overwrites if the key exists.
   * Throws on storage failure.
   */
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;

  /**
   * Return a time-limited URL the client can GET to retrieve the file.
   * `ttlSeconds` MUST be <= 600.
   */
  getSignedDownloadUrl(
    key: string,
    ttlSeconds: number,
    opts?: SignedUrlOptions,
  ): Promise<string>;

  /** Hard delete a single key. Idempotent — succeeds even if the key is missing. */
  delete(key: string): Promise<void>;

  /** Existence probe. */
  exists(key: string): Promise<boolean>;
}
