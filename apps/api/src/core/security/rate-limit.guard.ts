import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RateLimitedError } from '../errors/app-error.js';

/**
 * A per-IP sliding window, in memory.
 *
 * There was **no rate limiting anywhere**, which left two endpoints genuinely exposed: `POST
 * /orders` could be driven in a loop to fill the kitchen board with junk tickets, and
 * `/kitchen/auth/login` could be brute-forced against two known usernames at whatever rate the
 * network allowed. Neither needs sophistication to abuse.
 *
 * In memory rather than Redis, deliberately. Redis is optional here by design (`degraded mode`),
 * and a limiter that stops limiting when the cache is down protects nothing on the night it
 * matters. One API process serves one kitchen, so a per-process counter *is* the global counter.
 * When a second process appears this moves to Redis and the decorator does not change.
 *
 * `04-api-spec.md §3` specifies the eventual per-identity limits. These are the per-IP subset that
 * can exist before customer identity does.
 */

export interface RateLimit {
  /** Requests allowed inside the window. */
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'security:rate-limit';
export const Throttle = (limit: number, windowSeconds: number): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowSeconds } satisfies RateLimit);

interface Bucket {
  hits: number[];
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimit | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule === undefined) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientIp(request)}`;
    const now = Date.now();
    const windowMs = rule.windowSeconds * 1000;

    this.sweep(now);

    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((at) => now - at < windowMs);

    if (bucket.hits.length >= rule.limit) {
      this.buckets.set(key, bucket);
      const oldest = bucket.hits[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      throw new RateLimitedError('Too many requests — slow down a moment.', retryAfter);
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }

  /**
   * Drop cold buckets occasionally.
   *
   * Without this the map grows one entry per IP per endpoint forever, which is a slow memory leak
   * on a process that is meant to run all night. Swept on a timer rather than per request so the
   * cost does not land on the hot path.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.hits.every((at) => now - at > 3_600_000)) this.buckets.delete(key);
    }
  }
}

/**
 * The caller's address.
 *
 * `X-Forwarded-For` is honoured because this sits behind a Cloudflare tunnel in every deployment
 * that matters, and without it every request would share one bucket — turning the limiter into a
 * global outage the first time anybody hit a limit. It is spoofable by a direct caller, which is
 * why this is a nuisance limiter and not an access control.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
