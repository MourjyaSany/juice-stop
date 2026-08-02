'use client';

import { create } from 'zustand';
import { useEffect } from 'react';

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api/v1';

/**
 * Live menu availability on the customer side.
 *
 * The catalogue itself still renders from `packages/menu` — names, prices and structure are build
 * -time constants and do not need a network round trip. What *does* change during service is
 * whether an item can be ordered, and that belongs to the kitchen.
 *
 * So only the exceptions travel: a list of sold-out ids and a map of low counts. The overwhelming
 * majority of items are available and unlimited, and sending a row for each of ~200 items to say
 * "still fine" would be sending almost nothing at 200× the cost.
 *
 * A zustand store rather than context because the menu list is long and re-rendering the whole
 * tree on every availability tick is exactly what makes a scrolling list stutter — subscribers
 * pick out the one id they care about.
 */

/**
 * Whether the shop is taking orders, as the **server** sees it.
 *
 * The storefront previously decided this in the browser from the local clock, which meant a device
 * with a wrong time saw a different shop than the kitchen did — and meant the owner's manual
 * override could not reach the customer at all. `null` means "not yet known"; callers fall back to
 * the local schedule so the first paint is never wrong-looking.
 */
interface StoreState {
  acceptingOrders: boolean | null;
  overrideMode: 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED';
  setStore: (acceptingOrders: boolean, overrideMode: StoreState['overrideMode']) => void;
}

export const useStoreLive = create<StoreState>()((set) => ({
  acceptingOrders: null,
  overrideMode: 'AUTO',
  setStore: (acceptingOrders, overrideMode) => set({ acceptingOrders, overrideMode }),
}));

/**
 * Server-confirmed ordering state, falling back to the caller's local computation until it lands.
 *
 * Ordering being *enabled* is enforced server-side regardless — this only decides what the button
 * looks like, so an optimistic fallback costs a rejected request at worst, never a wrong order.
 */
export function useAcceptingOrders(localFallback: boolean): boolean {
  const live = useStoreLive((s) => s.acceptingOrders);
  return live ?? localFallback;
}

interface AvailabilityState {
  soldOut: Set<string>;
  lowStock: Record<string, number>;
  loaded: boolean;
  apply: (soldOut: string[], lowStock: Record<string, number>) => void;
  applyOne: (productId: string, inStock: boolean, stockRemaining: number | null) => void;
}

export const useAvailability = create<AvailabilityState>()((set) => ({
  soldOut: new Set<string>(),
  lowStock: {},
  loaded: false,
  apply: (soldOut, lowStock) => set({ soldOut: new Set(soldOut), lowStock, loaded: true }),
  applyOne: (productId, inStock, stockRemaining) =>
    set((state) => {
      const next = new Set(state.soldOut);
      if (inStock) next.delete(productId);
      else next.add(productId);

      const low = { ...state.lowStock };
      if (inStock && stockRemaining !== null) low[productId] = stockRemaining;
      else delete low[productId];

      return { soldOut: next, lowStock: low, loaded: true };
    }),
}));

/** Convenience selectors so components never touch the Set directly. */
export const useIsSoldOut = (productId: string): boolean =>
  useAvailability((s) => s.soldOut.has(productId));

export const useStockLeft = (productId: string): number | null =>
  useAvailability((s) => s.lowStock[productId] ?? null);

/**
 * Keeps availability current: one fetch on mount, then SSE.
 *
 * Mounted once in the root layout. Failure is deliberately silent — if the API is unreachable the
 * customer sees the menu exactly as they do today, which is the correct degradation. A storefront
 * that refuses to render because it could not confirm that nothing is sold out would be strictly
 * worse than one that occasionally offers an item the kitchen then rejects.
 */
export function StorefrontLive() {
  const apply = useAvailability((s) => s.apply);
  const applyOne = useAvailability((s) => s.applyOne);

  useEffect(() => {
    let cancelled = false;

    void fetch(`${BASE}/storefront/store-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { acceptingOrders: boolean; override: { mode: StoreState['overrideMode'] } } | null) => {
        if (!cancelled && data !== null) {
          useStoreLive.getState().setStore(data.acceptingOrders, data.override.mode);
        }
      })
      .catch(() => undefined);

    void fetch(`${BASE}/storefront/availability`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { soldOut: string[]; lowStock: Record<string, number> } | null) => {
        if (!cancelled && data !== null) apply(data.soldOut, data.lowStock);
      })
      .catch(() => undefined);

    const source = new EventSource(`${BASE}/storefront/stream`);

    // The owner opening early is only useful if customers already looking at the menu find out.
    source.addEventListener('store.changed', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent<string>).data) as {
          data: { acceptingOrders: boolean; override: { mode: StoreState['overrideMode'] } };
        };
        useStoreLive.getState().setStore(parsed.data.acceptingOrders, parsed.data.override.mode);
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    });

    source.addEventListener('inventory.changed', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent<string>).data) as {
          data: { productId: string; inStock: boolean; stockRemaining: number | null };
        };
        applyOne(parsed.data.productId, parsed.data.inStock, parsed.data.stockRemaining);
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, [apply, applyOne]);

  return null;
}
