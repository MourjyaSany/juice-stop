'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Money } from '@juice-stop/core';
import {
  ORDER_FLOW,
  STATUS_COPY,
  editWindow,
  orderProgress,
  toPaise,
  useOrders,
  type OrderStatus,
  type PlacedOrder,
} from '@/store/orders';
import { COMPLEX_NAME, blockLabel } from '@/data/blocks';
import { CheckIcon, ChevronLeftIcon, ClockIcon, EditIcon, MapPinIcon, PhoneIcon } from '@/components/icons';
import { BillSummary } from '@/components/bill-summary';
import { OrderEditSheet } from '@/components/order-edit-sheet';
import { Button, Card, EmptyState, SectionLabel, Skeleton, useHydrated } from '@/components/ui';
import { SPRING } from '@/components/motion-provider';
import { AnimatePresence, m } from 'motion/react';

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const orders = useOrders((s) => s.orders);
  const confirmNow = useOrders((s) => s.confirmNow);
  const order = orders.find((o) => o.id === params.id);
  const [editOpen, setEditOpen] = useState(false);

  // Re-render every second so the countdown and phase actually move. Cheap: one setState on a
  // page the customer is already staring at.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!hydrated) {
    return (
      <main className="min-h-dvh">
        <div className="pb-nav mx-auto w-full max-w-lg space-y-3 px-5 pt-6">
          <Skeleton className="h-10 w-48 rounded-[12px]" />
          <Skeleton className="h-56 w-full rounded-[18px]" />
        </div>
      </main>
    );
  }

  if (order === undefined) {
    return (
      <main className="min-h-dvh">
        <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
          <Card className="mt-6">
            <EmptyState
              icon={<ClockIcon size={26} />}
              title="Order not found"
              body="We couldn't find that order on this device."
              action={
                <Link
                  href="/orders"
                  className="pressable inline-flex h-11 items-center rounded-[12px] px-5 text-sm font-semibold text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  All orders
                </Link>
              }
            />
          </Card>
        </div>
      </main>
    );
  }

  const progress = orderProgress(order, now);
  const delivered = progress.status === 'DELIVERED';

  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <header className="flex items-center gap-3">
          <Link
            href="/orders"
            aria-label="All orders"
            className="pressable flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeftIcon size={19} />
          </Link>
          <div>
            <h1 className="font-mono text-sm font-semibold">{order.orderNumber}</h1>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {new Date(order.placedAt).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </header>

        <CountdownRing progress={progress} delivered={delivered} />

        <EditWindowCard
          order={order}
          now={now}
          onEdit={() => setEditOpen(true)}
          onConfirmNow={() => confirmNow(order.id)}
        />

        {/* Phase timeline */}
        <Card className="mt-7 p-4">
          <ol className="space-y-0">
            {ORDER_FLOW.map((step, index) => (
              <TimelineStep
                key={step}
                step={step}
                index={index}
                currentIndex={progress.stepIndex}
                stepProgress={progress.stepProgress}
                reachedAt={progress.reachedAt[step]}
                isLast={index === ORDER_FLOW.length - 1}
              />
            ))}
          </ol>
        </Card>

        {/* Delivery OTP — appears only once the rider is en route. */}
        {(progress.status === 'OUT_FOR_DELIVERY' || delivered) && (
          <Card className="mt-5 p-4 text-center" weight="strong">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
              Delivery OTP
            </p>
            <p className="tabular text-gradient mt-2 font-mono text-4xl font-bold tracking-[0.2em]">
              {order.otp}
            </p>
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              Show this to your rider
            </p>
          </Card>
        )}

        {/* Address */}
        <section className="mt-7">
          <SectionLabel>Delivering to</SectionLabel>
          <Card className="mt-3 p-4">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgb(168 85 247 / 0.15)', color: 'var(--color-purple-300)' }}
              >
                <MapPinIcon size={17} />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{order.address.label}</p>
                <p className="mt-0.5 leading-relaxed text-[var(--color-text-secondary)]">
                  {order.address.flatOrRoom}
                  {order.address.floor.length > 0 && `, Floor ${order.address.floor}`},{' '}
                  {blockLabel(order.address.block)}
                  <br />
                  {COMPLEX_NAME}
                  {order.address.landmark.length > 0 && ` · ${order.address.landmark}`}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                  <PhoneIcon size={13} />
                  {order.address.contactName} · {order.address.contactPhone}
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Bill */}
        <section className="mt-7">
          <SectionLabel>Order</SectionLabel>
          <Card className="mt-3 p-4">
            <ul className="space-y-2 text-sm">
              {order.lines.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[var(--color-text-secondary)]">
                    <span className="tabular">{l.quantity}×</span> {l.name}
                    {l.variantName.length > 0 && ` (${l.variantName})`}
                    {l.addOnNames.length > 0 && (
                      <span className="text-[var(--color-purple-300)]">
                        {' '}
                        + {l.addOnNames.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0">{Money.format(toPaise(l.totalPaiseStr))}</span>
                </li>
              ))}
            </ul>

            <div
              className="mt-3.5 border-t pt-3.5"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              {/* A settled receipt does not animate — a historical total has no reason to count up. */}
              <BillSummary
                subtotalPaise={toPaise(order.subtotalPaiseStr)}
                deliveryFeePaise={toPaise(order.deliveryFeePaiseStr)}
                handlingFeePaise={toPaise(order.handlingFeePaiseStr)}
                taxPaise={toPaise(order.taxPaiseStr)}
                totalPaise={toPaise(order.totalPaiseStr)}
                animate={false}
              />
              <p className="mt-2.5 text-right text-xs text-[var(--color-text-tertiary)]">
                Paid by {order.paymentMethod}
              </p>
            </div>
          </Card>
        </section>
      </div>

      <OrderEditSheet order={order} open={editOpen} onClose={() => setEditOpen(false)} />
    </main>
  );
}

