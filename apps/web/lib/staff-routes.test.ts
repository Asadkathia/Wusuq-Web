import { STAFF_LOGIN_PATH, staffLoginHref } from './staff-routes';

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
