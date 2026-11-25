const path = require('path');
const { z } = require('zod');
const { assessSecret } = require('./secretStrength');

// In tests the env is injected by the test setup; never read a developer .env then.
if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
}

const positiveInt = (def) => z.coerce.number().int().positive().default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: positiveInt(7),
  // A rotated refresh token stays usable for this many seconds (concurrent tabs, lost responses).
  // 0 disables the grace period.
  REFRESH_GRACE_SECONDS: z.coerce.number().int().min(0).max(120).default(10),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ADMIN_NAME: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  // Rate limits (per 15 minutes). Rate limiting is off in NODE_ENV=test unless RATE_LIMIT_ENABLED=true.
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).optional(),
  API_RATE_LIMIT_MAX: positiveInt(600),
  AUTH_RATE_LIMIT_MAX: positiveInt(30), // login + register
  REFRESH_RATE_LIMIT_MAX: positiveInt(120), // /auth/refresh per client IP
  REFRESH_TOKEN_RATE_LIMIT_MAX: positiveInt(30), // /auth/refresh per refresh-token cookie
  // API docs. Default: on outside production, off in production unless explicitly enabled.
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  // Public base URL of this API (e.g. https://api.example.com). When unset the spec uses the
  // relative server "/api/v1", i.e. whatever host serves the docs — never a hardcoded host.
  SWAGGER_SERVER_URL: z.string().url().optional(),
  // Optional HTTP Basic gate for the docs (recommended when enabled in production).
  SWAGGER_USER: z.string().optional(),
  SWAGGER_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Issue messages come from the schema above and never contain the offending values.
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;
if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
}

const isProd = env.NODE_ENV === 'production';
const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

// Refuse to boot a production API that still uses local infrastructure or placeholder secrets.
// Messages name the setting and the reason only; they never print values.
if (isProd) {
  const local = /(^|\/\/|@)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([:/]|$)/i;
  const problems = [];
  if (corsOrigins.some((o) => local.test(o))) problems.push('CORS_ORIGIN must not contain localhost in production');
  if (corsOrigins.some((o) => o === '*')) problems.push('CORS_ORIGIN must not be "*" (credentials are used)');
  if (local.test(env.MONGODB_URI)) problems.push('MONGODB_URI must not point at localhost in production');
  if (env.SWAGGER_SERVER_URL && local.test(env.SWAGGER_SERVER_URL)) problems.push('SWAGGER_SERVER_URL must not be localhost in production');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    for (const reason of assessSecret(env[key])) problems.push(`${key} ${reason}`);
  }
  if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
}

const isTest = env.NODE_ENV === 'test';

module.exports = {
  ...env,
  isProd,
  isTest,
  corsOrigins,
  swaggerEnabled: env.SWAGGER_ENABLED ? env.SWAGGER_ENABLED === 'true' : !isProd,
  rateLimitEnabled: env.RATE_LIMIT_ENABLED ? env.RATE_LIMIT_ENABLED === 'true' : !isTest,
  refreshGraceMs: env.REFRESH_GRACE_SECONDS * 1000,
};