/**
 * The 10-minute grace window.
 *
 * Two states, deliberately different in weight: while open it is a warm, prominent card with a
 * draining bar and a live countdown; once shut it collapses to a quiet locked strip. The change
 * in visual weight *is* the message — a customer should feel the window close, not have to read
 * that it did.
 */
function EditWindowCard({
  order,
  now,
  onEdit,
  onConfirmNow,
}: {
  order: PlacedOrder;
  now: number;
  onEdit: () => void;
  onConfirmNow: () => void;
}) {
  const window = editWindow(order, now);
  const minutes = Math.floor(window.secondsRemaining / 60);
  const seconds = window.secondsRemaining % 60;
  const urgent = window.secondsRemaining < 60;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {window.open ? (
        <m.div
          key="open"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SPRING.smooth}
          className="mt-7 rounded-[18px] p-4"
          style={{
            background: 'linear-gradient(135deg, rgb(255 107 26 / 0.12), rgb(168 85 247 / 0.08))',
            border: `1px solid ${urgent ? 'rgb(239 68 68 / 0.4)' : 'rgb(255 107 26 / 0.28)'}`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-[0.9375rem] font-bold">Need to change something?</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Add items, change quantities or remove things — the kitchen hasn&apos;t started yet.
              </p>
            </div>
            <span
              className="tabular flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
              style={{
                background: urgent ? 'rgb(239 68 68 / 0.18)' : 'rgb(255 107 26 / 0.18)',
                color: urgent ? 'var(--color-danger)' : 'var(--color-orange-500)',
              }}
            >
              <ClockIcon size={13} />
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
          </div>

          {/* Drains rather than fills — a shrinking bar reads as "running out". */}
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'rgb(0 0 0 / 0.35)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-linear"
              style={{
                width: `${Math.max(0, (1 - window.elapsed) * 100)}%`,
                background: urgent ? 'var(--color-danger)' : 'var(--gradient-brand)',
              }}
            />
          </div>

          <div className="mt-3.5 flex gap-2.5">
            <Button size="sm" className="flex-1" onClick={onEdit}>
              <EditIcon size={15} />
              Edit order
            </Button>
            {/* Skipping the window removes the 10-minute penalty for anyone who is already sure. */}
            <Button size="sm" variant="secondary" className="flex-1" onClick={onConfirmNow}>
              Cook it now
            </Button>
          </div>

          {order.editCount > 0 && (
            <p className="mt-2.5 text-center text-[11px] text-[var(--color-text-tertiary)]">
              Edited {order.editCount} {order.editCount === 1 ? 'time' : 'times'}
            </p>
          )}
        </m.div>
      ) : (
        <m.div
          key="closed"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.smooth}
          className="mt-7 flex items-center gap-2.5 rounded-[14px] px-4 py-3"
          style={{ background: 'var(--color-inset)', border: '1px solid var(--color-border-subtle)' }}
        >
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            <ClockIcon size={16} />
          </span>
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text-primary)]">
              This order is being prepared.
            </span>{' '}
            The edit window has closed and it can no longer be changed.
          </p>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function CountdownRing({
  progress,
  delivered,
}: {
  progress: ReturnType<typeof orderProgress>;
  delivered: boolean;
}) {
  const minutes = Math.floor(progress.secondsRemaining / 60);
  const seconds = progress.secondsRemaining % 60;

  const circumference = 2 * Math.PI * 54;
  const overall = Math.min(1, (progress.stepIndex + progress.stepProgress) / ORDER_FLOW.length);

  return (
    <section className="mt-8 flex flex-col items-center">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-inset)" strokeWidth="7" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="url(#ringGradient)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - overall)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
          <defs>
            <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF6B1A" />
              <stop offset="45%" stopColor="#FF3D81" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
          </defs>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {delivered ? (
            <>
              <span style={{ color: 'var(--color-success)' }}>
                <CheckIcon size={34} strokeWidth={2.4} />
              </span>
              <span className="mt-1 text-xs font-semibold text-[var(--color-success)]">
                Delivered
              </span>
            </>
          ) : (
            <>
              <span className="tabular font-display text-3xl font-bold">
                {minutes}:{String(seconds).padStart(2, '0')}
              </span>
              <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                {progress.isLate ? 'running late' : 'remaining'}
              </span>
            </>
          )}
        </div>
      </div>

      <p className="mt-5 font-display text-lg font-semibold">
        {STATUS_COPY[progress.status].label}
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        {STATUS_COPY[progress.status].line}
      </p>

      {progress.isLate && !delivered && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>
          Taking longer than promised. Sorry — it&apos;s on the way.
        </p>
      )}
    </section>
  );
}

