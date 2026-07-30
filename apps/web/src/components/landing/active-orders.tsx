'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Money } from '@juice-stop/core';
import {
  STATUS_COPY,
  editWindow,
  orderProgress,
  toPaise,
  useOrders,
  type PlacedOrder,
} from '@/store/orders';
import { ArrowRightIcon, ClockIcon, EditIcon } from '@/components/icons';
import { useHydrated } from '@/components/ui';
import { SPRING } from '@/components/motion-provider';

/**
 * Live orders, surfaced on the landing page.
 *
 * If something of yours is being cooked right now, that is the single most important thing on the
 * screen — more than the hero, more than the menu. It sits directly under the fold and disappears
 * entirely once every order is delivered, so it never becomes permanent furniture.
 */
export function ActiveOrders() {
  const hydrated = useHydrated();
  const orders = useOrders((s) => s.orders);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!hydrated) return null;

  const live = orders.filter((o) => orderProgress(o, now).status !== 'DELIVERED').slice(0, 3);
  if (live.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-lg px-5 pb-2">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span
            className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full"
            style={{ background: 'var(--color-success)' }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: 'var(--color-success)' }}
          />
        </span>
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-success)]">
          {live.length === 1 ? 'Order in progress' : `${live.length} orders in progress`}
        </h2>
      </div>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {live.map((order) => (
            <ActiveOrderCard key={order.id} order={order} now={now} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function ActiveOrderCard({ order, now }: { order: PlacedOrder; now: number }) {
  const progress = orderProgress(order, now);
  const window = editWindow(order, now);
  const overall = Math.min(1, (progress.stepIndex + progress.stepProgress) / 6);

  const minutes = Math.floor(progress.secondsRemaining / 60);
  const seconds = progress.secondsRemaining % 60;

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={SPRING.smooth}
    >
      <Link
        href={`/orders/${order.id}`}
        className="group block overflow-hidden rounded-[18px] p-4 transition-transform duration-300 hover:-translate-y-0.5"
        style={{
          background: 'linear-gradient(140deg, rgb(255 107 26 / 0.12), rgb(168 85 247 / 0.09))',
          border: '1px solid rgb(255 107 26 / 0.28)',
          boxShadow: '0 12px 32px -18px rgb(255 107 26 / 0.9)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[15px] font-bold leading-tight">
              {STATUS_COPY[progress.status].label}
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-secondary)]">
              {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(' · ')}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p
              className="tabular font-display text-[17px] font-bold"
              style={{ color: progress.isLate ? 'var(--color-warning)' : 'var(--color-orange-500)' }}
            >
              {minutes}:{String(seconds).padStart(2, '0')}
            </p>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              {progress.isLate ? 'running late' : 'to go'}
            </p>
          </div>
        </div>

        {/* Progress reads at a glance without opening the order. */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'rgb(0 0 0 / 0.35)' }}
        >
          <m.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${overall * 100}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            style={{ background: 'var(--gradient-brand)' }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-3 text-[11px]">
            <span className="font-mono text-[var(--color-text-tertiary)]">
              {order.orderNumber.split('-').pop()}
            </span>
            <span className="tabular font-semibold">
              {Money.format(toPaise(order.totalPaiseStr))}
            </span>
            {/* Only surfaced while it is actually actionable. */}
            {window.open && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                style={{ background: 'rgb(255 107 26 / 0.18)', color: 'var(--color-orange-500)' }}
              >
                <EditIcon size={11} />
                {Math.ceil(window.secondsRemaining / 60)}m to edit
              </span>
            )}
          </span>

          <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-purple-300)]">
            Track
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              <ArrowRightIcon size={13} />
            </span>
          </span>
        </div>
      </Link>
    </m.div>
  );
}

/** Compact variant for headers — one line, no chrome. */
export function ActiveOrderPill() {
  const hydrated = useHydrated();
  const orders = useOrders((s) => s.orders);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (!hydrated) return null;
  const live = orders.filter((o) => orderProgress(o, now).status !== 'DELIVERED');
  if (live.length === 0) return null;

  const soonest = live.reduce((a, b) =>
    orderProgress(a, now).secondsRemaining < orderProgress(b, now).secondsRemaining ? a : b,
  );
  const mins = Math.ceil(orderProgress(soonest, now).secondsRemaining / 60);

  return (
    <Link
      href={`/orders/${soonest.id}`}
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: 'rgb(34 197 94 / 0.15)', color: 'var(--color-success)' }}
    >
      <ClockIcon size={12} />
      {mins}m
    </Link>
  );
}
