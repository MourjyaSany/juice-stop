'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Money } from '@juice-stop/core';
import { storefrontApi, type PaymentRequestDto } from '@/lib/api';
import { isAwaitingPayment, paymentLapsed, toPaise, useOrders } from '@/store/orders';
import { GlassPanel, TactileButton } from '@/components/system';
import { EmptyState, Skeleton, useHydrated } from '@/components/ui';
import { ClockIcon, CheckIcon } from '@/components/icons';
import { SPRING } from '@/components/motion-provider';

/**
 * Pay by UPI.
 *
 * The whole screen exists because a UPI deep link cannot report back. The customer pays into the
 * shop's account and **nothing tells the server** — so this page shows the QR, then waits for the
 * order's status to change from the one place that can know: the shop confirming receipt.
 *
 * Two rules govern the copy here, and both are about not spending trust:
 *
 *  1. Never claim the payment is confirmed before it is. The status comes from the server via the
 *     order sync in the root layout, never from "the customer tapped the button".
 *  2. Say who is confirming. On the direct-UPI path a person at the counter is watching their
 *     banking app, which during service is seconds — but it is a person, and telling someone
 *     "confirming automatically" when it is not sets up the first broken promise of the night.
 *
 * The written amount is at least as prominent as the QR, for the same reason the pickup code is:
 * scanners fail, screens crack, and a customer who can read a number can still pay.
 */
