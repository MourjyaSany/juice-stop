import { Injectable } from '@nestjs/common';
import { getStoreStatus, type StoreStatus } from '@juice-stop/core';
import { SettingsService } from '../../core/settings/settings.service.js';
import { RealtimeService } from '../../core/events/realtime.service.js';

/**
 * Whether the shop is taking orders, right now.
 *
 * Scheduled hours are the default, not the law. A real restaurant opens early for a cricket final,
 * stays shut when the gas runs out, and trades through a power cut on a generator — a shop that
 * can only obey a cron expression is a shop that fights its owner.
 *
 * So: the schedule computes a baseline, and an **override** can outrank it. The override lives in
 * the `Setting` table so it survives a restart, and it carries an expiry so "open now" cannot
 * silently become "open forever" three weeks later. That auto-expiry mirrors ADR-013's rule for
 * the capacity override, for the same reason: a temporary decision that never ends is how a
 * business ends up permanently in a state nobody chose.
 *
 * This is now the **only** authority on `acceptingOrders`. The storefront previously computed it
 * locally from the clock, which meant the browser and the server could disagree — and the server
 * never checked at all.
 */

export const STORE_OVERRIDE_KEY = 'store.override';

export type OverrideMode = 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED';

export interface StoreOverride {
  mode: OverrideMode;
  /** ISO instant the override lapses. Null only for AUTO, which never expires. */
  expiresAt: string | null;
  reason: string | null;
  setBy: string | null;
  setAt: string | null;
}

const AUTO: StoreOverride = {
  mode: 'AUTO',
  expiresAt: null,
  reason: null,
  setBy: null,
  setAt: null,
};

export interface EffectiveStoreStatus {
  acceptingOrders: boolean;
  canBrowseMenu: boolean;
  /** What the schedule alone would say — so the UI can show "opened early" honestly. */
  scheduledOpen: boolean;
  override: StoreOverride;
  orderingBlockedReason: StoreStatus['orderingBlockedReason'] | 'ADMIN_CLOSED';
  quotedEtaMinutes: number | null;
  secondsUntilOpen: number | null;
  secondsUntilClose: number | null;
  capacityLoad: number;
  localTime: string;
  serverTime: string;
}

@Injectable()
export class StoreService {
  constructor(
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
  ) {}

  async override(): Promise<StoreOverride> {
    const stored = await this.settings.get<StoreOverride>(STORE_OVERRIDE_KEY, AUTO);
    if (stored.mode === 'AUTO') return AUTO;

    // Expiry is evaluated on read rather than swept by a job. There is no worker process yet
    // (audit A7), and an override that only lapses when something remembers to look is an
    // override that outlives its purpose.
    if (stored.expiresAt !== null && Date.parse(stored.expiresAt) <= Date.now()) return AUTO;

    return stored;
  }

  async status(now = new Date()): Promise<EffectiveStoreStatus> {
    const scheduled = getStoreStatus(now);
    const override = await this.override();

    const acceptingOrders =
      override.mode === 'FORCE_OPEN'
        ? true
        : override.mode === 'FORCE_CLOSED'
          ? false
          : scheduled.acceptingOrders;

    return {
      acceptingOrders,
      // Browsing has never been gated and is not gated now. A customer reading the menu at 16:00
      // is a customer who orders at 19:05.
      canBrowseMenu: true,
      scheduledOpen: scheduled.acceptingOrders,
      override,
      orderingBlockedReason: acceptingOrders
        ? null
        : override.mode === 'FORCE_CLOSED'
          ? 'ADMIN_CLOSED'
          : scheduled.orderingBlockedReason,
      // Forced-open outside service hours still needs a quote. The scheduled status returns null
      // when closed, so fall back to the standard promise rather than showing "—" at checkout.
      quotedEtaMinutes: acceptingOrders ? (scheduled.quotedEtaMinutes ?? 30) : null,
      secondsUntilOpen: scheduled.secondsUntilOpen,
      secondsUntilClose: scheduled.secondsUntilClose,
      capacityLoad: scheduled.capacityLoad,
      localTime: scheduled.localTime,
      serverTime: now.toISOString(),
    };
  }

  /**
   * Set or clear the override.
   *
   * Announced over realtime so a customer with the menu open sees the shop open without a refresh
   * — which is the entire point of opening early for a rush that is already outside.
   */
  async setOverride(
    input: { mode: OverrideMode; minutes?: number; reason?: string },
    actor: { role: string; username?: string },
  ): Promise<EffectiveStoreStatus> {
    if (input.mode === 'AUTO') {
      await this.settings.clear(STORE_OVERRIDE_KEY, actor);
    } else {
      // Bounded, because an unbounded manual state is one nobody remembers to undo. Twelve hours
      // covers the longest imaginable single service; the default is one hour.
      const minutes = Math.min(Math.max(Math.trunc(input.minutes ?? 60), 5), 12 * 60);
      const override: StoreOverride = {
        mode: input.mode,
        expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
        reason: input.reason ?? null,
        setBy: actor.username ?? actor.role,
        setAt: new Date().toISOString(),
      };
      await this.settings.set(
        STORE_OVERRIDE_KEY,
        override,
        actor,
        'Manual open/close override. Expires automatically.',
      );
    }

    const status = await this.status();
    this.realtime.publish('store.changed', 'store', {
      acceptingOrders: status.acceptingOrders,
      override: status.override,
    });
    return status;
  }
}
