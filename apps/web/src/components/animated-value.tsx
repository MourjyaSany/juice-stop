'use client';

import { useEffect, useRef } from 'react';
import { animate, AnimatePresence, m, useMotionValue, useTransform } from 'motion/react';
import { Money, type Paise } from '@juice-stop/core';
import { SPRING } from './motion-provider';

/**
 * A rupee amount that springs to its new value instead of snapping.
 *
 * The animation runs on a MotionValue, so the number updates outside React's render cycle — no
 * re-render per frame, which is what keeps this smooth on a low-end Android.
 *
 * Note the deliberate `Number()` cast: money is `bigint` paise everywhere else (ADR-003), but an
 * animation needs a continuous value to interpolate. The cast is safe here because it is display
 * only — the value being *charged* is never routed through this component.
 */
export function AnimatedPaise({
  value,
  className = '',
}: {
  value: Paise;
  className?: string;
}) {
  const target = Number(value);
  const motionValue = useMotionValue(target);
  const text = useTransform(motionValue, (v) => Money.format(Money.paise(Math.round(v))));
  const first = useRef(true);

  useEffect(() => {
    // Don't animate the first paint — a price counting up from ₹0 on mount is noise, not delight.
    if (first.current) {
      first.current = false;
      motionValue.set(target);
      return;
    }
    const controls = animate(motionValue, target, SPRING.counter);
    return () => controls.stop();
  }, [target, motionValue]);

  return <m.span className={`tabular ${className}`}>{text}</m.span>;
}

/**
 * An integer that slides vertically when it changes — up when incrementing, down when
 * decrementing, so the direction of travel matches the direction of the change.
 */
export function AnimatedCount({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  const previous = useRef(value);
  const direction = value >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = value;
  }, [value]);

  return (
    <span className={`relative inline-grid tabular ${className}`} style={{ placeItems: 'center' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={value}
          initial={{ y: 14 * direction, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14 * direction, opacity: 0 }}
          transition={SPRING.counter}
          style={{ gridArea: '1 / 1' }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
