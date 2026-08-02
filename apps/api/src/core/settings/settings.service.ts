import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

/**
 * Runtime configuration that an operator can change without a deploy.
 *
 * The `Setting` table has existed since the first migration and nothing ever read it — the schema
 * comment promised "typed accessors live in the platform module" and that module was never built
 * (audit A8). This is it.
 *
 * The distinction that matters: **env vars configure the deployment, settings configure the
 * business.** Store hours, capacity thresholds and payment keys are env — they are the same for
 * every request and changing them is a deploy. "The owner opened early tonight" is a fact about
 * this evening that a person decides at 18:20 with a phone in their hand, and it must survive an
 * API restart. That is a row in a table.
 *
 * Values are JSON text because SQLite has no JSON column. Reads are cached in memory with a short
 * TTL: this is consulted on the hot path (every store-status check) and a database round trip per
 * request to learn "nothing has changed" is waste. Writes invalidate immediately, so an owner
 * tapping *Open now* never waits for a TTL.
 */

const CACHE_TTL_MS = 5_000;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read a setting, falling back to `fallback` when absent or unparseable.
   *
   * A malformed row must never take the shop down. A corrupt override should mean "behave
   * normally", not "throw on every request" — the failure mode of a settings layer has to be
   * ignoring itself.
   */
  async get<T>(key: string, fallback: T): Promise<T> {
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.value as T;

    try {
      const row = await this.prisma.setting.findUnique({ where: { key } });
      const value = row === null ? fallback : (JSON.parse(row.value) as T);
      this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } catch (error) {
      this.logger.warn(`Setting "${key}" is unreadable, using the default: ${String(error)}`);
      return fallback;
    }
  }

  /**
   * Write a setting and record who did it.
   *
   * The audit row is written in the same transaction as the value. A configuration change nobody
   * can attribute is exactly the kind of change that gets argued about at 03:00 — "who opened the
   * shop early?" has to be an answerable question, which is the whole point of `AuditLog`
   * (README §3 invariant 10, also previously unused).
   */
  async set(
    key: string,
    value: unknown,
    actor: { role: string; username?: string },
    description?: string,
  ): Promise<void> {
    const serialised = JSON.stringify(value);

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { key } });

      await tx.setting.upsert({
        where: { key },
        create: { key, value: serialised, ...(description !== undefined ? { description } : {}) },
        update: { value: serialised },
      });

      await tx.auditLog.create({
        data: {
          actorRole: actor.role,
          actorUserId: actor.username ?? null,
          action: 'setting.updated',
          entityType: 'setting',
          entityId: key,
          before: before?.value ?? null,
          after: serialised,
        },
      });
    });

    // Invalidate rather than replace, so the next read comes from the row that was actually
    // committed — not from what we believe we wrote.
    this.cache.delete(key);
  }

  /** Drop a setting entirely, returning the key to its default behaviour. */
  async clear(key: string, actor: { role: string; username?: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({ where: { key } });
      if (before === null) return;

      await tx.setting.delete({ where: { key } });
      await tx.auditLog.create({
        data: {
          actorRole: actor.role,
          actorUserId: actor.username ?? null,
          action: 'setting.cleared',
          entityType: 'setting',
          entityId: key,
          before: before.value,
          after: null,
        },
      });
    });
    this.cache.delete(key);
  }
}
