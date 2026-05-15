import { loadRuntimeConfig, parseAllowedOrigins } from './runtime-config';

describe('runtime-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.ALLOW_START_WITHOUT_DB;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses local cors defaults for non-production when unset', () => {
    expect(parseAllowedOrigins(undefined, 'development')).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('throws when cors origins are missing in production', () => {
    expect(() => parseAllowedOrigins(undefined, 'production')).toThrow(
      'CORS_ALLOWED_ORIGINS is required in production',
    );
  });

  it('loads required env vars', () => {
    process.env.DATABASE_URL = 'postgres://example';
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    process.env.CORS_ALLOWED_ORIGINS = 'https://example.com';

    const config = loadRuntimeConfig();

    expect(config.databaseUrl).toBe('postgres://example');
    expect(config.jwtAccessSecret).toBe('access-secret');
    expect(config.jwtRefreshSecret).toBe('refresh-secret');
    expect(config.corsAllowedOrigins).toEqual(['https://example.com']);
  });
});
