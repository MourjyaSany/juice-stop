'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Money, type Paise } from '@juice-stop/core';
import type { CartLine } from './cart';

/**
 * Placed orders and their lifecycle.
 *
 * Prices are **snapshotted as strings** (ADR-011): a menu edit at 01:00 must never retroactively
 * change an order already placed. Strings rather than numbers because `bigint` has no JSON
 * representation and a `number` would reintroduce float risk.
 *
 * The order also keeps its `sourceLines` — the cart line IDs it was built from. That is what
 * makes the edit window possible: editing re-prices through exactly the same `priceCart` path
 * the cart uses, so an edited order and a fresh order can never be priced by different code.
 *
 * The status timeline is currently derived client-side. When the backend lands this is replaced
 * by server-emitted `order.status_changed` events over WebSocket with REST as the source of
 * truth (ADR-008) — the shape below is already the shape those events carry.
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

/** How long the customer may change their mind after placing. */
export const EDIT_WINDOW_MS = 10 * 60 * 1000;

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
  block: string;
  flatOrRoom: string;
  floor: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
}

export type FulfilmentType = 'DELIVERY' | 'TAKEAWAY';

/**
 * Cash on delivery is deliberately absent. Every method settles before the kitchen sees the
 * ticket, which removes the entire cash-reconciliation surface with it.
 */
export type PaymentMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET';

export const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; note: string }> = [
  // UPI first and default: zero MDR by regulation in India versus ~2% on cards, which makes this
  // one default worth more to the margin than most engineering in this repo.
  { id: 'UPI', label: 'UPI', note: 'GPay · PhonePe · Paytm' },
  { id: 'CARD', label: 'Card', note: 'Debit or credit' },
  { id: 'NETBANKING', label: 'Net banking', note: 'All major banks' },
  { id: 'WALLET', label: 'Wallet', note: 'Paytm · Amazon Pay' },
];

export interface OrderTotalsSnapshot {
  subtotalPaiseStr: string;
  deliveryFeePaiseStr: string;
  handlingFeePaiseStr: string;
  taxPaiseStr: string;
  totalPaiseStr: string;
}

export interface PlacedOrder extends OrderTotalsSnapshot {
  id: string;
  orderNumber: string;
  businessDate: string;
  placedAt: number;
  /** Cart lines the order was built from — the basis for editing. */
  sourceLines: CartLine[];
  lines: OrderLineSnapshot[];
  fulfilmentType: FulfilmentType;
  /** Null for takeaway — there is nowhere to deliver. */
  address: OrderAddressSnapshot | null;
  /** Collection code, takeaway only. Server-generated in production. */
  pickupToken: string | null;
  paymentMethod: PaymentMethod;
  /** Honest ETA — we grade ourselves against this (ADR-013). */
  promisedAt: number;
  prepSeconds: number;
  customerNote: string;
  otp: string;
  /**
   * When the edit window shuts. Set to `placedAt` by "send to kitchen now", which is why this is
   * stored rather than derived: a customer who confirms early must not have the window reopen on
   * the next render.
   */
  editableUntil: number;
  editCount: number;
}

interface OrdersState {
  orders: PlacedOrder[];
  place: (
    order: Omit<PlacedOrder, 'id' | 'orderNumber' | 'otp' | 'editCount' | 'pickupToken'>,
  ) => PlacedOrder;
  /** Apply an edit made during the grace window. Rejected once the window has shut. */
  applyEdit: (
    orderId: string,
    next: { sourceLines: CartLine[]; lines: OrderLineSnapshot[] } & OrderTotalsSnapshot & {
        prepSeconds: number;
        promisedAt: number;
      },
  ) => boolean;
  /** Close the window early — "I'm sure, start cooking". */
  confirmNow: (orderId: string) => void;
  clear: () => void;
}

/**
 * Collection code, e.g. `JS-4KQ9`.
 *
 * Mirrors the server's generator. The alphabet omits I, O, 0, 1, S and 5 — a code read aloud
 * across a busy counter must not hinge on whether that was a zero or an O.
 *
 * Generated client-side only because the storefront does not place orders through the API yet;
 * the server mints the authoritative one, since a client-generated code proves nothing.
 */
function mintPickupToken(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRTUVWXYZ';
  let token = '';
  for (let i = 0; i < 4; i++) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `JS-${token}`;
}

/** JS-270726-0417 — readable, sortable, and it does not leak nightly order volume. */
function orderNumber(placedAt: number): string {
  const d = new Date(placedAt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `JS-${dd}${mm}${yy}-${Math.floor(Math.random() * 9000 + 1000)}`;
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
          // 4-digit delivery OTP. Plain here only because there is no server yet; in production
          // only a sha256 hash is stored and the rider verifies against it offline.
          otp: String(Math.floor(Math.random() * 9000 + 1000)),
          pickupToken: draft.fulfilmentType === 'TAKEAWAY' ? mintPickupToken() : null,
          editCount: 0,
        };
        set((s) => ({ orders: [placed, ...s.orders] }));
        return placed;
      },

      applyEdit: (orderId, next) => {
        const order = get().orders.find((o) => o.id === orderId);
        // Re-check the deadline here, not just in the UI. A tab left open past the window would
        // otherwise still hold an enabled button.
        if (order === undefined || Date.now() >= order.editableUntil) return false;

        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, ...next, editCount: o.editCount + 1 } : o,
          ),
        }));
        return true;
      },

      confirmNow: (orderId) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, editableUntil: Date.now() } : o,
          ),
        })),

      clear: () => set({ orders: [] }),
    }),
    { name: 'juice-stop:orders', version: 2 },
  ),
);

