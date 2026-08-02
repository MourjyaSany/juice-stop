'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useOrders, type OrderStatus } from '@/store/orders';

const POLL_MS = 5000;

/**
 * Keeps a customer's order tracking in step with the kitchen.
 *
 * Polling, not SSE, and deliberately so. The realtime stream carries every order in the shop; a
 * customer must not receive other people's names, addresses and phone numbers because it was
 * convenient to reuse one channel. Filtering server-side per customer needs the identity module
 * that does not exist yet, so until then a five-second poll of *this* order is both the simplest
 * and the only one that does not leak.
 *
 * Five seconds is chosen against what the customer is watching: a status that changes a handful
 * of times across twenty minutes. Faster would burn a phone battery to shorten a wait nobody
 * perceives.
 */
export function useOrderSync(orderId: string | undefined, active: boolean): void {
  const syncFromServer = useOrders((s) => s.syncFromServer);

  useEffect(() => {
    if (orderId === undefined || !active) return;
    // Locally minted ids belong to orders placed before the storefront talked to the API. Asking
    // the server about them would 404 on a loop forever.
    if (orderId.startsWith('ord_')) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const order = await api.get<{ status: string }>(`/orders/${orderId}`);
        if (!cancelled) syncFromServer(orderId, order.status as OrderStatus);
      } catch {
        // Offline, or the order is gone. The last known status stays on screen — which is more
        // useful than blanking the page the customer is watching.
      }
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orderId, active, syncFromServer]);
}
