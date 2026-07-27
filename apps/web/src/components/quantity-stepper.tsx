'use client';

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AnimatedCount } from './animated-value';
import { MinusIcon, PlusIcon } from './icons';
import { SPRING } from './motion-provider';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/**
 * Add → −1 → +2 quantity control.
 *
 * The whole thing is one element that *morphs*: the "Add" pill widens into a stepper via Motion's
 * layout animation rather than swapping one component for another. A swap reads as a glitch; a
 * morph reads as the same object changing shape, which is what actually happened.
 *
 * Everything animated here is `transform` or `opacity` only — no width/height keyframes — so it
 * stays composited on the GPU and holds 60 fps on a low-end Android.
 */
export function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  disabled = false,
  disabledTitle,
  label = 'Add',
  size = 'md',
}: {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  disabledTitle?: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [sparkKey, setSparkKey] = useState(0);
  const rippleId = useRef(0);

  const height = size === 'sm' ? 32 : 36;
  const active = quantity > 0;

  const spawnRipple = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++rippleId.current;
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    // Prune after the animation window rather than on animation end — cheaper, and a dropped
    // callback would otherwise leak nodes on rapid tapping.
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600);
  }, []);

  const increment = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    spawnRipple(e);
    setSparkKey((k) => k + 1);
    onIncrement();
  };

  const decrement = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    spawnRipple(e);
    onDecrement();
  };

  return (
    <m.div
      layout
      transition={SPRING.snappy}
      className="relative shrink-0 select-none overflow-hidden rounded-[11px]"
      style={{
        height,
        background: active ? 'var(--color-inset)' : 'var(--gradient-brand)',
        border: active ? '1px solid rgb(255 107 26 / 0.45)' : '1px solid transparent',
        boxShadow: active ? 'none' : '0 4px 14px -4px rgb(255 107 26 / 0.5)',
        opacity: disabled ? 0.35 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
      title={disabled ? disabledTitle : undefined}
    >
      {/* Ripples sit under the content and never intercept clicks. */}
      <span className="pointer-events-none absolute inset-0">
        <AnimatePresence>
          {ripples.map((rip) => (
            <m.span
              key={rip.id}
              initial={{ scale: 0, opacity: 0.55 }}
              animate={{ scale: 4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="absolute rounded-full"
              style={{
                left: rip.x - 18,
                top: rip.y - 18,
                width: 36,
                height: 36,
                background: active ? 'rgb(255 107 26 / 0.5)' : 'rgb(255 255 255 / 0.65)',
              }}
            />
          ))}
        </AnimatePresence>
      </span>

      <AnimatePresence mode="popLayout" initial={false}>
        {!active ? (
          <m.button
            key="add"
            type="button"
            layout="position"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={SPRING.snappy}
            onClick={increment}
            className="flex h-full items-center gap-1 px-3.5 text-sm font-semibold text-white"
          >
            <PlusIcon size={15} strokeWidth={2.8} />
            {label}
          </m.button>
        ) : (
          <m.div
            key="stepper"
            layout="position"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={SPRING.snappy}
            className="flex h-full items-center"
          >
            <button
              type="button"
              onClick={decrement}
              aria-label="Remove one"
              className="flex h-full w-9 items-center justify-center text-[var(--color-orange-500)] transition-transform duration-150 active:scale-90"
            >
              <MinusIcon size={15} strokeWidth={2.8} />
            </button>

            {/* The count itself bounces on change — the confirmation that the tap registered. */}
            <m.span
              key={`q-${quantity}`}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.28, 1] }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-6 text-center font-display text-sm font-bold text-[var(--color-text-primary)]"
            >
              <AnimatedCount value={quantity} />
              <Sparkles trigger={sparkKey} />
            </m.span>

            <button
              type="button"
              onClick={increment}
              aria-label="Add one more"
              className="flex h-full w-9 items-center justify-center text-[var(--color-orange-500)] transition-transform duration-150 active:scale-90"
            >
              <PlusIcon size={15} strokeWidth={2.8} />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

/**
 * Four dots that fly outward once on increment.
 *
 * Deliberately tiny and short (450 ms). The effect should register as "that felt good" rather
 * than be consciously noticed — anything larger tips into novelty and gets annoying by the third
 * item added.
 */
function Sparkles({ trigger }: { trigger: number }) {
  if (trigger === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {[
        { x: -13, y: -11 },
        { x: 13, y: -9 },
        { x: -10, y: 11 },
        { x: 12, y: 12 },
      ].map((d, i) => (
        <m.span
          key={`${trigger}-${i}`}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: d.x, y: d.y, scale: [0, 1, 0], opacity: [1, 1, 0] }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: i * 0.02 }}
          className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full"
          style={{ background: 'var(--color-orange-500)' }}
        />
      ))}
    </span>
  );
}
