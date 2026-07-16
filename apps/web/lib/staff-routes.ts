/** The staff login path. Consumers never link here (spec 2026-07-16, Part 2). */
export const STAFF_LOGIN_PATH = '/staff-portal';

/** Legacy path, kept only as a permanent redirect for existing bookmarks. */
export const LEGACY_STAFF_LOGIN_PATH = '/login';

/**
 * Sentinel origin used only to ask "does this candidate resolve off-site?".
 * Never rendered or navigated to — it exists purely as a fixed point of
 * comparison for `resolvesSameOrigin`.
 */
const SENTINEL_ORIGIN = 'https://wusuq-safe-next.invalid';

/**
 * Resolve `candidate` with the SAME parser a real navigation uses
 * (`new URL`, exactly what `router.replace` / an `<a href>` rely on) and ask
 * whether the result stays on our sentinel origin.
 *
 * This guard has been bypassed three times by adding one more string pattern
 * each time (bare `//`, then `/\`, then an embedded TAB). That is a losing
 * race against a spec-defined parser: the WHATWG URL parser strips ASCII
 * tab/LF/CR before parsing (URL Standard, basic URL parser step 1), so
 * `/\t/evil.test` silently becomes `//evil.test` -> host `evil.test`, and
 * `URLSearchParams` hands an attacker that literal tab byte for free via
 * `%09`. Rather than enumerate the next byte a parser might treat as
 * host-establishing, defer to the actual parser and check its output.
 */
function resolvesSameOrigin(candidate: string): boolean {
  try {
    const resolved = new URL(candidate, `${SENTINEL_ORIGIN}/staff-portal`);
    return resolved.origin === SENTINEL_ORIGIN;
  } catch {
    return false; // unparseable candidate — fail closed, never "safe".
  }
}

/**
 * Core guard: is `candidate` a same-origin, staff-side relative path?
 *
 * Shared by every consumer of a staff-side `next` — `staffLoginHref` (we
 * build the href) and `safeNextPath` (an ATTACKER supplies the value via a
 * URL query param). ONE implementation so the two entry points can't drift.
 *
 * Rejects: non-relative/absolute/protocol-relative values, every form a
 * browser's URL parser treats as host-establishing (bare `//`, any
 * backslash form, embedded TAB/LF/CR — via the parser-based
 * `resolvesSameOrigin` check below, not a hardcoded pattern list), a
 * percent-encoded version of any of the above, and any `/consumer/...` path
 * (the staff login must not bounce a staff session into the consumer
 * portal).
 */
function isSafeStaffRelativePath(candidate: string): boolean {
  if (typeof candidate !== 'string' || candidate === '') return false;
  if (!candidate.startsWith('/')) return false;

  // Defence in depth: some non-WHATWG consumers (older embedded webviews,
  // hand-rolled path joiners) treat a leading backslash like a forward
  // slash even where the URL spec doesn't demand it. Reject the raw byte
  // outright instead of relying solely on parser semantics for it.
  if (candidate.includes('\\')) return false;

  // The core check: does the SAME parser that will consume this value keep
  // it on our origin? This single structural test replaces the old
  // (and repeatedly-bypassed) growing list of string patterns.
  if (!resolvesSameOrigin(candidate)) return false;

  // A downstream consumer may percent-decode once before use (this is
  // exactly how the historical `/%2f%2fevil.test` bypass worked). Re-run
  // the same parser-based check against a single decode pass so an encoded
  // slash or control character can't slip through where the raw string
  // looked safe. Malformed percent-encoding is not itself a bypass shape —
  // fall back to the raw (already-validated) string rather than rejecting.
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // malformed percent-encoding — `decoded` stays `=== candidate`, so the
    // block below is a no-op and we fall through to the consumer-path check.
  }
  if (decoded !== candidate) {
    if (decoded.includes('\\')) return false;
    if (!decoded.startsWith('/')) return false;
    if (!resolvesSameOrigin(decoded)) return false;
  }

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

/** Consumer-class roles, mirrored from the copies scattered across the web app. */
const CONSUMER_ROLES = ['consumer', 'lawyer', 'company'];

/**
 * Pure decision function behind `app/page.tsx`'s default-landing redirect
 * (spec 2026-07-16, Part 2: "unknown visitor -> /consumer/login; only a
 * KNOWN staff role -> /staff-portal"). Extracted so the rule is unit-testable
 * outside a client-component `useEffect`, which this repo's node-env Jest
 * can't execute.
 *
 * `role` is the stored user's role, or `''` for "no stored user" / "couldn't
 * parse the stored user" (the caller normalises both to `''`).
 * `hasValidToken` is `token present && not expired` — the caller owns
 * reading `localStorage` and JWT-expiry parsing; this function has no
 * browser dependency at all.
 */
export function landingPathFor(role: string, hasValidToken: boolean): string {
  const isConsumer = CONSUMER_ROLES.includes(role);
  const isRepresentative = role === 'representative';
  const isKnownStaff = role !== '' && !isConsumer;

  if (!hasValidToken) {
    // Unknown/expired session: unknown visitors go to the consumer door;
    // only a recognised staff-shaped role bounces to the staff door.
    return isKnownStaff ? STAFF_LOGIN_PATH : '/consumer/login';
  }

  // Representatives (clerks) land on /dashboard, which renders their own
  // clerk view (earnings + metrics) backed by /dashboard/clerk-summary.
  if (isRepresentative) return '/dashboard';

  return isConsumer ? '/consumer/dashboard' : '/dashboard';
}