function TimelineStep({
  step,
  index,
  currentIndex,
  stepProgress,
  reachedAt,
  isLast,
}: {
  step: OrderStatus;
  index: number;
  currentIndex: number;
  stepProgress: number;
  reachedAt: number | undefined;
  isLast: boolean;
}) {
  const done = index < currentIndex;
  const active = index === currentIndex;

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{
            background: done
              ? 'var(--color-success)'
              : active
                ? 'var(--gradient-brand)'
                : 'var(--color-inset)',
            border: done || active ? 'none' : '1px solid var(--color-border-strong)',
          }}
        >
          {done ? (
            <CheckIcon size={13} strokeWidth={3} className="text-black" />
          ) : active ? (
            <span className="animate-pulse-dot h-2 w-2 rounded-full bg-white" />
          ) : null}
        </span>

        {!isLast && (
          <span
            className="my-1 w-[2px] flex-1 rounded-full"
            style={{
              minHeight: 22,
              background: done
                ? 'var(--color-success)'
                : active
                  ? `linear-gradient(to bottom, var(--color-orange-500) ${stepProgress * 100}%, var(--color-inset) ${stepProgress * 100}%)`
                  : 'var(--color-inset)',
            }}
          />
        )}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <p
          className="text-sm font-semibold"
          style={{
            color:
              done || active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          {STATUS_COPY[step].label}
        </p>
        {active && (
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            {STATUS_COPY[step].line}
          </p>
        )}
        {reachedAt !== undefined && (done || active) && (
          <p className="tabular mt-0.5 text-xs text-[var(--color-text-tertiary)]">
            {new Date(reachedAt).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </li>
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
