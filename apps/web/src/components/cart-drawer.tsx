'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { getStoreStatus, Money, MIN_ORDER_PAISE } from '@juice-stop/core';
import { priceCart, useCart } from '@/store/cart';
import { assetForItem } from '@/data/assets';
import { AnimatedPaise } from './animated-value';
import { BillSummary } from './bill-summary';
import { QuantityStepper } from './quantity-stepper';
import { GeneratedImage } from './system/generated-image';
import { TactileButton } from './system/surfaces';
import { BagIcon, TrashIcon } from './icons';
import { SPRING } from './motion-provider';
import { useRegisterOverlay } from '@/store/overlay';
import { useAcceptingOrders } from '@/components/storefront-live';

/**
 * Cart as a slide-over.
 *
 * Reviewing a cart is a **glance**, not a destination. Navigating away from the menu to check it
 * loses scroll position, loses the category you were in, and makes adding one more thing feel
 * like a round trip. The drawer keeps the menu alive underneath.
 *
 * `/cart` still exists as a real page so the URL is shareable and back-button behaviour stays
 * sane — this is an overlay on top of that, not a replacement for it.
 */
export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useReducedMotion();
  // Hides the bottom nav while the drawer is up — it used to cover the checkout button.
  useRegisterOverlay(open);
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const totals = useMemo(() => priceCart(lines), [lines]);
  const status = getStoreStatus();

  // Server-confirmed, so a manual "Open now" from the owner unlocks this without a refresh. The
  // API enforces the window regardless — this only decides whether the button looks pressable.
  const takingOrders = useAcceptingOrders(status.acceptingOrders);
  const canCheckout = totals.itemCount > 0 && totals.meetsMinimum && takingOrders;

  // Escape closes, and the body is locked so the menu behind does not scroll under the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // An empty cart has nothing to review — close rather than show a drawer full of nothing.
  useEffect(() => {
    if (open && totals.itemCount === 0) onClose();
  }, [open, totals.itemCount, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[var(--z-drawer)] flex items-end justify-center">
          <m.button
            type="button"
            aria-label="Close cart"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <m.div
            role="dialog"
            aria-modal="true"
            aria-label="Your cart"
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={SPRING.smooth}
            // No drag-to-dismiss: Motion's drag lives in the `domMax` feature set, and we load
            // `domAnimation` (~15 kB lighter) under `strict`. Tapping the backdrop, pressing
            // Escape and the explicit button all dismiss, so nothing is unreachable.
            className="glass-strong relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px]"
          >
            <div className="shrink-0 px-5 pt-3">
              <div
                aria-hidden
                className="mx-auto h-1 w-10 rounded-full"
                style={{ background: 'var(--color-border-strong)' }}
              />
              <div className="mt-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-[-0.01em]">
                  <BagIcon size={19} strokeWidth={2} />
                  Your cart
                </h2>
                <span className="tabular text-xs text-[var(--color-text-secondary)]">
                  {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-2.5">
                <AnimatePresence initial={false}>
                  {totals.lines.map((p) => (
                    <m.li
                      key={p.line.lineId}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -24, height: 0, marginBottom: 0 }}
                      transition={SPRING.smooth}
                      className="flex items-center gap-3 rounded-[16px] p-2.5"
                      style={{
                        background: 'var(--color-inset)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <div className="h-14 w-14 shrink-0">
                        <GeneratedImage
                          slug={assetForItem(p.item.name, p.item.categoryId)}
                          rounded="12px"
                          className="h-full w-full"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold">
                          {p.item.name}
                          {p.item.variants.length > 1 && (
                            <span className="ml-1 text-xs font-medium text-[var(--color-text-secondary)]">
                              {p.variant.name}
                            </span>
                          )}
                        </p>
                        {p.addOnNames.length > 0 && (
                          <p className="truncate text-[11px] text-[var(--color-purple-300)]">
                            + {p.addOnNames.join(', ')}
                          </p>
                        )}
                        <AnimatedPaise
                          value={p.totalPaise}
                          className="text-xs font-semibold text-[var(--color-text-secondary)]"
                        />
                      </div>

                      <QuantityStepper
                        quantity={p.line.quantity}
                        onIncrement={() => setQuantity(p.line.lineId, p.line.quantity + 1)}
                        onDecrement={() => setQuantity(p.line.lineId, p.line.quantity - 1)}
                        size="sm"
                      />

                      <button
                        type="button"
                        onClick={() => setQuantity(p.line.lineId, 0)}
                        aria-label={`Remove ${p.item.name}`}
                        className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </m.li>
                  ))}
                </AnimatePresence>
              </ul>

              <div className="mt-5 rounded-[16px] p-4" style={{ background: 'var(--color-inset)' }}>
                <BillSummary
                  subtotalPaise={totals.subtotalPaise}
                  deliveryFeePaise={totals.deliveryFeePaise}
                  handlingFeePaise={totals.handlingFeePaise}
                  taxPaise={totals.taxPaise}
                  totalPaise={totals.totalPaise}
                />
              </div>

              {/* Blockers named before the button, never on tapping it. */}
              {!totals.meetsMinimum && totals.itemCount > 0 && (
                <p
                  className="mt-3 rounded-[12px] px-3.5 py-2.5 text-xs"
                  style={{ background: 'rgb(245 158 11 / 0.12)', color: 'var(--color-warning)' }}
                >
                  Add {Money.format(totals.shortfallPaise)} more to reach the{' '}
                  {Money.format(MIN_ORDER_PAISE)} minimum.
                </p>
              )}
              {!takingOrders && (
                <p
                  className="mt-3 rounded-[12px] px-3.5 py-2.5 text-xs"
                  style={{ background: 'rgb(255 107 26 / 0.12)', color: 'var(--color-orange-500)' }}
                >
                  Ordering opens at 7 PM. Your cart is saved.
                </p>
              )}
            </div>

            <div
              className="shrink-0 border-t px-5 pt-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <div className="flex gap-3">
                <TactileButton
                  size="lg"
                  variant="glass"
                  className="flex-1"
                  onClick={onClose}
                >
                  Keep browsing
                </TactileButton>

                {canCheckout ? (
                  <Link href="/checkout" className="flex-[1.5]" onClick={onClose}>
                    <TactileButton size="lg" className="w-full">
                      Checkout · <AnimatedPaise value={totals.totalPaise} />
                    </TactileButton>
                  </Link>
                ) : (
                  <TactileButton size="lg" className="flex-[1.5]" disabled>
                    Checkout
                  </TactileButton>
                )}
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
