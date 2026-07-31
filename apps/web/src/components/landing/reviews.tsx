'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Eyebrow, GradientText, StickerField } from '@/components/system';
import { StarIcon } from '@/components/icons';
import { SPRING } from '@/components/motion-provider';

/**
 * Customer reviews.
 *
 * Quoted **verbatim**, including "deserts" and "gooood". Tidying a real customer's words would
 * misrepresent them — and the small imperfections are precisely what makes a testimonial read as
 * a person rather than marketing copy.
 */
interface Review {
  name: string;
  quote: string;
  rating: number;
}

const REVIEWS: Review[] = [
  {
    name: 'Bishal Mitra',
    quote: 'It is good place to have breakfast food, juices, shakes, deserts, burgers.',
    rating: 5,
  },
  {
    name: 'Alladi Saiteja',
    quote: 'Awesome drinks for reasonable prices and gooood food and a nice place to stay',
    rating: 5,
  },
];

const ROTATE_MS = 6500;

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function Reviews() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % REVIEWS.length) + REVIEWS.length) % REVIEWS.length);
  }, []);

  // Auto-advance, but never while the customer is interacting with it — a card that changes
  // mid-read is worse than one that never moves.
  useEffect(() => {
    if (paused || reduced) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % REVIEWS.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, reduced]);

  const review = REVIEWS[index]!;

  return (
    <section
      className="relative overflow-hidden py-16"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <StickerField count={7} seed={41} opacity={0.13} />

      <div className="mx-auto w-full max-w-lg px-5">
        <header className="text-center">
          <Eyebrow tone="violet">What people say</Eyebrow>
          <h2 className="mt-2.5 font-display text-[clamp(1.6rem,6.5vw,2.1rem)] font-bold leading-[1.08] tracking-[-0.03em]">
            Worth staying <GradientText>awake for.</GradientText>
          </h2>
        </header>

        <div
          className="relative mt-8"
          // Swipe support: this is a phone-first surface and dots alone are a poor primary
          // affordance on touch.
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined) return;
            const delta = end - start;
            if (Math.abs(delta) > 48) go(index + (delta < 0 ? 1 : -1));
            touchStartX.current = null;
          }}
        >
          {/* Rotating gradient ring — the surface reads as lit rather than outlined. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-px overflow-hidden rounded-[26px]"
          >
            <m.span
              className="absolute left-1/2 top-1/2 block aspect-square w-[240%]"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg, #FF6B1A 70deg, #FF3D81 130deg, #A855F7 195deg, transparent 275deg)',
                translateX: '-50%',
                translateY: '-50%',
              }}
              animate={reduced ? {} : { rotate: 360 }}
              transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
            />
          </span>

          <div
            className="relative overflow-hidden rounded-[26px] px-6 py-8"
            style={{
              background:
                'linear-gradient(160deg, rgba(22,16,24,0.96), rgba(14,11,18,0.97))',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Oversized quote mark, cropped by the card — editorial rather than clip-art. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-1 -top-8 select-none font-display text-[9rem] leading-none"
              style={{ color: 'rgb(255 107 26 / 0.09)' }}
            >
              &ldquo;
            </span>

            <div className="relative min-h-[10.5rem]">
              <AnimatePresence mode="wait" initial={false}>
                <m.blockquote
                  key={index}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -14, filter: 'blur(4px)' }}
                  transition={SPRING.smooth}
                >
                  <div className="flex gap-0.5" aria-label={`${review.rating} out of 5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <m.span
                        key={i}
                        initial={reduced ? false : { scale: 0, rotate: -40 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ ...SPRING.bouncy, delay: 0.06 + i * 0.05 }}
                        style={{ color: i < review.rating ? '#F59E0B' : 'var(--color-border-strong)' }}
                      >
                        <StarIcon size={16} filled={i < review.rating} />
                      </m.span>
                    ))}
                  </div>

                  <p className="mt-4 font-display text-[1.0625rem] font-medium leading-[1.5] tracking-[-0.01em]">
                    {review.quote}
                  </p>

                  <footer className="mt-5 flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-bold text-white"
                      style={{
                        background: 'linear-gradient(135deg, #FF6B1A, #FF3D81 55%, #A855F7)',
                        boxShadow: '0 6px 18px -8px rgb(255 107 26 / 0.9)',
                      }}
                      aria-hidden
                    >
                      {initials(review.name)}
                    </span>
                    <span>
                      <cite className="block font-display text-sm font-bold not-italic">
                        {review.name}
                      </cite>
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">
                        Verified customer
                      </span>
                    </span>
                  </footer>
                </m.blockquote>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Indicators double as controls, and the active one drains so the rotation is legible
            rather than surprising. */}
        <div className="mt-5 flex items-center justify-center gap-2.5">
          {REVIEWS.map((r, i) => {
            const active = i === index;
            return (
              <button
                key={r.name}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show review from ${r.name}`}
                aria-current={active ? 'true' : undefined}
                className="pressable relative h-1.5 overflow-hidden rounded-full transition-all duration-300"
                style={{
                  width: active ? 40 : 14,
                  background: active ? 'rgb(255 255 255 / 0.14)' : 'var(--color-border-strong)',
                }}
              >
                {active && (
                  <m.span
                    key={`${index}-${paused}`}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: 'var(--gradient-brand)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: paused || reduced ? '100%' : ['0%', '100%'] }}
                    transition={
                      paused || reduced
                        ? { duration: 0.2 }
                        : { duration: ROTATE_MS / 1000, ease: 'linear' }
                    }
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
