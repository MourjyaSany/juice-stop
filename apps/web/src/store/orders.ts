'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Money,
  ORDER_FLOW,
  PHASE_ETA_SECONDS,
  PAYMENT_METHODS as PAYMENT_METHOD_IDS,
  formatOrderNumber,
  formatPickupToken,
  isFlowStatus,
  phaseAnchor,
  phaseUrgency,
  type FulfilmentType,
  type OrderFlowStatus,
  type OrderStatus as AnyOrderStatus,
  type Paise,
  type PaymentMethod,
  type PaymentStatus,
} from '@juice-stop/core';
import { api } from '@/lib/api';
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

// All of these now live in @juice-stop/core, so the storefront and the API cannot drift on what
// an order status is. Re-exported because ~15 call sites import them from here.
export type OrderStatus = OrderFlowStatus;
export { ORDER_FLOW, PHASE_ETA_SECONDS };
export type { FulfilmentType, PaymentMethod, PaymentStatus };

/**
 * Every status the server can report, including the ones outside the happy path.
 *
 * Distinct from `OrderStatus` above, which is the six-step flow the timeline renders. The server
 * can also say AWAITING_PAYMENT, CANCELLED or REJECTED, and pretending otherwise is what made
 * `ORDER_FLOW.indexOf(status)` quietly return −1 and render a cancelled order as "Order secured".
 */
export type { AnyOrderStatus };

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

/**
 * The two ways to pay.
 *
 * UPI is first and default: it settles before the kitchen starts, so nothing is cooked on trust,
 * and it carries zero MDR by Indian regulation. Cash is the fallback for anyone who would rather
 * not pay up front — it costs the shop a real risk, which is why it is second and not the default.
 *
 * Availability is decided by the **server** (`/storefront/payment-methods`), because UPI depends on
 * a payee being configured. This list only supplies the copy.
 */
export const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; note: string }> = [
  { id: 'UPI', label: 'UPI', note: 'Scan & pay now · GPay, PhonePe, Paytm' },
  // "Cash" said twice, deliberately. Riders carry no card machine and no UPI QR, so a customer who
  // assumes they can scan at the door has nothing to pay with when it arrives — and that is a
  // doorstep argument, not a support ticket. The word "only" does the work.
  { id: 'COD', label: 'Cash on delivery', note: 'Cash only at the door — no UPI to the rider' },
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
  /**
   * Where this order's money is, as the server last reported it.
   *
   * Drives two different screens: a PENDING UPI order belongs on the payment screen, while a
   * PENDING cash order is perfectly normal and simply means the rider has money to collect.
   */
  paymentStatus?: PaymentStatus;
  /** When the UPI request lapses. Null for cash — there is nothing to expire. */
  paymentExpiresAt?: number | null;

  /**
   * The status the **kitchen** last reported, and when we heard it.
   *
   * Present once an order has been synced from the API. Its absence is meaningful: an order
   * placed before the storefront talked to the server has no truth to show, and the simulated
   * timeline below is all it will ever have.
   */
  serverStatus?: AnyOrderStatus;
  /** When we heard it. Used only as a fallback if the server did not send its own stamp. */
  serverStatusAt?: number;
  /** When the kitchen actually made the change. Drives the countdown. */
  statusChangedAt?: number;
}

