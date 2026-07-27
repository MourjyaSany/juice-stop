'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Money, type Paise } from '@juice-stop/core';

/**
 * Placed orders and their lifecycle.
 *
 * Prices are **snapshotted as strings** at placement (ADR-011): a menu edit at 01:00 must never
 * retroactively change an order that was already placed and paid for. Strings rather than numbers
 * because `bigint` has no JSON representation and a `number` would reintroduce float risk.
 *
 * The status timeline is currently driven client-side from `placedAt` plus the cart's prep
 * estimate. When the backend lands this is replaced by server-emitted `order.status_changed`
 * events over WebSocket, with REST as the source of truth (ADR-008) — the shape below is already
 * the shape those events carry.
 */

export type OrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

export const ORDER_FLOW: readonly OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export interface OrderLineSnapshot {
  name: string;
  variantName: string;
  addOnNames: string[];
  quantity: number;
  unitPaiseStr: string;
  totalPaiseStr: string;
  note: string;
}

export interface OrderAddressSnapshot {
  label: string;
  buildingName: string;
  flatOrRoom: string;
  floor: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  businessDate: string;
  placedAt: number;
  lines: OrderLineSnapshot[];
  address: OrderAddressSnapshot;
  subtotalPaiseStr: string;
  deliveryFeePaiseStr: string;
  handlingFeePaiseStr: string;
  taxPaiseStr: string;
  totalPaiseStr: string;
  paymentMethod: 'UPI' | 'CARD' | 'COD';
  /** Honest ETA computed at placement — we grade ourselves against this (ADR-013). */
  promisedAt: number;
  prepSeconds: number;
  customerNote: string;
  otp: string;
}

interface OrdersState {
  orders: PlacedOrder[];
  place: (order: Omit<PlacedOrder, 'id' | 'orderNumber' | 'otp'>) => PlacedOrder;
  clear: () => void;
}

/** JS-270726-0417 — human-readable, sortable, and it does not leak nightly order volume. */
function orderNumber(placedAt: number): string {
  const d = new Date(placedAt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `JS-${dd}${mm}${yy}-${rand}`;
}

export const useOrders = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],

      place: (draft) => {
        const placed: PlacedOrder = {
          ...draft,
          id: `ord_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
          orderNumber: orderNumber(draft.placedAt),
          // 4-digit delivery OTP. Stored plainly here only because there is no server yet; in
          // production only a sha256 hash is stored and the rider verifies against it offline.
          otp: String(Math.floor(Math.random() * 9000 + 1000)),
        };
        set((s) => ({ orders: [placed, ...s.orders] }));
        return placed;
      },

      clear: () => set({ orders: [] }),
    }),
    { name: 'juice-stop:orders', version: 1 },
  ),
);

/* ── Timeline ───────────────────────────────────────────────────────────────────────────────── */

export interface OrderProgress {
  status: OrderStatus;
  stepIndex: number;
  /** 0–1 through the *current* step. */
  stepProgress: number;
  secondsRemaining: number;
  isLate: boolean;
  reachedAt: Partial<Record<OrderStatus, number>>;
}

/**
 * Where an order is right now.
 *
 * The phase boundaries are proportional to the total promised window, so a 4-minute Maggi and a
 * 16-minute pizza combo both progress believably instead of one sitting on "Accepted" for a
 * quarter of an hour.
 */
export function orderProgress(order: PlacedOrder, now = Date.now()): OrderProgress {
  const total = Math.max(1, order.promisedAt - order.placedAt);
  const elapsed = now - order.placedAt;

  // Cumulative fraction of the window at which each step completes.
  const boundaries: Array<[OrderStatus, number]> = [
    ['PLACED', 0.04],
    ['ACCEPTED', 0.12],
    ['PREPARING', 0.55],
    ['READY', 0.65],
    ['OUT_FOR_DELIVERY', 1],
    ['DELIVERED', Number.POSITIVE_INFINITY],
  ];

  const fraction = elapsed / total;

  let stepIndex = boundaries.findIndex(([, end]) => fraction < end);
  if (stepIndex === -1) stepIndex = ORDER_FLOW.length - 1;

  const status = ORDER_FLOW[stepIndex]!;
  const start = stepIndex === 0 ? 0 : boundaries[stepIndex - 1]![1];
  const end = boundaries[stepIndex]![1];
  const span = end - start;

  const reachedAt: Partial<Record<OrderStatus, number>> = {};
  for (let i = 0; i <= stepIndex && i < boundaries.length; i++) {
    const at = i === 0 ? order.placedAt : order.placedAt + boundaries[i - 1]![1] * total;
    reachedAt[ORDER_FLOW[i]!] = Math.round(at);
  }

  return {
    status,
    stepIndex,
    stepProgress: Number.isFinite(span) ? Math.min(1, Math.max(0, (fraction - start) / span)) : 1,
    secondsRemaining: Math.max(0, Math.round((order.promisedAt - now) / 1000)),
    isLate: now > order.promisedAt && status !== 'DELIVERED',
    reachedAt,
  };
}

export const STATUS_COPY: Record<OrderStatus, { label: string; line: string }> = {
  PLACED: { label: 'Order secured', line: "Kitchen's got it." },
  ACCEPTED: { label: 'Kitchen locked in', line: 'Your order has been accepted.' },
  PREPARING: { label: 'Cooking', line: 'Chef is absolutely cooking.' },
  READY: { label: 'Ready', line: 'Packed and waiting for a rider.' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', line: 'Driver has entered the grind.' },
  DELIVERED: { label: 'Delivered', line: 'Late night cravings successfully defeated.' },
};

/** Parse a persisted paise string back into branded money. */
export const toPaise = (s: string): Paise => Money.paise(BigInt(s));
