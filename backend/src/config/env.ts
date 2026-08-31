import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: optionalNumber('PORT', 4000),
  clientOrigin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL'),

  sessionSecret: required('SESSION_SECRET'),
  sessionTtlMs: optionalNumber('SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1000),

  maxMessages: optionalNumber('MAX_MESSAGES', 5_000_000),
  retentionBatchSize: optionalNumber('RETENTION_BATCH_SIZE', 500),
  retentionCheckInterval: optionalNumber('RETENTION_CHECK_INTERVAL', 50),

  users: {
    user1: {
      email: required('USER1_EMAIL').toLowerCase(),
      password: required('USER1_PASSWORD'),
      name: required('USER1_NAME'),
    },
    user2: {
      email: required('USER2_EMAIL').toLowerCase(),
      password: required('USER2_PASSWORD'),
      name: required('USER2_NAME'),
    },
  },
};

// Fail fast at boot if secrets look weak/default in production.
if (env.isProduction && env.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production');
}