interface OrdersState {
  orders: PlacedOrder[];
  place: (
    order: Omit<PlacedOrder, 'id' | 'orderNumber' | 'otp' | 'editCount' | 'pickupToken'>,
    /**
     * Identity minted by the API. When present it *replaces* the client's guesses — the server's
     * order number is the one the kitchen prints and the customer quotes, so two different
     * numbers for one order is not a cosmetic problem.
     */
    serverIdentity?: {
      id: string;
      orderNumber: string;
      otp: string;
      pickupToken: string | null;
      /** What the server actually created — AWAITING_PAYMENT for UPI, PLACED for cash. */
      status: AnyOrderStatus;
      paymentStatus: PaymentStatus;
      paymentExpiresAt: number | null;
    },
  ) => PlacedOrder;
  /** Record what the server reported. The only writer of `serverStatus`. */
  syncFromServer: (
    orderId: string,
    status: AnyOrderStatus,
    statusChangedAt?: number,
    payment?: { status: PaymentStatus; expiresAt: number | null },
  ) => void;
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
/** Local fallback only — the server mints the authoritative token. Shared formatter, one alphabet. */
const mintPickupToken = (): string => formatPickupToken(Math.random);

/** Local fallback only — the server mints the authoritative number. */
const orderNumber = (placedAt: number): string =>
  formatOrderNumber(new Date(placedAt), Math.floor(Math.random() * 9000 + 1000));

export const useOrders = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],

      place: (draft, serverIdentity) => {
        const placed: PlacedOrder = {
          ...draft,
          id: serverIdentity?.id ?? `ord_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
          orderNumber: serverIdentity?.orderNumber ?? orderNumber(draft.placedAt),
          // 4-digit delivery OTP. The server mints the real one and stores only its hash; the
          // local fallback exists solely for the offline path below.
          otp: serverIdentity?.otp ?? String(Math.floor(Math.random() * 9000 + 1000)),
          pickupToken:
            serverIdentity !== undefined
              ? serverIdentity.pickupToken
              : draft.fulfilmentType === 'TAKEAWAY'
                ? mintPickupToken()
                : null,
          editCount: 0,
          // The server's own status, not an assumption. A UPI order is born AWAITING_PAYMENT, and
          // recording it as PLACED here would show the customer a cooking timeline for food the
          // kitchen has not even been told about.
          ...(serverIdentity !== undefined
            ? {
                serverStatus: serverIdentity.status,
                serverStatusAt: Date.now(),
                paymentStatus: serverIdentity.paymentStatus,
                paymentExpiresAt: serverIdentity.paymentExpiresAt,
              }
            : {}),
        };
        set((s) => ({ orders: [placed, ...s.orders] }));
        return placed;
      },

      syncFromServer: (orderId, status, statusChangedAt, payment) => {
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  serverStatus: status,
                  serverStatusAt: Date.now(),
                  ...(statusChangedAt !== undefined ? { statusChangedAt } : {}),
                  ...(payment !== undefined
                    ? { paymentStatus: payment.status, paymentExpiresAt: payment.expiresAt }
                    : {}),
                  // Payment confirmation restarts the clock server-side — the edit window and the
                  // promise both begin when the money lands, not when the QR appeared. Without
                  // adopting the server's new anchors the customer would watch a countdown that
                  // started while they were still in their banking app.
                  ...(statusChangedAt !== undefined && status === 'PLACED' && o.serverStatus === 'AWAITING_PAYMENT'
                    ? { placedAt: statusChangedAt, editableUntil: statusChangedAt + EDIT_WINDOW_MS }
                    : {}),
                }
              : o,
          ),
        }));
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

      confirmNow: (orderId) => {
        // Local first, so the countdown disappears the instant it is tapped.
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, editableUntil: Date.now() } : o,
          ),
        }));

        // Then tell the server, which is the copy that actually matters. The kitchen is blocked
        // from starting until the *server's* window shuts, so without this the cook would keep
        // staring at a countdown for an order the customer has already committed to. Locally
        // minted ids predate the API and have nothing to confirm against.
        if (!orderId.startsWith('ord_')) {
          void api.post(`/orders/${orderId}/confirm-now`).catch(() => {
            // The window lapses on its own within ten minutes either way, so a failure here costs
            // a wait rather than correctness — not worth an error banner over.
          });
        }
      },

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

  // The kitchen's word beats the clock.
  //
  // Everything below this block is a *simulation* — a plausible timeline inferred from the
  // promised time. It exists for orders placed before the storefront talked to the API, and it is
  // only ever a guess. Once a real status has been reported, showing anything else would mean
  // telling a customer their food is cooking while the cook has it sitting on the pass.
  //
  // Guarded on `isFlowStatus` rather than mere presence: AWAITING_PAYMENT, CANCELLED and REJECTED
  // are not steps, and feeding them to a step index returns −1, which previously rendered a
  // cancelled order as "Order secured".
  if (order.serverStatus !== undefined && isFlowStatus(order.serverStatus)) {
    return progressFromStatus(order, order.serverStatus, now);
  }

  // Nothing has started. An unpaid order has no timeline to show — the payment screen owns it.
  if (order.serverStatus === 'AWAITING_PAYMENT') {
    return {
      status: 'PLACED',
      stepIndex: 0,
      stepProgress: 0,
      secondsRemaining: 0,
      isLate: false,
      reachedAt: {},
    };
  }

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
  OUT_FOR_DELIVERY: { label: 'Almost at your doorstep', line: 'Keep your code handy.' },
  DELIVERED: { label: 'Delivered', line: 'Worth staying awake for.' },
};

/** Takeaway runs the same state machine, but "out for delivery" would be a lie. */
export const TAKEAWAY_STATUS_COPY: Record<OrderStatus, { label: string; line: string }> = {
  ...STATUS_COPY,
  READY: { label: 'Ready for pickup', line: 'Come grab it — quote your code at the counter.' },
  OUT_FOR_DELIVERY: { label: 'Waiting at the counter', line: 'Quote your code to collect.' },
  DELIVERED: { label: 'Collected', line: 'Mission accomplished.' },
};

export const statusCopyFor = (fulfilment: FulfilmentType) =>
  fulfilment === 'TAKEAWAY' ? TAKEAWAY_STATUS_COPY : STATUS_COPY;

/** Parse a persisted paise string back into branded money. */
export const toPaise = (s: string): Paise => Money.paise(BigInt(s));

/* ── Payment state ──────────────────────────────────────────────────────────────────────────── */

/** Still waiting for the customer to pay. The payment screen owns this order, not the tracker. */
export const isAwaitingPayment = (order: PlacedOrder): boolean =>
  order.serverStatus === 'AWAITING_PAYMENT';

/**
 * Does the customer still owe money at the door?
 *
 * True for a cash order right up until the rider collects. Used to show the amount on the tracking
 * screen, so nobody is surprised at the door by a total they last saw at checkout.
 */
export const owesCashOnDelivery = (order: PlacedOrder): boolean =>
  order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID';

/** The payment window lapsed before anyone paid — the order is gone. */
export const paymentLapsed = (order: PlacedOrder): boolean =>
  order.paymentStatus === 'EXPIRED' || order.paymentStatus === 'FAILED';

/**
 * Timeline for an order whose status the kitchen has actually reported.
 *
 * The step is a fact, so it is used directly. Only the *within-step* progress bar is interpolated,
 * because there is no third data point between "the cook pressed Preparing" and "the cook pressed
 * Ready" — and a bar frozen at 0% until it jumps to 100% reads as a hung screen.
 *
 * `reachedAt` is reconstructed rather than recorded per step: the customer app learns of a
 * transition when it next polls, so stamping the observation time would drift a few seconds later
 * than the truth every time. Spacing the completed steps across the real elapsed window is closer
 * to what happened than timestamps we did not witness.
 */
function progressFromStatus(
  order: PlacedOrder,
  status: OrderStatus,
  now: number,
): OrderProgress {
  const stepIndex = Math.max(0, ORDER_FLOW.indexOf(status));
  // Prefer the kitchen's own timestamp over when we happened to hear about it — polling adds up to
  // five seconds of lag, and a countdown that loses five seconds at every phase change is one the
  // customer will catch being wrong.
  const changedAt = order.statusChangedAt ?? order.serverStatusAt ?? order.placedAt;

  // One grader, shared with the kitchen board. Previously each side had its own idea of "late":
  // the wall tablet measured against promisedAt while the phone measured phase allowances, so one
  // order could be amber for staff and green for the customer.
  const { ratio, secondsRemaining } = phaseUrgency(status, order.placedAt, changedAt, now);
  const since = phaseAnchor(status, order.placedAt, changedAt);
  const stepProgress = status === 'DELIVERED' ? 1 : Math.min(1, ratio);

  const reachedAt: Partial<Record<OrderStatus, number>> = { PLACED: order.placedAt };
  const span = Math.max(1, since - order.placedAt);
  for (let i = 1; i <= stepIndex; i++) {
    reachedAt[ORDER_FLOW[i]!] = Math.round(order.placedAt + (span * i) / Math.max(1, stepIndex));
  }

  return {
    status,
    stepIndex,
    stepProgress,
    secondsRemaining,
    // Late means the *current* phase has overrun its promise — what the customer is watching — not
    // that some total set at checkout has elapsed.
    isLate: secondsRemaining === 0 && status !== 'DELIVERED',
    reachedAt,
  };
}
