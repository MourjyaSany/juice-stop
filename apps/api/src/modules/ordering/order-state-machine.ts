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
];

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
