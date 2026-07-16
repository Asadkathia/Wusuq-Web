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
});
