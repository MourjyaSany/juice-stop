import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.schema.js';

/** A complete, valid development environment. Each test perturbs exactly one field. */
const VALID = {
  NODE_ENV: 'development',
  APP_ROLE: 'api',
  PORT: '3000',
  API_URL: 'http://localhost:3000',
  WEB_URL: 'http://localhost:3100',
  CORS_ORIGINS: 'http://localhost:3100,http://localhost:3101',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  RAZORPAY_KEY_ID: 'rzp_test_abc',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsecret',
  STORE_CLOSE_TIME: '04:00',
  BUSINESS_DATE_OFFSET_HOURS: '5',
  CAPACITY_WARN_THRESHOLD: '0.80',
  CAPACITY_PAUSE_THRESHOLD: '1.00',
} satisfies NodeJS.ProcessEnv;

const env = (overrides: Record<string, string | undefined> = {}) =>
  parseEnv({ ...VALID, ...overrides } as NodeJS.ProcessEnv);

describe('environment validation', () => {
  it('accepts a valid development environment and applies defaults', () => {
    const parsed = env();
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.CORS_ORIGINS).toEqual(['http://localhost:3100', 'http://localhost:3101']);
    expect(parsed.OTP_LENGTH).toBe(6);
    expect(parsed.CAPACITY_WARN_THRESHOLD).toBe(0.8);
  });

  it('coerces numeric and boolean strings to real types', () => {
    const parsed = env({ PORT: '4000', COOKIE_SECURE: 'true', FEATURE_STRICT_GPS_GATING: '1' });
    expect(parsed.PORT).toBe(4000);
    expect(parsed.COOKIE_SECURE).toBe(true);
    expect(parsed.FEATURE_STRICT_GPS_GATING).toBe(true);
  });

  it('reports every problem at once rather than one per restart', () => {
    expect(() => env({ JWT_ACCESS_SECRET: 'short', DATABASE_URL: 'not-a-url' })).toThrow(
      /JWT_ACCESS_SECRET[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/,
    );
  });
});

describe('production safety guards — each of these prevents a real incident', () => {
  const prod = (overrides: Record<string, string | undefined> = {}) =>
    env({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      OTP_DEV_BYPASS_CODE: undefined,
      ...overrides,
    });

  it('REFUSES to start with a LIVE Razorpay key outside production', () => {
    // A test order against a live key is real money leaving a real account.
    expect(() => env({ RAZORPAY_KEY_ID: 'rzp_live_realkey' })).toThrow(/live Razorpay key/i);
  });

  it('permits a live Razorpay key in production', () => {
    expect(() => prod({ RAZORPAY_KEY_ID: 'rzp_live_realkey' })).not.toThrow();
  });

  it('REFUSES to start with the OTP bypass enabled in production', () => {
    // The bypass skips phone verification entirely — free accounts, unverifiable deliveries.
    expect(() => prod({ OTP_DEV_BYPASS_CODE: '000000' })).toThrow(/OTP_DEV_BYPASS_CODE/);
  });

  it('REFUSES to start with insecure cookies in production', () => {
    // Without Secure, a session cookie travels over plain HTTP and is trivially stealable.
    expect(() => prod({ COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
  });

  it('REFUSES a business-date offset that would split a night across two dates (ADR-010)', () => {
    // Closing at 04:00 with a 3-hour offset puts the cutover at 03:00 — mid-service. Every
    // financial report would silently split one night's takings in two.
    expect(() => env({ STORE_CLOSE_TIME: '04:00', BUSINESS_DATE_OFFSET_HOURS: '3' })).toThrow(
      /BUSINESS_DATE_OFFSET_HOURS/,
    );
    expect(() => env({ STORE_CLOSE_TIME: '04:00', BUSINESS_DATE_OFFSET_HOURS: '5' })).not.toThrow();
  });

  it('REFUSES capacity thresholds that would pause before warning (ADR-013)', () => {
    expect(() =>
      env({ CAPACITY_WARN_THRESHOLD: '1.00', CAPACITY_PAUSE_THRESHOLD: '0.80' }),
    ).toThrow(/CAPACITY_WARN_THRESHOLD/);
  });

  it('enforces minimum secret lengths', () => {
    expect(() => env({ JWT_ACCESS_SECRET: 'tooshort' })).toThrow(/at least 32 characters/);
    expect(() => env({ CSRF_SECRET: 'tooshort' })).toThrow(/at least 32 characters/);
  });
});