export default function PayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const hydrated = useHydrated();
  const reduced = useReducedMotion();

  const order = useOrders((s) => s.orders.find((o) => o.id === params.id));

  const [payment, setPayment] = useState<PaymentRequestDto | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetched rather than passed through navigation state, so a refresh, a locked phone or a return
  // trip from a banking app all land on a working screen. The server re-serves the *existing*
  // deadline, so reloading cannot extend the window.
  useEffect(() => {
    let cancelled = false;
    void storefrontApi
      .paymentFor(params.id, order?.accessToken)
      .then((r) => {
        if (!cancelled) setPayment(r.payment);
      })
      .catch(() => {
        // Most often this means the order is no longer awaiting payment — it was confirmed while
        // the page was loading, and the redirect below will take over.
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // The QR encoder is ~20 kB and only this screen and the pickup code need it.
  useEffect(() => {
    if (payment === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const QR = await import('qrcode');
        const svg = await QR.toString(payment.upiUri, {
          type: 'svg',
          // Higher correction than the pickup code: this is scanned off a phone screen, often at
          // an angle with a thumb across one corner.
          errorCorrectionLevel: 'Q',
          margin: 1,
          color: { dark: '#0B0B0F', light: '#FFFFFF' },
        });
        if (!cancelled) setQr(svg);
      } catch {
        // The UPI ID and amount are still on screen, so paying by hand remains possible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payment]);

  // The money landed. Nothing on this screen is useful any more.
  useEffect(() => {
    if (order !== undefined && !isAwaitingPayment(order) && !paymentLapsed(order)) {
      router.replace(`/orders/${params.id}/confirmation`);
    }
  }, [order, params.id, router]);

  if (!hydrated) {
    return (
      <main className="min-h-dvh">
        <div className="pb-nav mx-auto w-full max-w-lg space-y-3 px-5 pt-6">
          <Skeleton className="h-8 w-40 rounded-[12px]" />
          <Skeleton className="h-[420px] w-full rounded-[22px]" />
        </div>
      </main>
    );
  }

  if (order === undefined) {
    return (
      <Shell>
        <EmptyState
          icon={<ClockIcon size={26} />}
          title="Order not found"
          body="We couldn't find that order on this device."
          action={
            <Link
              href="/menu"
              className="pressable inline-flex h-11 items-center rounded-[12px] px-5 text-sm font-semibold text-white"
              style={{ background: 'var(--gradient-brand)' }}
            >
              Back to the menu
            </Link>
          }
        />
      </Shell>
    );
  }

  const expiresAt = payment !== null ? Date.parse(payment.expiresAt) : (order.paymentExpiresAt ?? 0);
  const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const lapsed = paymentLapsed(order) || (expiresAt > 0 && secondsLeft === 0);

  if (lapsed) {
    return (
      <Shell>
        <EmptyState
          icon={<ClockIcon size={26} />}
          title="Payment window closed"
          body="Nothing was charged. Your cart is still saved — start the order again whenever you're ready."
          action={
            <Link
              href="/cart"
              className="pressable inline-flex h-11 items-center rounded-[12px] px-5 text-sm font-semibold text-white"
              style={{ background: 'var(--gradient-brand)' }}
            >
              Back to cart
            </Link>
          }
        />
      </Shell>
    );
  }

  const total = toPaise(order.totalPaiseStr);
  const manual = payment?.confirmation !== 'AUTOMATIC';

  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <header className="text-center">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            Pay to confirm
          </p>
          <p
            className="tabular mt-1.5 font-display text-[2.75rem] font-bold leading-none"
            style={{
              background: 'linear-gradient(115deg, #FF8A3D, #FF3D81 50%, #C084FC)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {Money.format(total)}
          </p>
          <p className="mt-1.5 font-mono text-xs text-[var(--color-text-tertiary)]">
            {order.orderNumber}
          </p>
        </header>

        <m.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.smooth}
          className="mt-6"
        >
          <GlassPanel weight="strong" radius={22} className="overflow-hidden p-5">
            {/* White plate: a QR rendered on a dark surface is unreliable under a phone camera. */}
            <div className="flex justify-center">
              {qr !== null ? (
                <m.div
                  initial={reduced ? false : { scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING.bouncy}
                  className="rounded-[16px] bg-white p-3"
                  style={{ boxShadow: '0 10px 30px -12px rgb(0 0 0 / 0.8)' }}
                  // Generated in-process from our own URI — no user input reaches this string.
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              ) : loadFailed ? (
                <p className="py-10 text-center text-sm text-[var(--color-text-secondary)]">
                  Could not load the payment code. Pull down to retry.
                </p>
              ) : (
                <div className="skeleton h-[208px] w-[208px] rounded-[16px]" />
              )}
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Scan with GPay, PhonePe, Paytm or any UPI app.
              <br />
              The amount is locked — you can&apos;t be charged more.
            </p>

            {/* Same-device path. Most customers order and pay on one phone, where scanning your own
                screen is impossible; the deep link hands them straight to their UPI app. */}
            {payment !== null && (
              <a href={payment.upiUri} className="mt-4 block">
                <TactileButton size="lg" className="w-full">
                  Open my UPI app
                </TactileButton>
              </a>
            )}
          </GlassPanel>
        </m.div>

        {/* ── Waiting state ──────────────────────────────────────────────────────────────────── */}
        <div
          className="mt-4 flex items-start gap-3 rounded-[16px] px-4 py-3.5"
          style={{
            background: 'rgb(234 179 8 / 0.10)',
            border: '1px solid rgb(234 179 8 / 0.24)',
          }}
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <span
              className="h-2.5 w-2.5 animate-pulse rounded-full"
              style={{ background: 'var(--color-warning)' }}
              aria-hidden
            />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold" style={{ color: 'var(--color-warning)' }}>
              Waiting for your payment
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {/* The honest sentence. A person at the counter confirms this, and saying so is the
                  difference between a short wait and a broken promise. */}
              {manual
                ? 'The counter confirms it the moment it lands — usually within a minute. This screen updates by itself.'
                : 'This confirms automatically within a few seconds. This screen updates by itself.'}
            </p>
            {secondsLeft > 0 && (
              <p className="tabular mt-2 text-xs font-semibold text-[var(--color-text-tertiary)]">
                {formatCountdown(secondsLeft)} left to pay
              </p>
            )}
          </div>
        </div>

        {/* ── If something goes wrong ────────────────────────────────────────────────────────── */}
        <div className="mt-4 rounded-[14px] px-4 py-3" style={{ background: 'var(--color-inset)' }}>
          <p className="text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
            Paid but still waiting? Show this reference at the counter or on the phone:{' '}
            <span className="tabular font-mono font-semibold text-[var(--color-text-secondary)]">
              {payment?.reference ?? order.orderNumber}
            </span>
            . Nothing is charged twice — if the payment did not go through, the order simply lapses.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
          <CheckIcon size={12} strokeWidth={2.6} />
          You can change the order for 10 minutes after it&apos;s confirmed
        </div>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-16">{children}</div>
    </main>
  );
}

const formatCountdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
