'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { getStoreStatus, Money, MIN_ORDER_PAISE } from '@juice-stop/core';
import { priceCart, useCart } from '@/store/cart';
import { BagIcon, ChevronLeftIcon, MinusIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { Card, EmptyState, Skeleton, useHydrated } from '@/components/ui';

export default function CartPage() {
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);

  const totals = useMemo(() => priceCart(lines), [lines]);
  const status = getStoreStatus();

  const canCheckout = totals.itemCount > 0 && totals.meetsMinimum && status.acceptingOrders;

  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <header className="flex items-center gap-3">
          <Link
            href="/menu"
            aria-label="Back to menu"
            className="pressable flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeftIcon size={19} />
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Cart</h1>
        </header>

        {!hydrated ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full rounded-[18px]" />
            <Skeleton className="h-40 w-full rounded-[18px]" />
          </div>
        ) : totals.lines.length === 0 ? (
          <Card className="mt-6">
            <EmptyState
              icon={<BagIcon size={26} />}
              title="Cart's empty"
              body="Emptier than the library at 2 AM. Let's fix that."
              action={
                <Link
                  href="/menu"
                  className="pressable sheen inline-flex h-11 items-center rounded-[12px] px-5 font-display text-sm font-semibold text-white"
                  style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--glow-orange)' }}
                >
                  Browse the menu
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            <ul className="mt-6 space-y-3">
              {totals.lines.map((p) => (
                <li key={p.line.lineId}>
                  <Card className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display text-sm font-semibold leading-snug">
                          {p.item.name}
                          {p.item.variants.length > 1 && (
                            <span className="ml-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                              {p.variant.name}
                            </span>
                          )}
                        </h2>

                        {p.addOnNames.length > 0 && (
                          <p className="mt-0.5 text-xs text-[var(--color-purple-300)]">
                            + {p.addOnNames.join(', ')}
                          </p>
                        )}
                        {p.line.note.length > 0 && (
                          <p className="mt-0.5 text-xs italic text-[var(--color-text-tertiary)]">
                            “{p.line.note}”
                          </p>
                        )}

                        <p className="tabular mt-1.5 text-xs text-[var(--color-text-secondary)]">
                          {Money.format(p.unitPaise)} each
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => remove(p.line.lineId)}
                        aria-label={`Remove ${p.item.name}`}
                        className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div
                        className="flex h-9 items-center gap-1 rounded-[10px] px-1"
                        style={{
                          background: 'var(--color-inset)',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setQuantity(p.line.lineId, p.line.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="pressable flex h-7 w-7 items-center justify-center rounded-[8px]"
                        >
                          <MinusIcon size={14} strokeWidth={2.4} />
                        </button>
                        <span className="tabular w-6 text-center text-sm font-semibold">
                          {p.line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(p.line.lineId, p.line.quantity + 1)}
                          aria-label="Increase quantity"
                          className="pressable flex h-7 w-7 items-center justify-center rounded-[8px]"
                        >
                          <PlusIcon size={14} strokeWidth={2.4} />
                        </button>
                      </div>

                      <span className="tabular font-display text-base font-semibold">
                        {Money.format(p.totalPaise)}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            {/* Bill. Every line the customer will be charged, before they commit to anything. */}
            <Card className="mt-5 p-4">
              <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                Bill
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Item total" value={Money.format(totals.subtotalPaise)} />
                <Row
                  label="Delivery"
                  value="FREE"
                  valueClass="text-[var(--color-success)] font-semibold"
                />
                <Row label="Packaging" value={Money.format(totals.packagingFeePaise)} />
                <Row label="GST (5%)" value={Money.format(totals.taxPaise)} />
                <div
                  className="!mt-3 flex items-baseline justify-between border-t pt-3"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                >
                  <dt className="font-display text-sm font-semibold">To pay</dt>
                  <dd className="tabular text-gradient font-display text-xl font-bold">
                    {Money.format(totals.totalPaise)}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Blockers, stated before the button rather than on tapping it. */}
            {!totals.meetsMinimum && (
              <p
                className="mt-4 rounded-[12px] px-4 py-3 text-sm"
                style={{ background: 'rgb(245 158 11 / 0.12)', color: 'var(--color-warning)' }}
              >
                Add {Money.format(totals.shortfallPaise)} more to reach the{' '}
                {Money.format(MIN_ORDER_PAISE)} minimum.
              </p>
            )}
            {!status.acceptingOrders && (
              <p
                className="mt-4 rounded-[12px] px-4 py-3 text-sm"
                style={{ background: 'rgb(255 107 26 / 0.12)', color: 'var(--color-orange-500)' }}
              >
                Ordering opens at 7 PM. Your cart is saved.
              </p>
            )}

            <div className="mt-5">
              {canCheckout ? (
                <Link
                  href="/checkout"
                  className="pressable sheen flex h-14 w-full items-center justify-center gap-2 rounded-[14px] font-display text-base font-semibold text-white"
                  style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--glow-orange)' }}
                >
                  Checkout · <span className="tabular">{Money.format(totals.totalPaise)}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex h-14 w-full items-center justify-center rounded-[14px] font-display text-base font-semibold text-white opacity-40"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  Checkout
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  valueClass = '',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd className={`tabular ${valueClass}`}>{value}</dd>
    </div>
  );
}
