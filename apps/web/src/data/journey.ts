/**
 * The midnight mission — nine checkpoints from tap to doorstep.
 *
 * This replaces a "How it works" list. The framing is deliberate: the same nine stages already
 * exist as real order statuses in the backend, so the landing page is telling the truth about
 * what happens rather than inventing marketing steps. When a customer later watches their order
 * move through tracking, they are watching this map.
 *
 * Copy rule (07-design-system.md §8): the fact first, personality second, one line each. Never
 * a joke instead of information.
 */

export interface Checkpoint {
  id: string;
  index: number;
  title: string;
  line: string;
  /** Asset slug — see data/assets.ts. */
  asset: string;
  tone: 'warm' | 'violet';
  /** The real order status this maps to, where one exists. */
  status?: string;
}

export const JOURNEY: Checkpoint[] = [
  {
    id: 'choose',
    index: 1,
    title: 'Choose your feast',
    line: 'Two hundred plus things worth staying awake for.',
    asset: 'hero',
    tone: 'warm',
  },
  {
    id: 'locked',
    index: 2,
    title: 'Kitchen gets locked in',
    line: 'Your ticket hits the pass the second you pay.',
    asset: 'kitchen',
    tone: 'violet',
    status: 'ACCEPTED',
  },
  {
    id: 'ingredients',
    index: 3,
    title: 'Fresh ingredients',
    line: 'Prepped tonight. Nothing sitting around from lunch.',
    asset: 'ingredients',
    tone: 'warm',
  },
  {
    id: 'cooking',
    index: 4,
    title: 'Chef starts cooking',
    line: 'Fresh off the grill, not out of a warmer.',
    asset: 'grill',
    tone: 'warm',
    status: 'PREPARING',
  },
  {
    id: 'quality',
    index: 5,
    title: 'Quality check',
    line: 'If it would not pass for us, it does not leave.',
    asset: 'quality',
    tone: 'violet',
  },
  {
    id: 'packed',
    index: 6,
    title: 'Packed carefully',
    line: 'Sealed hot, stacked so nothing arrives sideways.',
    asset: 'packing',
    tone: 'warm',
    status: 'READY',
  },
  {
    id: 'pickup',
    index: 7,
    title: 'Rider picks up',
    line: 'Straight from the pass to the bag to the bike.',
    asset: 'rider',
    tone: 'violet',
    status: 'OUT_FOR_DELIVERY',
  },
  {
    id: 'almost',
    index: 8,
    title: 'Almost there',
    line: 'Live countdown, honest minutes. No fake timers.',
    asset: 'night-ride',
    tone: 'violet',
  },
  {
    id: 'complete',
    index: 9,
    title: 'Midnight mission complete',
    line: 'Night fuel delivered. Touch grass tomorrow.',
    asset: 'students',
    tone: 'warm',
    status: 'DELIVERED',
  },
];
