import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  STAFF_LOGIN_PATH,
  staffLoginHref,
  safeNextPath,
  safeConsumerNextPath,
  landingPathFor,
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

describe('legacy /login redirect is wired to staffLoginHref (source-level)', () => {
  const body = readFileSync(join(WEB, 'app/login/page.tsx'), 'utf8');

  it('imports staffLoginHref from the shared guard module', () => {
    expect(body).toMatch(/import\s*\{[^}]*staffLoginHref[^}]*\}\s*from\s*['"]@\/lib\/staff-routes['"]/);
  });

  it('passes the resolved next searchParam into staffLoginHref, not a raw value', () => {
    // The binding constraint is "old /login MUST preserve ?next=" — assert
    // the redirect call actually threads the derived `next` through, not
    // just that staffLoginHref appears somewhere in the file.
    expect(body).toMatch(/redirect\(staffLoginHref\(next\)\)/);
  });

  it('handles a duplicated ?next= query param (string[] from searchParams)', () => {
    // Next.js hands back an array when a query key repeats
    // (?next=/a&next=/b); the page must pick the first entry rather than
    // stringifying/crashing on the array.
    expect(body).toMatch(/Array\.isArray\(raw\)\s*\?\s*raw\[0\]\s*:\s*raw/);
  });
});

describe('landingPathFor (pure decision behind the app/page.tsx default-landing redirect)', () => {
  it('no token / no stored user -> consumer login (unknown visitor)', () => {
    expect(landingPathFor('', false)).toBe('/consumer/login');
  });

  it('expired token, unknown role -> consumer login', () => {
    expect(landingPathFor('', false)).toBe('/consumer/login');
  });

  it('expired token, known staff role -> staff login (not silently dropped to consumer)', () => {
    expect(landingPathFor('admin', false)).toBe(STAFF_LOGIN_PATH);
  });

  it('expired token, consumer-class role -> consumer login', () => {
    expect(landingPathFor('consumer', false)).toBe('/consumer/login');
  });

  it('no stored user, valid token -> /dashboard (default, not consumer)', () => {
    expect(landingPathFor('', true)).toBe('/dashboard');
  });

  it('corrupt JSON (caller normalises to role="") , valid token -> /dashboard', () => {
    expect(landingPathFor('', true)).toBe('/dashboard');
  });

  it.each(['consumer', 'lawyer', 'company'])('%s role, valid token -> /consumer/dashboard', (role) => {
    expect(landingPathFor(role, true)).toBe('/consumer/dashboard');
  });

  it('representative role, valid token -> /dashboard (clerk view)', () => {
    expect(landingPathFor('representative', true)).toBe('/dashboard');
  });

  it('staff role, valid token -> /dashboard', () => {
    expect(landingPathFor('admin', true)).toBe('/dashboard');
  });
});

describe('open-redirect regression: post-slash tab/LF/CR (finding 1)', () => {
  // WHATWG URL strips ASCII tab/LF/CR before parsing, so `/\t/evil.test`
  // resolves to host `evil.test`. Assert on the resolved ORIGIN, not on
  // string equality against the attack payload — string equality is
  // exactly what let three prior bypasses (`//`, `/\`, now this) through
  // undetected, because each fix only covered the one shape it was shown.
  const ORIGIN_BASE = 'https://wusuq.app/staff-portal';
  const SAME_ORIGIN = 'https://wusuq.app';
  const FALLBACK = '/dashboard';

  const ATTACKS = [
    '/\t/evil.test',
    '/\n/evil.test',
    '/\r/evil.test',
    '/\t\t//evil.test',
    '/%09/evil.test',
    '/%0A/evil.test',
  ];

  it.each(ATTACKS)('safeNextPath(%j) resolves same-origin (falls back)', (attack) => {
    const result = safeNextPath(attack, FALLBACK);
    expect(new URL(result, ORIGIN_BASE).origin).toBe(SAME_ORIGIN);
    expect(result).toBe(FALLBACK);
  });

  it.each(ATTACKS)('staffLoginHref(%j) resolves same-origin (falls back)', (attack) => {
    const result = staffLoginHref(attack);
    expect(new URL(result, ORIGIN_BASE).origin).toBe(SAME_ORIGIN);
    expect(result).toBe(STAFF_LOGIN_PATH);
  });

  it.each(ATTACKS)('safeConsumerNextPath(%j) resolves same-origin (falls back)', (attack) => {
    const fallback = '/consumer/dashboard';
    const result = safeConsumerNextPath(attack, fallback);
    expect(new URL(result, ORIGIN_BASE).origin).toBe(SAME_ORIGIN);
    expect(result).toBe(fallback);
  });

  it('legitimate paths still resolve same-origin and are NOT over-blocked', () => {
    const legit = [
      '/tickets',
      '/finance?tab=a&x=1',
      '/consumerX/dashboard',
      '/search?q=100%25off',
    ];
    for (const path of legit) {
      const result = safeNextPath(path, FALLBACK);
      expect(new URL(result, ORIGIN_BASE).origin).toBe(SAME_ORIGIN);
      expect(result).toBe(path);
    }
  });
});
