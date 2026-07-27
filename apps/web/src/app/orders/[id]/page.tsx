'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Money } from '@juice-stop/core';
import {
  ORDER_FLOW,
  STATUS_COPY,
  orderProgress,
  toPaise,
  useOrders,
  type OrderStatus,
  type PlacedOrder,
} from '@/store/orders';
import { CheckIcon, ChevronLeftIcon, ClockIcon, MapPinIcon, PhoneIcon } from '@/components/icons';
import { Card, EmptyState, SectionLabel, Skeleton, useHydrated } from '@/components/ui';

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const orders = useOrders((s) => s.orders);
  const order = orders.find((o) => o.id === params.id);

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
                  {order.address.floor.length > 0 && `, Floor ${order.address.floor}`}
                  <br />
                  {order.address.buildingName}
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

            <dl
              className="mt-3 space-y-2 border-t pt-3 text-sm"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <Row label="Item total" value={Money.format(toPaise(order.subtotalPaiseStr))} />
              <Row label="Delivery" value="FREE" valueClass="text-[var(--color-success)] font-semibold" />
              <Row label="Packaging" value={Money.format(toPaise(order.packagingFeePaiseStr))} />
              <Row label="GST (5%)" value={Money.format(toPaise(order.taxPaiseStr))} />
              <div
                className="!mt-3 flex items-baseline justify-between border-t pt-3"
                style={{ borderColor: 'var(--color-border-subtle)' }}
              >
                <dt className="font-display text-sm font-semibold">
                  Paid · {order.paymentMethod}
                </dt>
                <dd className="tabular font-display text-lg font-bold">
                  {Money.format(toPaise(order.totalPaiseStr))}
                </dd>
              </div>
            </dl>
          </Card>
        </section>
      </div>
    </main>
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
