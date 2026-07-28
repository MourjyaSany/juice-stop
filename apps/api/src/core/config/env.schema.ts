import { z } from 'zod';

/**
 * Environment contract.
 *
 * The API validates this at boot and **refuses to start** if anything is missing or malformed.
 * Failing loudly at 18:00 during a deploy is cheap; discovering a missing secret at 23:30 when
 * the kitchen is full is not.
 */

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const port = z.coerce.number().int().min(1).max(65_535);
const csv = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

export const envSchema = z
  .object({
    // ── Runtime ────────────────────────────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    APP_ROLE: z.enum(['api', 'realtime', 'worker']).default('api'),
    PORT: port.default(3000),
    REALTIME_PORT: port.default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // ── URLs ───────────────────────────────────────────────────────────────────────────────────
    API_URL: z.string().url(),
    WEB_URL: z.string().url(),
    KITCHEN_URL: z.string().url().optional(),
    RIDER_URL: z.string().url().optional(),
    ADMIN_URL: z.string().url().optional(),
    CORS_ORIGINS: csv,

    // ── Data ───────────────────────────────────────────────────────────────────────────────────
    // Accepts a SQLite path (`file:./dev.db`) as well as a server URL, so the same schema works
    // whether the database is a local file or managed Postgres.
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((v) => v.startsWith('file:') || /^[a-z]+:\/\//.test(v), {
        message: 'DATABASE_URL must be a file: path or a scheme://host URL',
      }),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    REDIS_URL: z.string().url(),
    REDIS_KEY_PREFIX: z.string().default('js'),

    // ── Auth ───────────────────────────────────────────────────────────────────────────────────
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('10m'),
    JWT_REFRESH_TTL_CUSTOMER: z.string().default('30d'),
    JWT_REFRESH_TTL_STAFF: z.string().default('12h'),
    COOKIE_DOMAIN: z.string().default('localhost'),
    COOKIE_SECURE: bool.default(false),
    CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),

    // ── OTP ────────────────────────────────────────────────────────────────────────────────────
    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    OTP_DEV_BYPASS_CODE: z.string().optional(),

    // ── Payments ───────────────────────────────────────────────────────────────────────────────
    RAZORPAY_KEY_ID: z.string(),
    RAZORPAY_KEY_SECRET: z.string(),
    RAZORPAY_WEBHOOK_SECRET: z.string(),
    PAYMENT_ORDER_EXPIRY_MINUTES: z.coerce.number().int().positive().default(10),

    // ── Store ──────────────────────────────────────────────────────────────────────────────────
    STORE_TIMEZONE: z.string().default('Asia/Kolkata'),
    STORE_OPEN_TIME: z.string().regex(/^\d{2}:\d{2}$/).default('19:00'),
    STORE_CLOSE_TIME: z.string().regex(/^\d{2}:\d{2}$/).default('04:00'),
    BUSINESS_DATE_OFFSET_HOURS: z.coerce.number().int().min(0).max(12).default(5),

    // ── Capacity (ADR-013) ─────────────────────────────────────────────────────────────────────
    CAPACITY_SLOT_MINUTES: z.coerce.number().int().positive().default(10),
    CAPACITY_WARN_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
    CAPACITY_PAUSE_THRESHOLD: z.coerce.number().min(0).max(1).default(1),
    CAPACITY_OVERRIDE_TTL_MINUTES: z.coerce.number().int().positive().default(30),

    // ── Geo (ADR-004) ──────────────────────────────────────────────────────────────────────────
    FEATURE_STRICT_GPS_GATING: bool.default(false),
    GPS_FRAUD_FLAG_DISTANCE_KM: z.coerce.number().positive().default(3),
    GOOGLE_MAPS_API_KEY: z.string().optional(),

    // ── Media ──────────────────────────────────────────────────────────────────────────────────
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('ap-south-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(false),

    // ── Notifications ──────────────────────────────────────────────────────────────────────────
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: port.optional(),
    SMTP_SECURE: bool.default(false),
    MAIL_FROM: z.string().default('Juice Stop <orders@juicestop.in>'),

    // ── Observability ──────────────────────────────────────────────────────────────────────────
    SENTRY_DSN: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().default('juice-stop-api'),

    // ── Business identity ──────────────────────────────────────────────────────────────────────
    BUSINESS_LEGAL_NAME: z.string().default('Juice Stop'),
    BUSINESS_GSTIN: z.string().optional(),
    BUSINESS_FSSAI_LICENSE: z.string().optional(),
    BUSINESS_PLACE_OF_SUPPLY: z.string().default('33'),
    BUSINESS_ADDRESS: z.string().optional(),
  })
  /**
   * Guard: live payment credentials must never be reachable outside production.
   * A test order against a live key is real money leaving a real account.
   */
  .refine(
    (env) => env.NODE_ENV === 'production' || !env.RAZORPAY_KEY_ID.startsWith('rzp_live_'),
    {
      message:
        'A live Razorpay key (rzp_live_*) is present outside production. Refusing to start — ' +
        'this would take real money in a non-production environment.',
      path: ['RAZORPAY_KEY_ID'],
    },
  )
  /** Guard: the OTP dev bypass must never exist in production. */
  .refine((env) => env.NODE_ENV !== 'production' || !env.OTP_DEV_BYPASS_CODE, {
    message: 'OTP_DEV_BYPASS_CODE must not be set in production — it bypasses phone verification.',
    path: ['OTP_DEV_BYPASS_CODE'],
  })
  /** Guard: cookies must be Secure in production, or sessions are stealable over plain HTTP. */
  .refine((env) => env.NODE_ENV !== 'production' || env.COOKIE_SECURE, {
    message: 'COOKIE_SECURE must be true in production.',
    path: ['COOKIE_SECURE'],
  })
  /** Guard: the business-date cutover must sit after closing time, or a night splits in two. */
  .refine(
    (env) => {
      const closeHour = Number(env.STORE_CLOSE_TIME.split(':')[0]);
      return env.BUSINESS_DATE_OFFSET_HOURS >= closeHour;
    },
    {
      message:
        'BUSINESS_DATE_OFFSET_HOURS must be >= the closing hour, otherwise a single night of ' +
        'trading is split across two business dates (ADR-010).',
      path: ['BUSINESS_DATE_OFFSET_HOURS'],
    },
  )
  /** Guard: warn threshold must sit below the pause threshold. */
  .refine((env) => env.CAPACITY_WARN_THRESHOLD < env.CAPACITY_PAUSE_THRESHOLD, {
    message: 'CAPACITY_WARN_THRESHOLD must be below CAPACITY_PAUSE_THRESHOLD (ADR-013).',
    path: ['CAPACITY_WARN_THRESHOLD'],
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate `process.env`.
 * Throws a single readable error listing every problem, rather than one at a time.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  · ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }

  return result.data;
}
