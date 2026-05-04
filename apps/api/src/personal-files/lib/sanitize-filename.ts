const MAX_LEN = 200;

/**
 * Strip path separators, control chars, trailing dots, and trim.
 * Always returns a non-empty string ('untitled' fallback).
 */
export function sanitizeFilename(input: string): string {
  // eslint-disable-next-line no-control-regex
  const noControl = input.replace(/[\x00-\x1f\x7f]/g, '');
  const noPath = noControl.replace(/[\\/]+/g, '_');
  const trimmed = noPath.trim().replace(/\.+$/, '').replace(/^\.+/, '');
  const truncated = trimmed.slice(0, MAX_LEN);
  return truncated.length > 0 ? truncated : 'untitled';
}

/**
 * Force the displayed filename to end with the sniffed-type's canonical
 * extension. If the user provided a different extension, replace it.
 */
export function ensureExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${stem}.${ext}`;
}
