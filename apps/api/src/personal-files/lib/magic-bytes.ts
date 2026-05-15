import { fileTypeFromBuffer } from 'file-type';

export const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
]);

export const ALLOWED_EXTS_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export type SniffResult = { mime: string; ext: string };

/**
 * Sniff the buffer's magic bytes. Returns null when the file is not in the
 * allowlist (do NOT trust the multipart Content-Type header — it's spoofable).
 */
export async function sniffAllowedType(
  buf: Buffer,
): Promise<SniffResult | null> {
  const guess = await fileTypeFromBuffer(buf);
  if (!guess) return null;
  if (!ALLOWED_MIMES.has(guess.mime)) return null;
  return {
    mime: guess.mime,
    ext: ALLOWED_EXTS_BY_MIME[guess.mime] ?? guess.ext,
  };
}
