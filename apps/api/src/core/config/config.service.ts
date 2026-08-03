import { Injectable } from '@nestjs/common';
import type { Env } from './env.schema.js';

/**
 * Typed access to validated configuration.
 *
 * Deliberately not `@nestjs/config`: that returns `string | undefined` and pushes casting onto
 * every call site. Here, `config.capacity.warnThreshold` is a `number`, guaranteed, because the
 * process would not have started otherwise.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly env: Env) {}

  get raw(): Readonly<Env> {
    return this.env;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }
  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get role(): Env['APP_ROLE'] {
    return this.env.APP_ROLE;
  }

  get http() {
    return {
      port: this.env.APP_ROLE === 'realtime' ? this.env.REALTIME_PORT : this.env.PORT,
      corsOrigins: this.env.CORS_ORIGINS,
      apiUrl: this.env.API_URL,
      webUrl: this.env.WEB_URL,
    } as const;
  }

  get database() {
    return {
      url: this.env.DATABASE_URL,
      poolMax: this.env.DATABASE_POOL_MAX,
      statementTimeoutMs: this.env.DATABASE_STATEMENT_TIMEOUT_MS,
    } as const;
  }

  get redis() {
    return { url: this.env.REDIS_URL, keyPrefix: this.env.REDIS_KEY_PREFIX } as const;
  }

  get auth() {
    return {
      accessSecret: this.env.JWT_ACCESS_SECRET,
      refreshSecret: this.env.JWT_REFRESH_SECRET,
      accessTtl: this.env.JWT_ACCESS_TTL,
      refreshTtlCustomer: this.env.JWT_REFRESH_TTL_CUSTOMER,
      refreshTtlStaff: this.env.JWT_REFRESH_TTL_STAFF,
      cookieDomain: this.env.COOKIE_DOMAIN,
      cookieSecure: this.env.COOKIE_SECURE,
      csrfSecret: this.env.CSRF_SECRET,
    } as const;
  }

  get otp() {
    return {
      length: this.env.OTP_LENGTH,
      ttlSeconds: this.env.OTP_TTL_SECONDS,
      maxAttempts: this.env.OTP_MAX_ATTEMPTS,
      devBypassCode: this.env.OTP_DEV_BYPASS_CODE,
    } as const;
  }

  get payments() {
    return {
      provider: this.env.PAYMENT_PROVIDER,
      upiPayeeVpa: this.env.UPI_PAYEE_VPA,
      upiPayeeName: this.env.UPI_PAYEE_NAME,
      razorpayKeyId: this.env.RAZORPAY_KEY_ID,
      razorpayKeySecret: this.env.RAZORPAY_KEY_SECRET,
      razorpayWebhookSecret: this.env.RAZORPAY_WEBHOOK_SECRET,
      orderExpiryMinutes: this.env.PAYMENT_ORDER_EXPIRY_MINUTES,
    } as const;
  }

  get store() {
    return {
      timezone: this.env.STORE_TIMEZONE,
      openTime: this.env.STORE_OPEN_TIME,
      closeTime: this.env.STORE_CLOSE_TIME,
      businessDateOffsetHours: this.env.BUSINESS_DATE_OFFSET_HOURS,
    } as const;
  }

  /** ADR-013 — graduated capacity bands. */
  get capacity() {
    return {
      slotMinutes: this.env.CAPACITY_SLOT_MINUTES,
      warnThreshold: this.env.CAPACITY_WARN_THRESHOLD,
      pauseThreshold: this.env.CAPACITY_PAUSE_THRESHOLD,
      overrideTtlMinutes: this.env.CAPACITY_OVERRIDE_TTL_MINUTES,
    } as const;
  }

  /** ADR-004 — GPS assists, the verified address gates. */
  get geo() {
    return {
      strictGpsGating: this.env.FEATURE_STRICT_GPS_GATING,
      fraudFlagDistanceKm: this.env.GPS_FRAUD_FLAG_DISTANCE_KM,
      googleMapsApiKey: this.env.GOOGLE_MAPS_API_KEY,
    } as const;
  }

  get business() {
    return {
      legalName: this.env.BUSINESS_LEGAL_NAME,
      gstin: this.env.BUSINESS_GSTIN,
      fssaiLicense: this.env.BUSINESS_FSSAI_LICENSE,
      placeOfSupply: this.env.BUSINESS_PLACE_OF_SUPPLY,
      address: this.env.BUSINESS_ADDRESS,
    } as const;
  }

  get observability() {
    return {
      logLevel: this.env.LOG_LEVEL,
      sentryDsn: this.env.SENTRY_DSN,
      otelEndpoint: this.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      serviceName: this.env.OTEL_SERVICE_NAME,
    } as const;
  }
}
