/** The staff login path. Consumers never link here (spec 2026-07-16, Part 2). */
export const STAFF_LOGIN_PATH = '/staff-portal';

/** Legacy path, kept only as a permanent redirect for existing bookmarks. */
export const LEGACY_STAFF_LOGIN_PATH = '/login';

/**
 * Build the staff login href, carrying a validated `next` for post-login bounce-back.
 *
 * `next` is dropped unless it is a same-origin, staff-side path. An unvalidated
 * `next` would be an open redirect; a consumer-side or self-referential `next`
 * would bounce the user to the wrong portal or loop.
 */
export function staffLoginHref(next?: string | null): string {
  // Fail closed on anything that isn't a real string (this is a security
  // boundary — never throw, just drop to the safe bare path).
  if (typeof next !== 'string' || !next) return STAFF_LOGIN_PATH;

  // Best-effort single decode to also catch a percent-encoded bypass
  // (`/%2f%2fevil.test` decodes to `//evil.test`) that a downstream consumer
  // might decode before use. Never throws on malformed percent-encoding.
  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    // malformed percent-encoding — fall back to the raw string; the checks
    // below still run against `next`.
  }

  // Browsers (and the WHATWG URL parser) treat a leading `\` identically to
  // `/` for http/https schemes — `new URL('/\\evil.test', origin)` resolves
  // to host `evil.test`. Reject any backslash outright, raw or decoded,
  // rather than trying to canonicalise every mixed form.
  if (next.includes('\\') || decoded.includes('\\')) return STAFF_LOGIN_PATH;

  const isRelative =
    next.startsWith('/') && !next.startsWith('//') && !decoded.startsWith('//');
  const lower = next.toLowerCase();
  const isConsumer = lower === '/consumer' || lower.startsWith('/consumer/');
  const isSelf =
    lower === STAFF_LOGIN_PATH ||
    lower.startsWith(`${STAFF_LOGIN_PATH}/`) ||
    lower === LEGACY_STAFF_LOGIN_PATH ||
    lower.startsWith(`${LEGACY_STAFF_LOGIN_PATH}/`);
  if (!isRelative || isConsumer || isSelf) return STAFF_LOGIN_PATH;
  return `${STAFF_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
