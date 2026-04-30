import { join, resolve } from 'node:path';

/**
 * Single source of truth for where uploads live on disk.
 *
 * Reads `UPLOADS_DIR` and falls back to `./uploads` (workspace-local) when
 * the env var is unset. In production this MUST point at a persistent
 * volume (e.g. a Render disk mounted at /var/data/uploads) — local disk
 * on a stateless web service does not survive redeploys / instance
 * replacement, so receipts and ticket documents written there will 404
 * after the next restart.
 *
 * The names of the three sub-buckets are kept stable so persisted DB
 * URLs remain valid across env changes.
 */
export const UPLOADS_BUCKETS = {
  ticketDocuments: 'ticket-documents',
  clerkReceipts: 'clerk-receipts',
  walletReceipts: 'wallet-receipts',
} as const;

export type UploadsBucket = (typeof UPLOADS_BUCKETS)[keyof typeof UPLOADS_BUCKETS];

export function getUploadsDir(): string {
  const raw = process.env.UPLOADS_DIR?.trim();
  return raw && raw.length > 0 ? raw : './uploads';
}

export function getUploadsBucketDir(bucket: UploadsBucket): string {
  return join(getUploadsDir(), bucket);
}

export function getUploadsBucketAbsoluteDir(bucket: UploadsBucket): string {
  return resolve(getUploadsBucketDir(bucket));
}
