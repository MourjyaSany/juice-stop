'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { Paise } from '@juice-stop/core';
import { AnimatedCount, AnimatedPaise } from './animated-value';
import { ArrowRightIcon, BagIcon } from './icons';
import { SPRING } from './motion-provider';

const BAR_HEIGHT = 60;
const GAP_ABOVE_NAV = 88; // clears the bottom navigation

/**
 * Floating cart bar.
 *
 * Two things here are load-bearing:
 *
 * 1. **The spacer.** A fixed bar over a scrolling list will always cover the last row, and no
 *    amount of z-index fixes that. So the component renders an in-flow spacer *and* the fixed
 *    bar. Because it sits after the item list in the DOM, the spacer extends the scroll height by
 *    exactly the bar's footprint — the last item can always be scrolled clear of it, and the
 *    space collapses to zero when the cart empties. No scroll listeners, no measuring, nothing to
 *    desynchronise.
 *
 * 2. **The pulse.** On every quantity change the bar gives one scale + glow beat. That is the
 *    feedback loop for an action taken elsewhere on the page — without it, adding an item from
 *    the bottom of a long list produces no visible confirmation at all.
 */
export function FloatingCart({
  itemCount,
  subtotalPaise,
  onOpen,
}: {
  itemCount: number;
  subtotalPaise: Paise;
  /** Opens the cart drawer. Reviewing a cart is a glance, not a navigation. */
  onOpen: () => void;
}) {
  const visible = itemCount > 0;
  const [pulse, setPulse] = useState(0);
  const previousCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount !== previousCount.current && itemCount > 0) setPulse((p) => p + 1);
    previousCount.current = itemCount;
  }, [itemCount]);

  return (
    <>
      {/* In-flow spacer — guarantees the last menu item clears the bar. */}
      <m.div
        aria-hidden
        animate={{ height: visible ? BAR_HEIGHT + 24 : 0 }}
        transition={SPRING.smooth}
        style={{ height: 0 }}
      />

      <AnimatePresence>
        {visible && (
          <m.div
            initial={{ y: 96, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 96, opacity: 0, scale: 0.94 }}
            transition={SPRING.bouncy}
            className="fixed inset-x-0 z-[var(--z-floating-cart)] mx-auto w-full max-w-lg px-4"
            style={{ bottom: `calc(${GAP_ABOVE_NAV}px + env(safe-area-inset-bottom))` }}
          >
            <m.div
              key={pulse}
              animate={{ scale: [1, 1.025, 1] }}
              transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={onOpen}
                className="group relative flex w-full items-center gap-3 overflow-hidden rounded-[16px] px-3.5 py-3 text-left"
                style={{
                  height: BAR_HEIGHT,
                  background:
                    'linear-gradient(135deg, rgba(24,16,12,0.92), rgba(20,14,24,0.92))',
                  backdropFilter: 'blur(20px) saturate(160%)',
                  border: '1px solid rgb(255 255 255 / 0.10)',
                  boxShadow:
                    '0 12px 34px -10px rgb(0 0 0 / 0.75), 0 0 26px -14px rgb(255 107 26 / 0.85)',
                }}
              >
                {/* Glow sweep on each update — a light passing across the surface, not a flash. */}
                <m.span
                  key={`sheen-${pulse}`}
                  aria-hidden
                  initial={{ x: '-120%' }}
                  animate={{ x: '140%' }}
                  transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none absolute inset-y-0 w-1/2"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent, rgb(255 255 255 / 0.14), transparent)',
                  }}
                />

                <span
                  className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  <BagIcon size={17} strokeWidth={2} />
                  {/* Count badge, springing on change. */}
                  <m.span
                    key={`badge-${itemCount}`}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SPRING.bouncy}
                    className="tabular absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
                    style={{
                      background: 'var(--color-text-primary)',
                      color: 'var(--color-canvas)',
                    }}
                  >
                    {itemCount}
                  </m.span>
                </span>

                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[11px] font-medium text-[var(--color-text-secondary)]">
                    <AnimatedCount value={itemCount} />{' '}
                    {itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <AnimatedPaise
                    value={subtotalPaise}
                    className="block font-display text-[15px] font-bold text-[var(--color-text-primary)]"
                  />
                </span>

                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-[11px] px-3.5 py-2 font-display text-[13px] font-bold text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  View cart
                  <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                    <ArrowRightIcon size={15} strokeWidth={2.4} />
                  </span>
                </span>
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
