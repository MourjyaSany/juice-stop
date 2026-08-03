import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard.js';

/**
 * Cross-cutting request protection.
 *
 * Registered as an `APP_GUARD` so it runs for every route, but it only acts where a `@Throttle`
 * decorator says so. That ordering is deliberate: opting *in* per endpoint means a new route is
 * never accidentally throttled into uselessness, while the limiter is still impossible to forget
 * to mount.
 */
@Global()
@Module({
  providers: [RateLimitGuard, { provide: APP_GUARD, useClass: RateLimitGuard }],
  exports: [RateLimitGuard],
})
export class SecurityModule {}
