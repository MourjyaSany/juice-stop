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

export type StaffRole = 'KITCHEN' | 'ADMIN';

/**
 * The only accounts, and only outside production.
 *
 * Two roles rather than two auth systems. The owner dashboard and the kitchen board are different
 * *applications*, but they are the same *identity problem* — building a second login for the
 * second screen would mean two token formats, two guards and two places to get session expiry
 * wrong. Roles are carried in the signed token, so a cook cannot reach revenue by changing a URL.
 */
const DEFAULT_ACCOUNTS: Record<string, { password: string; role: StaffRole }> = {
  cook: { password: 'cook123', role: 'KITCHEN' },
  owner: { password: 'owner123', role: 'ADMIN' },
};

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface KitchenSession {
  username: string;
  role: StaffRole;
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

  /**
   * The live accounts, with passwords overridable from the environment.
   *
   * The defaults above are published in this repository, so anyone who can reach a deployment can
   * read them. That is tolerable on a laptop and not tolerable the moment the app is on a public
   * URL — which it now is. `STAFF_COOK_PASSWORD` / `STAFF_OWNER_PASSWORD` turn a known constant
   * into a deployment secret without pretending this is the real identity module.
   */
  private readonly accounts: Record<string, { password: string; role: StaffRole }>;

  constructor(private readonly config: AppConfigService) {
    this.secret = config.raw.JWT_ACCESS_SECRET ?? randomBytes(32).toString('hex');
    this.accounts = {
      cook: {
        password: config.raw.STAFF_COOK_PASSWORD ?? DEFAULT_ACCOUNTS['cook']!.password,
        role: 'KITCHEN',
      },
      owner: {
        password: config.raw.STAFF_OWNER_PASSWORD ?? DEFAULT_ACCOUNTS['owner']!.password,
        role: 'ADMIN',
      },
    };
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
      `Staff auth is DEVELOPMENT ONLY — accounts: ${Object.keys(this.accounts).join(', ')}. ` +
        'Replace before production.',
    );

    // Naming the risk beats hiding it. If the published defaults are still live on something the
    // internet can reach, the operator needs to be told in the one place they will actually look.
    const usingDefaults = Object.entries(this.accounts).filter(
      ([name, a]) => a.password === DEFAULT_ACCOUNTS[name]?.password,
    );
    if (usingDefaults.length > 0) {
      this.logger.warn(
        `Default passwords in use for: ${usingDefaults.map(([n]) => n).join(', ')}. ` +
          'These are published in the repository — set STAFF_COOK_PASSWORD / STAFF_OWNER_PASSWORD ' +
          'before exposing this on any public URL.',
      );
    }
  }

  /**
   * Returns the role on success, null on failure.
   *
   * Every candidate password is compared even once a match is impossible, so response timing does
   * not reveal which usernames exist.
   */
  verifyCredentials(username: string, password: string): StaffRole | null {
    let matched: StaffRole | null = null;
    for (const [name, account] of Object.entries(this.accounts)) {
      const userOk = safeEqual(username, name);
      const passOk = safeEqual(password, account.password);
      if (userOk && passOk) matched = account.role;
    }
    return matched;
  }

  issueToken(username: string, role: StaffRole): { token: string; session: KitchenSession } {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    // Role is inside the signed payload, not alongside it — a client-supplied role is a client
    // that can promote itself to owner.
    const payload = `${username}.${role}.${expiresAt}`;
    const token = `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
    return { token, session: { username, role, expiresAt: new Date(expiresAt).toISOString() } };
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

    const [username, role, expiresRaw] = payload.split('.');
    const expiresAt = Number(expiresRaw);
    if (username === undefined || role === undefined || Number.isNaN(expiresAt)) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_INVALID, 'Malformed session token.');
    }
    if (role !== 'KITCHEN' && role !== 'ADMIN') {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_INVALID, 'Unknown role on session token.');
    }
    if (Date.now() >= expiresAt) {
      throw new UnauthorizedError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Session expired — please sign in again.');
    }

    return { username, role, expiresAt: new Date(expiresAt).toISOString() };
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
