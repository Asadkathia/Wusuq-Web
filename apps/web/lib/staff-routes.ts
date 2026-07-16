/** The staff login path. Consumers never link here (spec 2026-07-16, Part 2). */
export const STAFF_LOGIN_PATH = '/staff-portal';

/** Legacy path, kept only as a permanent redirect for existing bookmarks. */
export const LEGACY_STAFF_LOGIN_PATH = '/login';

/**
 * Core guard: is `candidate` a same-origin, staff-side relative path?
 *
 * Shared by every consumer of a staff-side `next` — `staffLoginHref` (we
 * build the href) and `safeNextPath` (an ATTACKER supplies the value via a
 * URL query param). ONE implementation so the two entry points can't drift.
 *
 * Rejects: non-relative/absolute/protocol-relative values, every backslash
 * form a browser's URL parser treats as equivalent to `//` (host-establishing),
 * a percent-encoded `//` bypass, and any `/consumer/...` path (the staff
 * login must not bounce a staff session into the consumer portal).
 */
function isSafeStaffRelativePath(candidate: string): boolean {
  // Best-effort single decode to also catch a percent-encoded bypass
  // (`/%2f%2fevil.test` decodes to `//evil.test`) that a downstream consumer
  // might decode before use. Never throws on malformed percent-encoding.
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // malformed percent-encoding — fall back to the raw string; the checks
    // below still run against `candidate`.
  }

  // Browsers (and the WHATWG URL parser) treat a leading `\` identically to
  // `/` for http/https schemes — `new URL('/\\evil.test', origin)` resolves
  // to host `evil.test`. Reject any backslash outright, raw or decoded,
  // rather than trying to canonicalise every mixed form.
  if (candidate.includes('\\') || decoded.includes('\\')) return false;

  const isRelative =
    candidate.startsWith('/') && !candidate.startsWith('//') && !decoded.startsWith('//');
  if (!isRelative) return false;

  const lower = candidate.toLowerCase();
  const isConsumer = lower === '/consumer' || lower.startsWith('/consumer/');
  return !isConsumer;
}

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
  if (!isSafeStaffRelativePath(next)) return STAFF_LOGIN_PATH;

  const lower = next.toLowerCase();
  const isSelf =
    lower === STAFF_LOGIN_PATH ||
    lower.startsWith(`${STAFF_LOGIN_PATH}/`) ||
    lower === LEGACY_STAFF_LOGIN_PATH ||
    lower.startsWith(`${LEGACY_STAFF_LOGIN_PATH}/`);
  if (isSelf) return STAFF_LOGIN_PATH;

  return `${STAFF_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * Validate an inbound `next` (from a URL query) before it reaches router.replace.
 *
 * `staffLoginHref()` guards hrefs WE build; this guards a value an ATTACKER
 * supplies. Without it, `?next=//evil.test` resolves to a foreign origin and
 * Next's router performs a hard cross-origin navigation — a credential-phishing
 * bounce delivered via an otherwise-legitimate `wusuq.app/staff-portal` link.
 *
 * Deliberately does NOT apply the `staffLoginHref` self-referential-loop
 * check — landing back on the login page post-login is a UX no-op, not a
 * security concern, and this function's caller already defaults to a safe
 * fallback regardless.
 */
export function safeNextPath(candidate: string | null | undefined, fallback: string): string {
  if (typeof candidate !== 'string' || !candidate) return fallback;
  return isSafeStaffRelativePath(candidate) ? candidate : fallback;
}

/**
 * Validate an inbound `next` for the CONSUMER-side login/signup pages.
 *
 * Only a path under `/consumer` is ever valid there. This single prefix
 * check turns out to already be open-redirect-safe by construction: the
 * WHATWG URL parser only starts host (authority) parsing when the character
 * immediately after a leading `/` is ALSO `/` or `\` (the `//`, `/\`, `\/`,
 * `\\` forms). Requiring the literal next four characters to be `cons`
 * rules every one of those forms out — there is no way to satisfy
 * `startsWith('/consumer')` and have the parser treat the value as
 * host-establishing. Centralised here (instead of duplicated inline on both
 * the login and signup pages) so that safety is an intentional, tested
 * invariant rather than an accidental byproduct of an unrelated prefix check.
 */
export function safeConsumerNextPath(candidate: string | null | undefined, fallback: string): string {
  if (typeof candidate !== 'string' || !candidate) return fallback;
  return candidate.startsWith('/consumer') ? candidate : fallback;
}
