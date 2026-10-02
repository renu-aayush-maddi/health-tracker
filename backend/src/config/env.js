import { z } from 'zod';

// Validated once at startup: the process refuses to boot with missing or malformed config.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
  APP_ORIGIN: z.url('APP_ORIGIN must be the frontend URL, e.g. http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(7),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().positive().default(30),
  // brevo/resend send over HTTPS; many hosts block outbound SMTP ports (see README → Email).
  MAIL_PROVIDER: z.enum(['console', 'smtp', 'brevo', 'resend']).default('console'),
  MAIL_FROM: z.string().default('Health Tracker <no-reply@localhost>'),
  SMTP_URL: z.string().optional(),
  MAIL_API_KEY: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
  DISABLE_RATE_LIMITS: z.enum(['true', 'false']).default('false'),
  // cloudinary://<api_key>:<api_secret>@<cloud_name>. Without it, attachments are disabled.
  CLOUDINARY_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .regex(
        /^cloudinary:\/\/[^:]+:[^@]+@.+$/,
        'CLOUDINARY_URL must look like cloudinary://key:secret@cloud',
      )
      .optional(),
  ),
  CLOUDINARY_FOLDER: z
    .string()
    .regex(/^[\w-]+(\/[\w-]+)*$/)
    .default('health-tracker'),
  // "memory" keeps files in process memory: for automated tests only.
  FILE_STORAGE: z.enum(['cloudinary', 'memory']).optional(),
  // 32 random bytes, base64 (openssl rand -base64 32). Needed only by the backup job/CLI.
  BACKUP_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'BACKUP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)',
      })
      .optional(),
  ),
  BACKUP_RETENTION: z.coerce.number().int().min(1).max(365).default(14),
});

function loadConfig() {
  const source = { ...process.env };
  if (source.NODE_ENV === 'test' && source.TEST_DATABASE_URL) {
    source.DATABASE_URL = source.TEST_DATABASE_URL;
  }

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }

  const env = parsed.data;
  if (['brevo', 'resend'].includes(env.MAIL_PROVIDER) && !env.MAIL_API_KEY) {
    throw new Error(
      `Invalid environment configuration:\n  - MAIL_API_KEY is required when MAIL_PROVIDER=${env.MAIL_PROVIDER}`,
    );
  }
  if (env.MAIL_PROVIDER === 'smtp' && !env.SMTP_URL) {
    throw new Error(
      'Invalid environment configuration:\n  - SMTP_URL is required when MAIL_PROVIDER=smtp',
    );
  }

  if (env.NODE_ENV === 'production' && env.DISABLE_RATE_LIMITS === 'true') {
    throw new Error(
      'Invalid environment configuration:\n  - DISABLE_RATE_LIMITS cannot be used in production',
    );
  }

  const fileStorage = env.FILE_STORAGE ?? (env.NODE_ENV === 'test' ? 'memory' : 'cloudinary');
  if (env.NODE_ENV === 'production' && fileStorage === 'memory') {
    throw new Error(
      'Invalid environment configuration:\n  - FILE_STORAGE=memory cannot be used in production',
    );
  }

  return Object.freeze({
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    rateLimitsDisabled: env.DISABLE_RATE_LIMITS === 'true',
    fileStorage,
    attachmentsEnabled: fileStorage === 'memory' || Boolean(env.CLOUDINARY_URL),
    // A secure cookie with the __Host- prefix needs HTTPS, so plain-http dev uses a basic name.
    sessionCookieName: env.NODE_ENV === 'production' ? '__Host-ht_session' : 'ht_session',
  });
}

export const config = loadConfig();
