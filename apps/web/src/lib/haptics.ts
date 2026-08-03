'use client';

/**
 * Haptic feedback.
 *
 * A phone held one-handed in the dark is the device this app is used on, and a tap that produces
 * no physical response is a tap the user is not sure landed — so they tap again, and order two.
 * The vibration is the receipt for the press.
 *
 * **Only on real actions.** Feedback that fires on everything stops meaning anything and starts
 * being annoying, which is how people turn it off system-wide. Navigation, scrolling and opening a
 * sheet get nothing; adding to a cart, removing, committing money and hitting an error get
 * something, and the patterns differ so they are distinguishable without looking.
 *
 * `navigator.vibrate` is Android and Chrome only — iOS Safari has never supported it, and there is
 * no web API that reaches the Taptic Engine. This is therefore an **enhancement, never a signal**:
 * every action it accompanies also has a visible result, because roughly half the users will feel
 * nothing at all.
 */

export type HapticPattern =
  /** Something was added. The most common press in the app. */
  | 'add'
  /** Something was taken away. Deliberately shorter than `add` — subtraction should feel lighter. */
  | 'remove'
  /** A choice was made: a tab, a payment method, a dropdown. */
  | 'select'
  /** Money committed, or an order placed. The only pattern with two pulses. */
  | 'commit'
  /** A refusal. Long enough to read as "no" rather than as confirmation. */
  | 'error';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  add: 12,
  remove: 8,
  select: 10,
  // Two short pulses: this is the one moment worth distinguishing by feel alone, because it is the
  // one the customer will want to be sure about.
  commit: [14, 40, 22],
  error: [30, 50, 30],
};

/** Honour the same reduced-motion preference the animations do. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fire a haptic pulse. Silent no-op wherever it is unsupported or unwanted.
 *
 * Never throws. Some browsers reject `vibrate` outside a user gesture, and a rejected buzz must not
 * take a checkout button down with it.
 */
export function tapFeedback(pattern: HapticPattern = 'select'): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    // Someone who has asked for less motion has not asked for their phone to buzz instead.
    if (prefersReducedMotion()) return;
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Unsupported, blocked, or called outside a gesture. Nothing to recover from.
  }
}

/** Is the device able to give haptic feedback at all? For settings copy, not for behaviour. */
export const hapticsSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
