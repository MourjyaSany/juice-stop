import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../core/config/config.service.js';
import { ErrorCode, UnauthorizedError } from '../../core/errors/app-error.js';

/**
 * ⚠️  DEVELOPMENT AUTHENTICATION — REPLACE BEFORE PRODUCTION  ⚠️
 *
 * This file is the *entire* authentication surface for the kitchen dashboard. That is the point:
 * when the real identity module lands, swapping it means reimplementing `verifyCredentials` and
 * `issueToken` here and changing nothing anywhere else. No route, guard or component knows what a
 * cook's password is, and none of them should.
 *
 * What is deliberately real even though the credentials are not:
 *   · The token is a signed, expiring HMAC — not a magic string. A fake session that cannot
 *     expire or be forged teaches the wrong shape and tends to survive into production.
 *   · The password comparison is constant-time, so the dev path does not model a timing leak.
 *   · Production boot **refuses to start** with these credentials enabled. A dev backdoor that
 *     merely warns is a dev backdoor that ships.
 */

/** The only account, and only outside production. */
const DEV_USERNAME = 'cook';
const DEV_PASSWORD = 'cook123';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface KitchenSession {
  username: string;
  role: 'KITCHEN';
  expiresAt: string;
}

@Injectable()
export class KitchenAuthService implements OnModuleInit {
  private readonly logger = new Logger(KitchenAuthService.name);

  /**
   * Signing key. Falls back to a per-boot random secret so a forgotten env var yields tokens that
   * die on restart rather than tokens signed with a predictable constant.
   */
  private readonly secret: string;

  constructor(private readonly config: AppConfigService) {
    this.secret = config.raw.JWT_ACCESS_SECRET ?? randomBytes(32).toString('hex');
  }

  onModuleInit(): void {
    if (this.config.isProduction) {
      // Not a warning. The whole module is a backdoor, and a backdoor that only logs about itself
      // is one nobody notices until it is being used.
      throw new Error(
        'Development kitchen authentication is enabled in production. Replace KitchenAuthService ' +
          'with the real identity module before deploying.',
      );
    }
    this.logger.warn(
      `Kitchen auth is DEVELOPMENT ONLY — username "${DEV_USERNAME}". Replace before production.`,
    );
  }

  verifyCredentials(username: string, password: string): boolean {
    // Compare both fields in constant time and without short-circuiting, so neither the username's
    // existence nor the password's prefix is observable from response timing.
    const userOk = safeEqual(username, DEV_USERNAME);
    const passOk = safeEqual(password, DEV_PASSWORD);
    return userOk && passOk;
  }

  issueToken(username: string): { token: string; session: KitchenSession } {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = `${username}.${expiresAt}`;
    const token = `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
    return {
      token,
      session: { username, role: 'KITCHEN', expiresAt: new Date(expiresAt).toISOString() },
    };
  }

  /** Throws rather than returning null — every caller's only sane response is 401. */
  verifyToken(token: string | undefined): KitchenSession {
    if (token === undefined || token.length === 0) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_INVALID, 'Kitchen sign-in required.');
    }

    const [encoded, signature] = token.split('.');
    if (encoded === undefined || signature === undefined) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_INVALID, 'Malformed session token.');
    }

    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    if (!safeEqual(signature, this.sign(payload))) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_INVALID, 'Invalid session token.');
    }

    const [username, expiresRaw] = payload.split('.');
    const expiresAt = Number(expiresRaw);
    if (username === undefined || Number.isNaN(expiresAt)) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_INVALID, 'Malformed session token.');
    }
    if (Date.now() >= expiresAt) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Session expired — please sign in again.');
    }

    return { username, role: 'KITCHEN', expiresAt: new Date(expiresAt).toISOString() };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}

/** Constant-time string compare that does not leak length through an early return. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a comparison so the timing profile does not depend on length alone.
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
