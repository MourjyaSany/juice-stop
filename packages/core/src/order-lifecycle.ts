/**
 * The order lifecycle — one definition, shared by the API and the storefront.
 *
 * These five concepts were previously declared twice, in full, in
 * `apps/api/src/modules/ordering/order-state-machine.ts` and `apps/web/src/store/orders.ts`. Two
 * copies of a state machine is two state machines: adding a status meant editing both and hoping,
 * and the pickup-token alphabet had already been copy-pasted with a comment explaining that it
 * mirrored the other one. A shared vocabulary is the only way "the state machine is the only
 * writer of status" stays true across a network boundary.
 *
 * This module is deliberately **pure data and pure functions**. Legality of a transition — who may
 * perform it, and from where — stays in the API's state machine, because that is an authorisation
 * decision and authorisation decisions do not belong in a package the browser can read.
 */

export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The happy path, in order.
 *
 * Excludes CANCELLED and REJECTED on purpose: they are exits, not steps. Including them would make
 * every progress bar and step index in the app have to special-case them.
 *
 * AWAITING_PAYMENT is excluded for the mirror-image reason: it is an **entrance**. An unpaid order
 * has not started its journey, and putting it in the flow would add a seventh step to every
 * progress bar, shift every step index, and give COD orders a phase they never pass through.
 * Payment is a gate in front of the lifecycle, not a stage of it.
 */
export const ORDER_FLOW = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const satisfies readonly OrderStatus[];

export type OrderFlowStatus = (typeof ORDER_FLOW)[number];

/** Nothing further happens to these. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];

export const isTerminalStatus = (status: string): boolean =>
  (TERMINAL_STATUSES as readonly string[]).includes(status);

/** Statuses the kitchen still has work for. Drives the queue query. */
export const KITCHEN_ACTIVE_STATUSES: readonly OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
];

export const isFlowStatus = (status: string): status is OrderFlowStatus =>
  (ORDER_FLOW as readonly string[]).includes(status);

/* ── Fulfilment and payment ─────────────────────────────────────────────────────────────────── */

export const FULFILMENT_TYPES = ['DELIVERY', 'TAKEAWAY'] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

/**
 * Two methods, and only two.
 *
 * Card, net banking and wallet are gone. They were never real here — no gateway was ever connected,
 * so every one of them was a button that set a string. More importantly, each is a settlement
 * surface with its own fees, chargeback path and reconciliation story, and a one-kitchen shop does
 * not need four of those. UPI is what this customer base actually pays with, and it carries zero
 * MDR by Indian regulation, so the cheapest option is also the popular one.
 *
 * COD returns, deliberately and with its eyes open. It was removed to delete the cash-handling
 * surface — per-rider drawers, variance tracking, risk caps — and that surface is genuinely back:
 * a COD order is food that leaves the kitchen before any money exists. What keeps it honest here is
 * that `paymentStatus` is no longer a constant. See PAYMENT_STATUSES below.
 */
