'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Money } from '@juice-stop/core';
import { toPaise, useOrders } from '@/store/orders';
import { COMPLEX_NAME, blockLabel } from '@/data/blocks';
import { ArrowRightIcon, CheckIcon, ClockIcon, MapPinIcon } from '@/components/icons';
import { AuroraField, GlassPanel, ParticleField, TactileButton } from '@/components/system';
import { Skeleton, useHydrated } from '@/components/ui';
import { SPRING } from '@/components/motion-provider';

/**
 * The success moment.
 *
 * A deliberate pause between paying and tracking. Checkout ends in a decision that costs money;
 * dropping the customer straight onto a progress timeline gives them no beat to register that it
 * worked. This screen exists to say *yes, that landed*, hand over the pickup code if there is
 * one, and then get out of the way.
 */
export default function ConfirmationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const orders = useOrders((s) => s.orders);
  const order = orders.find((o) => o.id === params.id);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!hydrated) {
    return (
      <main className="min-h-dvh">
        <div className="mx-auto w-full max-w-lg space-y-4 px-5 pt-24">
          <Skeleton className="mx-auto h-24 w-24 rounded-full" />
          <Skeleton className="mx-auto h-8 w-56 rounded-[12px]" />
        </div>
      </main>
    );
  }

  if (order === undefined) {
    router.replace('/orders');
    return null;
  }

  const takeaway = order.fulfilmentType === 'TAKEAWAY';
  const etaMinutes = Math.max(1, Math.round((order.promisedAt - Date.now()) / 60000));

  return (
    <main className="page-in relative flex min-h-dvh flex-col overflow-hidden">
      <AuroraField intensity={1.2} />
      <ParticleField count={24} seed={19} />

      <div className="pb-nav mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-10">
        {/* ── The beat ───────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center">
          <m.div
            className="relative flex h-24 w-24 items-center justify-center rounded-full"
            initial={reduced ? false : { scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING.bouncy, delay: 0.05 }}
            style={{
              background: 'linear-gradient(135deg, #FF6B1A 0%, #FF3D81 50%, #A855F7 100%)',
              boxShadow: '0 20px 60px -18px rgb(255 107 26 / 0.9)',
            }}
          >
            {/* One expanding ring, once. A looping pulse would turn a moment into an animation. */}
            <m.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              initial={{ scale: 1, opacity: 0.55 }}
              animate={reduced ? {} : { scale: 1.9, opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              style={{ border: '2px solid rgb(255 138 61 / 0.9)' }}
            />
            <m.span
              initial={reduced ? false : { scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...SPRING.bouncy, delay: 0.22 }}
              className="text-white"
            >
              <CheckIcon size={44} strokeWidth={2.6} />
            </m.span>
          </m.div>

          <m.h1
            className="mt-7 font-display text-[clamp(1.75rem,7vw,2.25rem)] font-bold leading-[1.05] tracking-[-0.03em]"
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.smooth, delay: 0.3 }}
          >
            {takeaway ? 'Pickup confirmed.' : 'Mission accepted.'}
          </m.h1>

          <m.p
            className="mt-2.5 max-w-[19rem] text-sm leading-relaxed text-[var(--color-text-secondary)]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {takeaway
              ? 'The kitchen is on it. Come collect when we tell you it’s ready.'
              : 'Kitchen is locked in. We’ll bring it to your door.'}
          </m.p>

          <m.p
            className="mt-4 font-mono text-xs tracking-wide text-[var(--color-text-tertiary)]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {order.orderNumber}
          </m.p>
        </div>

        {/* ── Pickup code — the one thing they must not lose ─────────────────────────────── */}
        {takeaway && order.pickupToken !== null && (
          <m.div
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.smooth, delay: 0.55 }}
            className="mt-8"
          >
            <GlassPanel weight="strong" radius={22} className="p-5 text-center">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                Your collection code
              </p>
              <p
                className="tabular mt-2.5 font-mono text-4xl font-bold tracking-[0.14em]"
                style={{
                  background: 'linear-gradient(115deg, #FF8A3D, #FF3D81 50%, #C084FC)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {order.pickupToken}
              </p>
              <p className="mt-2.5 text-xs text-[var(--color-text-secondary)]">
                Quote this at the counter. The QR is on your tracking screen.
              </p>
            </GlassPanel>
          </m.div>
        )}

        {/* ── At a glance ────────────────────────────────────────────────────────────────── */}
        <m.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.smooth, delay: takeaway ? 0.65 : 0.55 }}
          className="mt-6"
        >
          <GlassPanel radius={20} className="divide-y" style={{ borderColor: undefined }}>
            <Row
              icon={<ClockIcon size={16} />}
              label={takeaway ? 'Ready in' : 'Arrives in'}
              value={`~${etaMinutes} min`}
            />
            <Row
              icon={<MapPinIcon size={16} />}
              label={takeaway ? 'Collect from' : 'Delivering to'}
              value={
                takeaway
                  ? 'Juice Stop counter'
                  : order.address !== null
                    ? `${order.address.flatOrRoom}, ${blockLabel(order.address.block)}`
                    : COMPLEX_NAME
              }
            />
            {/* Cash is not paid, and saying "Paid · COD" would be the same fiction the hardcoded
                payment status used to tell. A customer who reads "Pay ₹359.10 at the door" has the
                cash ready when the rider knocks, which is the entire point of telling them. */}
            <Row
              icon={<CheckIcon size={16} />}
              label={
                order.paymentMethod === 'COD'
                  ? 'Pay the rider in cash'
                  : `Paid · ${order.paymentMethod}`
              }
              value={Money.format(toPaise(order.totalPaiseStr))}
              emphasise
            />
          </GlassPanel>
        </m.div>

        {/* ── Onward ─────────────────────────────────────────────────────────────────────── */}
        <m.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.smooth, delay: 0.72 }}
          className="mt-7 space-y-2.5"
        >
          <Link href={`/orders/${order.id}`} className="block">
            <TactileButton size="lg" className="w-full">
              Track it live
              <ArrowRightIcon size={18} strokeWidth={2.4} />
            </TactileButton>
          </Link>
          <Link href="/menu" className="block">
            <TactileButton size="lg" variant="glass" className="w-full">
              Back to the menu
            </TactileButton>
          </Link>
        </m.div>

        <p className="mt-5 text-center text-[11px] text-[var(--color-text-tertiary)]">
          You have 10 minutes to change this order. {elapsed > 0 && `${elapsed}s elapsed.`}
        </p>
      </div>
    </main>
  );
}

function Row({
  icon,
  label,
  value,
  emphasise = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3.5"
      style={{ borderColor: 'rgb(255 255 255 / 0.06)' }}
    >
      <span className="flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]">
        <span style={{ color: 'var(--color-text-tertiary)' }}>{icon}</span>
        {label}
      </span>
      <span
        className={`tabular text-right text-sm ${emphasise ? 'font-display text-base font-bold' : 'font-medium'}`}
      >
        {value}
      </span>
    </div>
  );
}
