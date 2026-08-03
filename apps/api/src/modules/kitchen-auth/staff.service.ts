import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { AppConfigService } from '../../core/config/config.service.js';
import { hashPassword, passwordProblem, verifyPassword } from './password.js';
import { ConflictError, ErrorCode, NotFoundError, ValidationError } from '../../core/errors/app-error.js';
import type { StaffRole } from './kitchen-auth.service.js';

/**
 * Staff accounts, in the database.
 *
 * Replaces two usernames and two plaintext passwords compiled into the source of a public
 * repository. The owner can now register as many cooks as the shop actually employs, reset a
 * password when somebody forgets one mid-shift, and remove an account the day someone leaves —
 * which is the point: a shared login nobody can revoke is a login that outlives the employment.
 *
 * Staff live in `users` alongside customers rather than in a table of their own, because `role`
 * already models exactly this distinction. Two account tables would mean two password paths and
 * two places to get session expiry wrong.
 *
 * Removal is a **deactivation**, not a delete. `AuditLog.actorUserId` and every payment
 * confirmation names a username; hard-deleting the row would leave last month's audit trail
 * pointing at nobody.
 */

export interface StaffAccount {
  id: string;
  username: string;
  role: StaffRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

@Injectable()
export class StaffService implements OnModuleInit {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Make sure there is always a way in.
   *
   * A shop that cannot sign in is a shop that cannot cook, so an empty staff table is bootstrapped
   * with one owner from the environment. This runs once on a fresh database and never again —
   * it keys on "are there any staff at all", not on a fixed username, so an owner who renames the
   * account does not get a second one conjured beside it on the next restart.
   */
  async onModuleInit(): Promise<void> {
    const existing = await this.prisma.user.count({
      where: { role: { in: ['ADMIN', 'KITCHEN'] }, deletedAt: null },
    });
    if (existing > 0) return;

    const password = this.config.raw.STAFF_OWNER_PASSWORD ?? 'owner123';
    await this.prisma.user.create({
      data: {
        username: 'owner',
        role: 'ADMIN',
        fullName: 'Owner',
        passwordHash: await hashPassword(password),
      },
    });

    // A cook account too, so a fresh clone can open both screens without a setup step.
    await this.prisma.user.create({
      data: {
        username: 'cook',
        role: 'KITCHEN',
        fullName: 'Kitchen',
        passwordHash: await hashPassword(this.config.raw.STAFF_COOK_PASSWORD ?? 'cook123'),
      },
    });

    if (this.config.raw.STAFF_OWNER_PASSWORD === undefined) {
      this.logger.warn(
        'Bootstrapped staff accounts with the published default passwords (owner/owner123, ' +
          'cook/cook123). Change them from /admin → Staff, or set STAFF_OWNER_PASSWORD, before ' +
          'this is reachable from outside this machine.',
      );
    } else {
      this.logger.log('Bootstrapped the owner account from STAFF_OWNER_PASSWORD.');
    }
  }

  /** Check a sign-in. Returns the account on success, null on any failure. */
  async verify(username: string, password: string): Promise<{ id: string; role: StaffRole } | null> {
    const user = await this.prisma.user.findFirst({
      where: { username: username.trim().toLowerCase(), deletedAt: null, status: 'ACTIVE' },
      select: { id: true, role: true, passwordHash: true },
    });

    // Hash anyway when the user does not exist, so a missing username and a wrong password take
    // the same time. Skipping the work here is a free username oracle.
    const ok = await verifyPassword(password, user?.passwordHash ?? null);
    if (!ok || user === null) return null;
    if (user.role !== 'ADMIN' && user.role !== 'KITCHEN') return null;

    await this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => undefined); // A failed stamp must never fail a sign-in.

    return { id: user.id, role: user.role };
  }

  async list(): Promise<{ staff: StaffAccount[] }> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'KITCHEN'] }, username: { not: null } },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      select: {
        id: true, username: true, role: true, status: true,
        deletedAt: true, lastLoginAt: true, createdAt: true,
      },
    });

    return {
      staff: rows.map((r) => ({
        id: r.id,
        username: r.username!,
        role: r.role as StaffRole,
        isActive: r.deletedAt === null && r.status === 'ACTIVE',
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async create(
    input: { username: string; password: string; role: StaffRole },
    actor: { username?: string },
  ): Promise<StaffAccount> {
    const username = input.username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      throw new ValidationError(
        'Usernames are 3–32 characters: lowercase letters, numbers, dots, dashes or underscores.',
      );
    }
    const weak = passwordProblem(input.password);
    if (weak !== null) throw new ValidationError(weak);

    const clash = await this.prisma.user.findFirst({ where: { username }, select: { id: true } });
    if (clash !== null) {
      throw new ConflictError(ErrorCode.VALIDATION_FAILED, 'That username is already taken.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          role: input.role,
          fullName: username,
          passwordHash: await hashPassword(input.password),
        },
      });
      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          actorUserId: actor.username ?? null,
          action: 'staff.created',
          entityType: 'user',
          entityId: user.id,
          // The password is not in `after`, and never will be.
          after: JSON.stringify({ username, role: input.role }),
        },
      });
      return user;
    });

    return {
      id: created.id,
      username,
      role: input.role,
      isActive: true,
      lastLoginAt: null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async resetPassword(
    id: string,
    password: string,
    actor: { username?: string },
  ): Promise<{ id: string; username: string }> {
    const weak = passwordProblem(password);
    if (weak !== null) throw new ValidationError(weak);

    const user = await this.staffOrThrow(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(password) },
      });
      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          actorUserId: actor.username ?? null,
          action: 'staff.password_reset',
          entityType: 'user',
          entityId: id,
          after: JSON.stringify({ username: user.username }),
        },
      });
    });

    // Existing sessions survive: tokens are signed and self-expiring, and there is no session
    // store to revoke against. Worth knowing when resetting a leaver's password — it stops the
    // next sign-in, not the tab they already have open, which is why removal exists below.
    return { id, username: user.username! };
  }

  /**
   * Deactivate an account.
   *
   * Two refusals, both about not locking the shop out of itself: you cannot remove the account you
   * are signed in as, and you cannot remove the last active owner. Either would leave a business
   * with no way into its own dashboard at 23:00.
   */
  async deactivate(id: string, actor: { username?: string; id?: string }): Promise<{ id: string }> {
    const user = await this.staffOrThrow(id);

    if (actor.username !== undefined && user.username === actor.username) {
      throw new ConflictError(
        ErrorCode.VALIDATION_FAILED,
        'You cannot remove the account you are signed in with.',
      );
    }

    if (user.role === 'ADMIN') {
      const owners = await this.prisma.user.count({
        where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE', username: { not: null } },
      });
      if (owners <= 1) {
        throw new ConflictError(
          ErrorCode.VALIDATION_FAILED,
          'This is the only owner account — add another before removing this one.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        // Deactivated, not deleted: audit rows and payment confirmations name this username, and a
        // hard delete would leave last month's trail pointing at nobody.
        data: { deletedAt: new Date(), status: 'DISABLED' },
      });
      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          actorUserId: actor.username ?? null,
          action: 'staff.deactivated',
          entityType: 'user',
          entityId: id,
          before: JSON.stringify({ username: user.username, role: user.role }),
        },
      });
    });

    return { id };
  }

  private async staffOrThrow(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: { in: ['ADMIN', 'KITCHEN'] }, username: { not: null } },
      select: { id: true, username: true, role: true, deletedAt: true },
    });
    if (user === null) throw new NotFoundError('That staff account does not exist.');
    return user;
  }
}
