import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  STAFF_LOGIN_PATH,
  staffLoginHref,
  safeNextPath,
  safeConsumerNextPath,
} from './staff-routes';

const currentDir = dirname(fileURLToPath(import.meta.url));
const WEB = join(currentDir, '..');

describe('STAFF_LOGIN_PATH', () => {
  it('is /staff-portal', () => {
    expect(STAFF_LOGIN_PATH).toBe('/staff-portal');
  });
});

describe('staffLoginHref', () => {
  it('returns the bare path when there is no next', () => {
    expect(staffLoginHref()).toBe('/staff-portal');
    expect(staffLoginHref(null)).toBe('/staff-portal');
    expect(staffLoginHref('')).toBe('/staff-portal');
  });

  it('appends an encoded next', () => {
    expect(staffLoginHref('/tickets')).toBe('/staff-portal?next=%2Ftickets');
    expect(staffLoginHref('/finance?tab=a')).toBe('/staff-portal?next=%2Ffinance%3Ftab%3Da');
  });

  it('drops a consumer-side next (staff login must not bounce to /consumer)', () => {
    expect(staffLoginHref('/consumer/dashboard')).toBe('/staff-portal');
  });

  it('drops an absolute or protocol-relative next (open-redirect guard)', () => {
    expect(staffLoginHref('https://evil.test/x')).toBe('/staff-portal');
    expect(staffLoginHref('//evil.test/x')).toBe('/staff-portal');
    expect(staffLoginHref('javascript:alert(1)')).toBe('/staff-portal');
  });

  it('drops a next that is the login path itself (no redirect loop)', () => {
    expect(staffLoginHref('/staff-portal')).toBe('/staff-portal');
    expect(staffLoginHref('/login')).toBe('/staff-portal');
  });

  it('drops a backslash open-redirect bypass (browsers treat \\ like / for http/https)', () => {
    // '/' + a single backslash + 'evil.test' — new URL('/\\evil.test', origin)
    // resolves to host evil.test in every major browser.
    expect(staffLoginHref('/\\evil.test')).toBe('/staff-portal');
    // two backslashes, no leading slash.
    expect(staffLoginHref('\\\\evil.test')).toBe('/staff-portal');
    // '/' + two backslashes.
    expect(staffLoginHref('/\\\\evil.test')).toBe('/staff-portal');
    // '/' + backslash + '/' — a mixed form.
    expect(staffLoginHref('/\\/evil.test')).toBe('/staff-portal');
  });

  it('fails closed (does not throw) on non-string input', () => {
    expect(staffLoginHref(123 as unknown as string)).toBe('/staff-portal');
    expect(staffLoginHref({} as unknown as string)).toBe('/staff-portal');
    expect(staffLoginHref(['/tickets'] as unknown as string)).toBe('/staff-portal');
  });

  it('drops a consumer-side next case-insensitively', () => {
    expect(staffLoginHref('/CONSUMER/dashboard')).toBe('/staff-portal');
    expect(staffLoginHref('/Consumer')).toBe('/staff-portal');
  });

  it('does not over-block a legitimate staff path that merely starts with "consumer"', () => {
    expect(staffLoginHref('/consumerX/dashboard')).toBe(
      '/staff-portal?next=%2FconsumerX%2Fdashboard',
    );
  });

  it('drops any sub-path of the login paths, case-insensitively (no redirect loop)', () => {
    expect(staffLoginHref('/staff-portal/x')).toBe('/staff-portal');
    expect(staffLoginHref('/staff-portal/')).toBe('/staff-portal');
    expect(staffLoginHref('/LOGIN')).toBe('/staff-portal');
    expect(staffLoginHref('/Login/foo')).toBe('/staff-portal');
  });

  it('drops a percent-encoded protocol-relative bypass (decodes to //evil.test)', () => {
    expect(staffLoginHref('/%2f%2fevil.test')).toBe('/staff-portal');
  });

  it('drops a next with a whitespace/control-char prefix (not a valid relative path)', () => {
    expect(staffLoginHref('\t//evil.test')).toBe('/staff-portal');
    expect(staffLoginHref('\n/consumer')).toBe('/staff-portal');
  });

  it('does not throw on malformed percent-encoding (falls back to raw-string checks)', () => {
    // decodeURIComponent('/%') throws; the function must catch it and still
    // return a safe result rather than propagating the exception. It is not
    // an open-redirect shape, so it is allowed through, correctly encoded.
    expect(staffLoginHref('/%')).toBe('/staff-portal?next=%2F%25');
    expect(staffLoginHref('/%tickets')).toBe('/staff-portal?next=%2F%25tickets');
  });
});