/* ── Edit window ────────────────────────────────────────────────────────────────────────────── */

export interface EditWindow {
  open: boolean;
  secondsRemaining: number;
  /** 0–1 elapsed, for the countdown ring. */
  elapsed: number;
}

export function editWindow(order: PlacedOrder, now = Date.now()): EditWindow {
  const remainingMs = order.editableUntil - now;
  return {
    open: remainingMs > 0,
    secondsRemaining: Math.max(0, Math.ceil(remainingMs / 1000)),
    elapsed: Math.min(1, Math.max(0, 1 - remainingMs / EDIT_WINDOW_MS)),
  };
}

/* ── Timeline ───────────────────────────────────────────────────────────────────────────────── */

export interface OrderProgress {
  status: OrderStatus;
  stepIndex: number;
  stepProgress: number;
  secondsRemaining: number;
  isLate: boolean;
  reachedAt: Partial<Record<OrderStatus, number>>;
}

/**
 * Where an order is right now.
 *
 * **The kitchen does not start cooking while the order can still change.** So during the edit
 * window the status is held at ACCEPTED — showing "Cooking" for food that might be about to gain
 * two more items would be a lie, and the customer would rightly not believe the next status
 * either.
 *
 * After the window shuts, the timeline runs from `editableUntil`. Phase boundaries are
 * proportional to the promised window so a 4-minute Maggi and a 16-minute pizza combo both
 * progress believably.
 */
export function orderProgress(order: PlacedOrder, now = Date.now()): OrderProgress {
  const window = editWindow(order, now);

  if (window.open) {
    return {
      status: 'ACCEPTED',
      stepIndex: 1,
      stepProgress: window.elapsed,
      secondsRemaining: Math.max(0, Math.round((order.promisedAt - now) / 1000)),
      isLate: false,
      reachedAt: { PLACED: order.placedAt, ACCEPTED: order.placedAt },
    };
  }

  const cookingStart = order.editableUntil;
  const total = Math.max(1, order.promisedAt - cookingStart);
  const fraction = (now - cookingStart) / total;

  // Cumulative fraction of the cooking window at which each step completes.
  const boundaries: Array<[OrderStatus, number]> = [
    ['PLACED', 0.02],
    ['ACCEPTED', 0.08],
    ['PREPARING', 0.58],
    ['READY', 0.68],
    ['OUT_FOR_DELIVERY', 1],
    ['DELIVERED', Number.POSITIVE_INFINITY],
  ];

  let stepIndex = boundaries.findIndex(([, end]) => fraction < end);
  if (stepIndex === -1) stepIndex = ORDER_FLOW.length - 1;

  const status = ORDER_FLOW[stepIndex]!;
  const start = stepIndex === 0 ? 0 : boundaries[stepIndex - 1]![1];
  const end = boundaries[stepIndex]![1];
  const span = end - start;

  const reachedAt: Partial<Record<OrderStatus, number>> = { PLACED: order.placedAt };
  for (let i = 1; i <= stepIndex && i < boundaries.length; i++) {
    reachedAt[ORDER_FLOW[i]!] = Math.round(cookingStart + boundaries[i - 1]![1] * total);
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
  ACCEPTED: { label: 'Kitchen is locked in', line: 'You can still make changes.' },
  PREPARING: { label: 'Cooking', line: 'Fresh off the grill.' },
  READY: { label: 'Ready', line: 'Packed and waiting for a rider.' },
  OUT_FOR_DELIVERY: { label: 'On the way', line: 'Night fuel incoming.' },
  DELIVERED: { label: 'Delivered', line: 'Worth staying awake for.' },
};

/** Takeaway runs the same state machine, but "out for delivery" would be a lie. */
export const TAKEAWAY_STATUS_COPY: Record<OrderStatus, { label: string; line: string }> = {
  ...STATUS_COPY,
  READY: { label: 'Ready for pickup', line: 'Come grab it — quote your code at the counter.' },
  OUT_FOR_DELIVERY: { label: 'Waiting at the counter', line: 'Packed and holding for you.' },
  DELIVERED: { label: 'Collected', line: 'Mission accomplished.' },
};

export const statusCopyFor = (fulfilment: FulfilmentType) =>
  fulfilment === 'TAKEAWAY' ? TAKEAWAY_STATUS_COPY : STATUS_COPY;

/** Parse a persisted paise string back into branded money. */
export const toPaise = (s: string): Paise => Money.paise(BigInt(s));