export const PAYMENT_METHODS = ['UPI', 'COD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Where an order's money actually is.
 *
 * This used to be hardcoded `'PAID'` at placement, which was true of nothing — no gateway existed.
 * Now it is the field that keeps the two methods honest, and the two travel in opposite directions:
 *
 *   UPI  · PENDING → PAID before the kitchen ever sees the ticket. Unpaid means uncooked.
 *   COD  · PENDING all the way to the doorstep, → PAID when the rider collects.
 *
 * EXPIRED exists so an abandoned UPI checkout is distinguishable from one that failed. Both end the
 * order, but only one of them is worth asking a customer about.
 */
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'FAILED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Must this method settle before the kitchen is allowed to see the order?
 *
 * The single question that decides whether a new order starts at AWAITING_PAYMENT or PLACED. A
 * predicate rather than an inline `=== 'UPI'` so adding a prepaid method later is one line here
 * instead of a hunt through the ordering service.
 */
export const requiresPrepayment = (method: PaymentMethod): boolean => method === 'UPI';

/** Is cash still owed on this order at handover? Drives the rider's "collect ₹350" prompt. */
export const collectsCashOnDelivery = (
  method: PaymentMethod,
  paymentStatus: string,
): boolean => method === 'COD' && paymentStatus !== 'PAID';

/**
 * How long a UPI payment request stays live.
 *
 * Ten minutes is not arbitrary: it matches the customer edit window, so the two timers a customer
 * can be shown never disagree about what "a while" means. Long enough to find a phone and a
 * network on hostel Wi-Fi; short enough that abandoned checkouts do not hold counted stock all
 * night.
 */
export const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

/* ── Phase timing ───────────────────────────────────────────────────────────────────────────── */

/**
 * What each phase promises, in seconds.
 *
 * The countdown **restarts** at each phase rather than running one total down from checkout. A
 * single clock started at ordering is wrong the moment the kitchen runs behind, and a customer
 * watching it hit zero while their food is still on the grill trusts nothing it says afterwards.
 *
 * PLACED and ACCEPTED share one clock measured from placement: accepting is an acknowledgement,
 * not progress, and restarting there would hand back minutes already waited.
 */
export const PHASE_ETA_SECONDS: Record<OrderFlowStatus, number> = {
  PLACED: 50 * 60,
  ACCEPTED: 50 * 60,
  PREPARING: 40 * 60,
  READY: 25 * 60,
  OUT_FOR_DELIVERY: 15 * 60,
  DELIVERED: 0,
};

/** Which instant a phase's countdown runs from. */
export const phaseAnchor = (
  status: OrderFlowStatus,
  placedAt: number,
  statusChangedAt: number,
): number => (status === 'PLACED' || status === 'ACCEPTED' ? placedAt : statusChangedAt);

export type UrgencyLevel = 'calm' | 'watch' | 'pressing' | 'late';

/**
 * How pressed an order is, on one definition used by **both** dashboards.
 *
 * The kitchen previously graded against `promisedAt` while the customer graded against phase
 * allowances, so one order could be amber on the wall and green on the phone. Staff and customer
 * disagreeing about whether food is late is worse than either answer alone.
 *
 * Returns the fraction of the phase's allowance consumed, so callers can drive a progress bar from
 * the same number that picks the colour — colour is never the only signal.
 */
export function phaseUrgency(
  status: OrderFlowStatus,
  placedAt: number,
  statusChangedAt: number,
  now: number,
): { level: UrgencyLevel; ratio: number; secondsRemaining: number } {
  const allowanceMs = PHASE_ETA_SECONDS[status] * 1000;
  if (allowanceMs === 0) return { level: 'calm', ratio: 1, secondsRemaining: 0 };

  const elapsed = now - phaseAnchor(status, placedAt, statusChangedAt);
  const ratio = Math.max(0, elapsed / allowanceMs);
  // Clamped at zero: "0:00" while a rider climbs the stairs is a late order; "−3:41" is a bug.
  const secondsRemaining = Math.max(0, Math.round((allowanceMs - elapsed) / 1000));

  const level: UrgencyLevel =
    ratio >= 1 ? 'late' : ratio >= 0.8 ? 'pressing' : ratio >= 0.55 ? 'watch' : 'calm';

  return { level, ratio, secondsRemaining };
}

/* ── Codes ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Alphabet for human-read codes.
 *
 * Omits I, O, 0, 1, S and 5. A code read aloud across a noisy counter must not hinge on whether
 * that was a zero or an O — the same reasoning that governs which block letters we skip.
 *
 * `5` was present in both original copies of this string despite the comment claiming otherwise —
 * "23456789" contains it. Caught by the test below, which asserts the property rather than the
 * literal. Tokens already issued stay valid; they are stored strings, not regenerated.
 */
export const UNAMBIGUOUS_ALPHABET = '2346789ABCDEFGHJKLMNPQRTUVWXYZ';

/**
 * Format a pickup token from caller-supplied randomness.
 *
 * Takes the random source rather than calling one, so the server can use `crypto.randomInt` and a
 * test can pass a fixed sequence. A shared package must not reach for Node crypto — the browser
 * imports this too.
 */
export function formatPickupToken(random: () => number, length = 4): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += UNAMBIGUOUS_ALPHABET[Math.floor(random() * UNAMBIGUOUS_ALPHABET.length)];
  }
  return `JS-${token}`;
}

/** `JS-020826-4417` — readable, sortable, and it does not leak nightly order volume. */
export function formatOrderNumber(at: Date, suffix: number): string {
  const dd = String(at.getDate()).padStart(2, '0');
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  const yy = String(at.getFullYear()).slice(2);
  return `JS-${dd}${mm}${yy}-${suffix}`;
}
