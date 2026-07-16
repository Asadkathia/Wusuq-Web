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
  if (!next) return STAFF_LOGIN_PATH;
  const isRelative = next.startsWith('/') && !next.startsWith('//');
  const isConsumer = next === '/consumer' || next.startsWith('/consumer/');
  const isSelf = next === STAFF_LOGIN_PATH || next === LEGACY_STAFF_LOGIN_PATH;
  if (!isRelative || isConsumer || isSelf) return STAFF_LOGIN_PATH;
  return `${STAFF_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
