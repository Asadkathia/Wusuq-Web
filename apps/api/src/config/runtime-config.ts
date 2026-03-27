const LOCAL_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

export type RuntimeConfig = {
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  corsAllowedOrigins: string[];
};

export function parseAllowedOrigins(
  raw: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parsed.length > 0) {
    return parsed;
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'CORS_ALLOWED_ORIGINS is required in production (comma-separated origins).',
    );
  }

  return LOCAL_CORS_ORIGINS;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const allowMissingDb =
    process.env.ALLOW_START_WITHOUT_DB === 'true' &&
    process.env.NODE_ENV !== 'production';

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl && !allowMissingDb) {
    throw new Error(
      'Missing required environment variable: DATABASE_URL (or set ALLOW_START_WITHOUT_DB=true for non-production local boot)',
    );
  }

  return {
    databaseUrl: databaseUrl ?? '',
    jwtAccessSecret: getRequiredEnv('JWT_ACCESS_SECRET'),
    jwtRefreshSecret: getRequiredEnv('JWT_REFRESH_SECRET'),
    corsAllowedOrigins: parseAllowedOrigins(
      process.env.CORS_ALLOWED_ORIGINS,
      process.env.NODE_ENV,
    ),
  };
}

