/**
 * Order lifecycle.
 *
 * The **only** legal writer of `orders.status` (README §3 invariant 4). Controllers ask this
 * module to transition; nothing calls `prisma.order.update({ status })` directly. That is what
 * makes "how did this order reach DELIVERED without being COOKED?" an answerable question.
 */

export const ORDER_STATUSES = [
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

export type ActorRole = 'CUSTOMER' | 'KITCHEN' | 'RIDER' | 'ADMIN' | 'SYSTEM';

interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  actors: ActorRole[];
}

const TRANSITIONS: Transition[] = [
  { from: 'PLACED', to: 'ACCEPTED', actors: ['KITCHEN', 'ADMIN', 'SYSTEM'] },
  { from: 'PLACED', to: 'REJECTED', actors: ['KITCHEN', 'ADMIN'] },
  { from: 'PLACED', to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'] },

  { from: 'ACCEPTED', to: 'PREPARING', actors: ['KITCHEN', 'ADMIN', 'SYSTEM'] },
  { from: 'ACCEPTED', to: 'REJECTED', actors: ['KITCHEN', 'ADMIN'] },
  // A customer may still pull out while the kitchen has not started cooking — this is the
  // server-side half of the 10-minute edit window.
  { from: 'ACCEPTED', to: 'CANCELLED', actors: ['CUSTOMER', 'ADMIN'] },

  { from: 'PREPARING', to: 'READY', actors: ['KITCHEN', 'ADMIN'] },
  { from: 'PREPARING', to: 'CANCELLED', actors: ['ADMIN'] },

  { from: 'READY', to: 'OUT_FOR_DELIVERY', actors: ['RIDER', 'ADMIN'] },
  { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', actors: ['RIDER', 'ADMIN'] },

  /* ── Undo ─────────────────────────────────────────────────────────────────────────────────
     A wall-mounted tablet gets knocked, and a greasy thumb lands on "Mark ready" for the wrong
     ticket. Without a way back the only remedies are a wrong order going out or someone editing
     the database, so stepping backwards is modelled as a real transition rather than left as an
     accident with no remedy.

     Each one is the exact inverse of a forward move, and every one still writes an audit row —
     an undo is a fact about the shift, not an erasure of one.

     Deliberately absent: REJECTED and CANCELLED have no way back. Both settle money, and a
     "resurrected" refunded order is a far worse problem than re-entering one. */
  { from: 'ACCEPTED', to: 'PLACED', actors: ['KITCHEN', 'ADMIN'] },
  { from: 'PREPARING', to: 'ACCEPTED', actors: ['KITCHEN', 'ADMIN'] },
  { from: 'READY', to: 'PREPARING', actors: ['KITCHEN', 'ADMIN'] },
  { from: 'OUT_FOR_DELIVERY', to: 'READY', actors: ['KITCHEN', 'ADMIN'] },
  { from: 'DELIVERED', to: 'OUT_FOR_DELIVERY', actors: ['KITCHEN', 'ADMIN'] },
];

/**
 * The step back from each status, for the dashboard's undo control.
 *
 * Derived here rather than in the controller so "what is the previous phase" has exactly one
 * answer, and adding a lifecycle step cannot leave undo pointing at the wrong place.
 */
const PREVIOUS: Partial<Record<OrderStatus, OrderStatus>> = {
  ACCEPTED: 'PLACED',
  PREPARING: 'ACCEPTED',
  READY: 'PREPARING',
  OUT_FOR_DELIVERY: 'READY',
  DELIVERED: 'OUT_FOR_DELIVERY',
};

export const previousStatus = (status: string): OrderStatus | undefined =>
  PREVIOUS[status as OrderStatus];

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

export function canTransition(
  from: string,
  to: OrderStatus,
  actor: ActorRole,
): TransitionResult {
  const match = TRANSITIONS.find((t) => t.from === from && t.to === to);

  if (match === undefined) {
    return { ok: false, reason: `Cannot go from ${from} to ${to}.` };
  }
  if (!match.actors.includes(actor)) {
    return { ok: false, reason: `${actor} may not move an order from ${from} to ${to}.` };
  }
  return { ok: true };
}

/** Statuses the kitchen still has work for. Drives the queue query. */
export const KITCHEN_ACTIVE: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

/** Terminal states — nothing further happens to these orders. */
export const TERMINAL: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];

export const isTerminal = (status: string): boolean =>
  (TERMINAL as string[]).includes(status);
