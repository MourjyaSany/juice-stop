'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Money } from '@juice-stop/core';
import { STATUS_COPY, orderProgress, toPaise, useOrders } from '@/store/orders';
import { BagIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { Card, EmptyState, Skeleton, useHydrated } from '@/components/ui';

export default function OrdersPage() {
  const hydrated = useHydrated();
  const orders = useOrders((s) => s.orders);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        {/* Orders is reachable from the tab bar, but people also arrive here from a tracking
            link — without a way back, that is a dead end. */}
        <header className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeftIcon size={19} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Orders</h1>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Live tracking and your history.
            </p>
          </div>
        </header>

        {!hydrated ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full rounded-[18px]" />
            <Skeleton className="h-24 w-full rounded-[18px]" />
          </div>
        ) : orders.length === 0 ? (
          <Card className="mt-6">
            <EmptyState
              icon={<BagIcon size={26} />}
              title="No orders yet"
              body="Once you place an order you'll be able to track it here, live, from kitchen to doorstep."
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
          <ul className="mt-6 space-y-3">
            {orders.map((order) => {
              const progress = orderProgress(order, now);
              const delivered = progress.status === 'DELIVERED';
              const minutes = Math.ceil(progress.secondsRemaining / 60);

              return (
                <li key={order.id}>
                  <Link href={`/orders/${order.id}`}>
                    <Card className="liftable p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{
                                background: delivered
                                  ? 'var(--color-success)'
                                  : 'var(--color-orange-500)',
                              }}
                              aria-hidden
                            />
                            <p className="font-display text-sm font-semibold">
                              {STATUS_COPY[progress.status].label}
                            </p>
                            {!delivered && (
                              <span className="tabular text-xs text-[var(--color-text-secondary)]">
                                · {minutes} min
                              </span>
                            )}
                          </div>

                          <p className="mt-1 font-mono text-xs text-[var(--color-text-tertiary)]">
                            {order.orderNumber}
                          </p>

                          <p className="mt-1.5 line-clamp-1 text-xs text-[var(--color-text-secondary)]">
                            {order.lines
                              .map((l) => `${l.quantity}× ${l.name}`)
                              .join(' · ')}
                          </p>

                          {/* Progress bar doubles as the phase indicator at a glance. */}
                          {!delivered && (
                            <div
                              className="mt-2.5 h-1 w-full overflow-hidden rounded-full"
                              style={{ background: 'var(--color-inset)' }}
                            >
                              <div
                                className="h-full rounded-full transition-[width] duration-1000"
                                style={{
                                  width: `${Math.round(((progress.stepIndex + progress.stepProgress) / 6) * 100)}%`,
                                  background: 'var(--gradient-brand)',
                                }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="tabular font-display text-sm font-semibold">
                            {Money.format(toPaise(order.totalPaiseStr))}
                          </span>
                          <span className="text-[var(--color-text-tertiary)]">
                            <ChevronRightIcon size={16} />
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
