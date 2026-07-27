'use client';

import { LazyMotion, MotionConfig } from 'motion/react';

/**
 * Motion runtime.
 *
 * The feature bundle is loaded **asynchronously**. Importing `domAnimation` statically pulls it
 * into the initial chunk, which defeats the entire point of `LazyMotion` — measured here as
 * +34 kB on First Load JS. Passing a loader function moves it into a deferred chunk that arrives
 * a tick after hydration; the first frame renders unanimated and everything springs from there.
 *
 * `strict` bans the un-lazy `motion.*` components, so a stray import can't silently drag the full
 * bundle back into the critical path.
 *
 * `reducedMotion="user"` makes every animation respect the OS setting automatically rather than
 * relying on each component to remember. Motion still fires the state change; it just stops
 * moving things. Reduced motion must never mean reduced information.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={() => import('motion/react').then((mod) => mod.domAnimation)} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Shared spring vocabulary, so motion reads as one system rather than per-component guesses. */
export const SPRING = {
  /** Buttons, toggles — quick and confident. */
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 },
  /** Sheets, cards — settles without wobble. */
  smooth: { type: 'spring', stiffness: 260, damping: 28 },
  /** Cart bar, success beats — a little overshoot you can feel. */
  bouncy: { type: 'spring', stiffness: 480, damping: 20, mass: 0.8 },
  /** Numbers — fast enough to keep up with rapid tapping. */
  counter: { type: 'spring', stiffness: 380, damping: 30 },
} as const;
