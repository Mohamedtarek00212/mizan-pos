import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(name: string, fallback: string): number {
  const value = Number.parseInt(process.env[name] ?? fallback, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function boolean(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '127.0.0.1',
  port: positiveInteger('PORT', '4000'),

  databaseUrl: required('DATABASE_URL', 'postgres://pos_user:pos_password@localhost:55432/pos_db'),
  dbPoolMax: positiveInteger('DB_POOL_MAX', '10'),

  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',

  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  logLevel: process.env.LOG_LEVEL ?? 'info',
  trustProxy: boolean('TRUST_PROXY'),
  loginRateLimitWindowMs: positiveInteger('LOGIN_RATE_LIMIT_WINDOW_MS', '900000'),
  loginRateLimitMax: positiveInteger('LOGIN_RATE_LIMIT_MAX', '10'),
  runMigrationsOnStart: boolean('RUN_MIGRATIONS_ON_START'),
};

export const isProduction = env.nodeEnv === 'production';

if (isProduction) {
  const insecureSecrets = new Set([
    'dev-only-insecure-secret-change-me',
    'change-this-to-a-long-random-secret',
  ]);
  if (env.jwtSecret.length < 32 || insecureSecrets.has(env.jwtSecret)) {
    throw new Error('JWT_SECRET must be a unique production secret of at least 32 characters');
  }
  if (env.corsOrigins.length === 0 || env.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN must contain an explicit production allowlist');
  }
  const databaseUrl = new URL(env.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(env.host)) {
    throw new Error('HOST must be an explicit local or wildcard bind address');
  }
}