describe('safeNextPath (inbound guard — the live open-redirect fix)', () => {
  const FALLBACK = '/dashboard';

  it('drops every open-redirect shape, falling back', () => {
    expect(safeNextPath('//evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('/\\evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('\\\\evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('/\\\\evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('/\\/evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('https://evil.test/x', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('javascript:alert(1)', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('/%2f%2fevil.test', FALLBACK)).toBe(FALLBACK);
  });

  it('drops a consumer-side next, case-insensitively', () => {
    expect(safeNextPath('/consumer/dashboard', FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('/CONSUMER/dashboard', FALLBACK)).toBe(FALLBACK);
  });

  it('fails closed (does not throw) on non-string / nullish / empty input', () => {
    expect(safeNextPath(123 as unknown as string, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath({} as unknown as string, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeNextPath('', FALLBACK)).toBe(FALLBACK);
  });

  it('preserves legitimate staff paths, unmodified', () => {
    expect(safeNextPath('/tickets', FALLBACK)).toBe('/tickets');
    expect(safeNextPath('/finance?tab=a&x=1', FALLBACK)).toBe('/finance?tab=a&x=1');
    // A real staff path that merely starts with the substring "consumer" —
    // must NOT be over-blocked by the consumer-prefix guard.
    expect(safeNextPath('/consumerX/dashboard', FALLBACK)).toBe('/consumerX/dashboard');
    expect(safeNextPath('/search?q=100%25off', FALLBACK)).toBe('/search?q=100%25off');
  });
});

describe('safeConsumerNextPath (inbound guard — consumer login/signup)', () => {
  const FALLBACK = '/consumer/dashboard';

  it('preserves a real consumer path', () => {
    expect(safeConsumerNextPath('/consumer/wallet', FALLBACK)).toBe('/consumer/wallet');
  });

  it('drops anything not under /consumer, falling back', () => {
    expect(safeConsumerNextPath('/dashboard', FALLBACK)).toBe(FALLBACK);
    expect(safeConsumerNextPath('https://evil.test/x', FALLBACK)).toBe(FALLBACK);
  });

  it('is safe against every open-redirect shape by construction (verifies the reasoning, not just the behaviour)', () => {
    // None of these can ever satisfy startsWith('/consumer') — the character
    // immediately after the leading '/' must be 'c', which rules out every
    // form (//, /\, \/, \\) a browser's URL parser treats as host-establishing.
    expect(safeConsumerNextPath('//evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeConsumerNextPath('/\\evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeConsumerNextPath('\\\\evil.test', FALLBACK)).toBe(FALLBACK);
    expect(safeConsumerNextPath('javascript:alert(1)', FALLBACK)).toBe(FALLBACK);
  });

  it('fails closed on non-string / nullish / empty input', () => {
    expect(safeConsumerNextPath(null, FALLBACK)).toBe(FALLBACK);
    expect(safeConsumerNextPath(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeConsumerNextPath('', FALLBACK)).toBe(FALLBACK);
  });
});

describe('staff-portal next-param guard is wired to safeNextPath (source-level)', () => {
  const body = readFileSync(join(WEB, 'app/staff-portal/page.tsx'), 'utf8');

  it('imports and calls safeNextPath', () => {
    expect(body).toMatch(/import\s*\{[^}]*safeNextPath[^}]*\}\s*from\s*['"]@\/lib\/staff-routes['"]/);
    expect(body).toContain('safeNextPath(');
  });

  it('no longer contains the raw inline open-redirect check', () => {
    // This is the exact shape of the vulnerable inline check the fix
    // replaced. If the page is ever reverted to it, this assertion fails.
    expect(body).not.toMatch(/candidate\.startsWith\(['"]\/['"]\)/);
  });
});

describe('no source links to the legacy /login path', () => {
  const FILES = [
    'app/page.tsx',
    'components/topbar.tsx',
    'components/finance-board.tsx',
    'components/portal-auth-guard.tsx',
    'app/(auth)/consumer/login/page.tsx',
  ];

  it.each(FILES)('%s does not reference /login', (rel) => {
    const body = readFileSync(join(WEB, rel), 'utf8');
    expect(body).not.toMatch(/["'`]\/login\b/);
  });

  it('the consumer login page has no staff link at all', () => {
    const body = readFileSync(join(WEB, 'app/(auth)/consumer/login/page.tsx'), 'utf8');
    expect(body).not.toContain('staff-portal');
    expect(body.toLowerCase()).not.toContain('staff login');
  });

  it('the staff login page no longer links to the consumer portal', () => {
    const body = readFileSync(join(WEB, 'app/staff-portal/page.tsx'), 'utf8');
    expect(body).not.toContain('/consumer/login');
    expect(body.toLowerCase()).not.toContain('client portal');
  });
});
