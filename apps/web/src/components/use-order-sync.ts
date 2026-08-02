'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useOrders, type OrderStatus } from '@/store/orders';

const POLL_MS = 5000;

/** Nothing further happens to these, so there is nothing left to poll for. */
const FINISHED = new Set<string>(['DELIVERED', 'CANCELLED', 'REJECTED']);

/**
 * Keeps every live order in step with the kitchen.
 *
 * Mounted **once, in the root layout**, and it syncs all of the customer's active orders rather
 * than whichever one happens to be on screen. That is the difference between tracking that works
 * and tracking that appears to: the status shows up on the home screen tab, the orders list, the
 * nav badge and the tracking page, and all four read the same store — so polling only on the
 * detail page meant three of them silently showed whatever was last written to localStorage.
 *
 * Polling, not SSE, and deliberately. The realtime stream carries every order in the shop; a
 * customer must not receive other people's names, addresses and phone numbers because it was
 * convenient to reuse one channel. Filtering per customer needs the identity module that does not
 * exist yet, so until then polling *only this customer's own* orders is both simplest and the
 * only option that does not leak.
 *
 * Five seconds is chosen against what is being watched: a status that changes a handful of times
 * across twenty minutes. Faster would spend battery to shorten a wait nobody perceives.
 */
export function useOrderSync(): void {
  const orders = useOrders((s) => s.orders);
  const syncFromServer = useOrders((s) => s.syncFromServer);

  // Only the ids matter to the effect. Depending on the array itself would restart the interval
  // on every unrelated store write — including the ones this effect causes.
  const activeIds = orders
    .filter((o) => !o.id.startsWith('ord_') && !FINISHED.has(o.serverStatus ?? ''))
    .map((o) => o.id)
    .join(',');

  useEffect(() => {
    if (activeIds.length === 0) return;
    const ids = activeIds.split(',');
    let cancelled = false;

    const poll = async () => {
      // A backgrounded tab is a tab nobody is reading. Browsers throttle timers there anyway;
      // skipping the work outright is the honest version of the same thing.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      await Promise.all(
        ids.map(async (id) => {
          try {
            const order = await api.get<{ status: string; statusChangedAt?: string }>(
              `/orders/${id}`,
            );
            if (cancelled) return;
            // The kitchen's own timestamp, not ours. Polling adds up to five seconds of lag, and
            // the countdown restarts from this instant.
            const changedAt =
              order.statusChangedAt !== undefined
                ? new Date(order.statusChangedAt).getTime()
                : undefined;
            syncFromServer(id, order.status as OrderStatus, changedAt);
          } catch {
            // Offline, or the order is gone. The last known status stays on screen, which beats
            // blanking the thing the customer is watching.
          }
        }),
      );
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    // Coming back to the tab should show the truth immediately, not after the next tick.
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeIds, syncFromServer]);
}

/** Renders nothing; exists so the root layout can mount the sync. */
export function OrderSync(): null {
  useOrderSync();
  return null;
}
