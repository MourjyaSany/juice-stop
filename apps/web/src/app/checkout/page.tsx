'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { getStoreStatus, Money, toBusinessDate } from '@juice-stop/core';
import { priceCart, useCart } from '@/store/cart';
import {
  EDIT_WINDOW_MS,
  PAYMENT_METHODS,
  useOrders,
  type FulfilmentType,
  type PaymentMethod,
} from '@/store/orders';
import { checkProfileReadiness, useProfile } from '@/store/profile';
import { COMPLEX_NAME, blockLabel } from '@/data/blocks';
import { estimateEtaSeconds, snapshotLines, snapshotTotals } from '@/lib/order-builder';
import {
  ApiError,
  api,
  storefrontApi,
  type ApiOrder,
  type PaymentMethodOption,
  type PaymentRequestDto,
} from '@/lib/api';
import { useAcceptingOrders } from '@/components/storefront-live';
import { FulfilmentToggle } from '@/components/checkout/fulfilment-toggle';
import { CheckoutExtras } from '@/components/checkout/extras';
import { BillSummary } from '@/components/bill-summary';
import { AnimatedPaise } from '@/components/animated-value';
import {
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
} from '@/components/icons';
import { Eyebrow, GlassPanel, TactileButton } from '@/components/system';
import { Skeleton, useHydrated } from '@/components/ui';
import { SPRING } from '@/components/motion-provider';

export default function CheckoutPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const profile = useProfile();
  const lines = useCart((s) => s.lines);
  const clearCart = useCart((s) => s.clear);
  const place = useOrders((s) => s.place);

  const totals = useMemo(() => priceCart(lines), [lines]);
  const status = getStoreStatus();
  const readiness = checkProfileReadiness(profile);

  const [fulfilment, setFulfilment] = useState<FulfilmentType>('DELIVERY');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  /**
   * Which methods the shop can take tonight, from the server.
   *
   * UPI depends on a payee being configured, so this cannot be a build-time constant. Until it
   * loads both are assumed available — the alternative is a checkout that flickers its payment
   * options on every visit, and the server rejects an unavailable method regardless.
   */
  const [methodOptions, setMethodOptions] = useState<PaymentMethodOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storefrontApi
      .paymentMethods()
      .then((r) => {
        if (cancelled) return;
        setMethodOptions(r.methods);
        // Never leave the customer sitting on a method the shop cannot take. Falling back to cash
        // is always safe: it needs no configuration and cannot be unavailable.
        if (r.methods.find((m) => m.id === 'UPI')?.available === false) setMethod('COD');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const methodAvailable = (id: PaymentMethod): boolean =>
    methodOptions?.find((m) => m.id === id)?.available ?? true;

  // Server-confirmed, so an owner who opened early unblocks checkout without anyone refreshing.
  // The API enforces this regardless — this only decides whether the button looks pressable.
  const takingOrders = useAcceptingOrders(status.acceptingOrders);

  const takeaway = fulfilment === 'TAKEAWAY';
  const selectedAddress =
    profile.addresses.find((a) => a.id === addressId) ?? readiness.defaultAddress;

  const deliveryMinutes = Math.round(
    estimateEtaSeconds(totals.prepSeconds, status.capacityLoad, 'DELIVERY') / 60,
  );
  const takeawayMinutes = Math.round(
    estimateEtaSeconds(totals.prepSeconds, status.capacityLoad, 'TAKEAWAY') / 60,
  );

  // Takeaway needs a name and phone but no address — so the profile gate is narrower.
  const identityReady =
    profile.fullName.trim().length >= 2 && /^[6-9]\d{9}$/.test(profile.phone.replace(/\D/g, ''));
  const profileOk = takeaway ? identityReady : readiness.ready;

  const blocked =
    !profileOk ||
    (!takeaway && selectedAddress === null) ||
    totals.itemCount === 0 ||
    !totals.meetsMinimum ||
    !takingOrders;

  const placeOrder = async () => {
    if (blocked || placing) return;
    setPlacing(true);
    setPlaceError(null);

    const placedAt = Date.now();
    const etaSeconds = estimateEtaSeconds(totals.prepSeconds, status.capacityLoad, fulfilment);
    const editableUntil = placedAt + EDIT_WINDOW_MS;

    const draft = {
      businessDate: toBusinessDate(new Date(placedAt)),
      placedAt,
      editableUntil,
      promisedAt: editableUntil + etaSeconds * 1000,
      prepSeconds: totals.prepSeconds,
      fulfilmentType: fulfilment,
      paymentMethod: method,
      customerNote: note.trim(),
      sourceLines: lines,
      lines: snapshotLines(totals),
      address:
        takeaway || selectedAddress === null
          ? null
          : {
              label: selectedAddress.label,
              block: selectedAddress.block,
              flatOrRoom: selectedAddress.flatOrRoom,
              floor: selectedAddress.floor,
              landmark: selectedAddress.landmark,
              contactName: selectedAddress.contactName,
              contactPhone: selectedAddress.contactPhone,
            },
      ...snapshotTotals(totals),
    };

    // Send it to the kitchen.
    //
    // This is the whole reason the order exists on a server at all: the API prices the lines from
    // the database (never from the client), mints the order number, OTP and pickup token, and
    // puts the ticket on the kitchen board. The local record below is for *tracking* — it is not
    // the order.
    let identity:
      | {
          id: string;
          orderNumber: string;
          otp: string;
          pickupToken: string | null;
          status: 'AWAITING_PAYMENT' | 'PLACED';
          paymentStatus: 'PENDING';
          paymentExpiresAt: number | null;
        }
      | undefined;
    let payment: PaymentRequestDto | null = null;
    try {
      const response = await api.post<{
        order: ApiOrder;
        otp: string;
        pickupToken: string | null;
        payment: PaymentRequestDto | null;
      }>(
        '/orders',
        {
          fulfilmentType: fulfilment,
          paymentMethod: method,
          ...(note.trim().length > 0 ? { customerNote: note.trim() } : {}),
          ...(profile.fullName.trim().length > 0 ? { customerName: profile.fullName.trim() } : {}),
          ...(takeaway || selectedAddress === null
            ? {}
            : {
                address: {
                  label: selectedAddress.label,
                  block: selectedAddress.block,
                  flatOrRoom: selectedAddress.flatOrRoom,
                  ...(selectedAddress.floor !== '' ? { floor: selectedAddress.floor } : {}),
                  ...(selectedAddress.landmark !== '' ? { landmark: selectedAddress.landmark } : {}),
                  contactName: selectedAddress.contactName,
                  contactPhone: selectedAddress.contactPhone,
                },
              }),
          lines: totals.lines.map((line) => ({
            itemId: line.item.id,
            variantId: line.variant.id,
            addOnIds: line.line.addOnIds,
            quantity: line.line.quantity,
            ...(line.line.note !== '' ? { note: line.line.note } : {}),
          })),
        },
      );
      identity = {
        id: response.order.id,
        orderNumber: response.order.orderNumber,
        otp: response.otp,
        pickupToken: response.pickupToken,
        status: response.order.status === 'AWAITING_PAYMENT' ? 'AWAITING_PAYMENT' : 'PLACED',
        paymentStatus: 'PENDING',
        paymentExpiresAt:
          response.order.paymentExpiresAt != null
            ? new Date(response.order.paymentExpiresAt).getTime()
            : null,
      };
      payment = response.payment;
    } catch (cause) {
      // Stop here rather than falling back to a local-only order. A "placed" order the kitchen
      // never received is the worst possible outcome — the customer waits for food nobody is
      // cooking. Better to say so and let them retry.
      setPlaceError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not reach the kitchen. Check your connection and try again.',
      );
      setPlacing(false);
      return;
    }

    const order = place(draft, identity);

    clearCart();

    // A prepaid order is not confirmed yet — nothing has been paid and the kitchen has not been
    // told. Sending the customer to a confirmation screen here would be the same lie the old
    // hardcoded `paymentStatus: 'PAID'` told. Pay first; confirmation follows the money.
    router.push(
      payment !== null ? `/orders/${order.id}/pay` : `/orders/${order.id}/confirmation`,
    );
  };

  if (!hydrated) {
    return (
      <main className="min-h-dvh">
        <div className="pb-nav mx-auto w-full max-w-lg space-y-3 px-5 pt-6">
          <Skeleton className="h-10 w-40 rounded-[12px]" />
          <Skeleton className="h-20 w-full rounded-[18px]" />
          <Skeleton className="h-48 w-full rounded-[18px]" />
        </div>
      </main>
    );
  }

  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <header className="flex items-center gap-3">
          <Link
            href="/cart"
            aria-label="Back to cart"
            className="pressable flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeftIcon size={19} />
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Checkout</h1>
        </header>

        {/* ── How you want it ──────────────────────────────────────────────────────────────── */}
        <section className="mt-7">
          <Eyebrow tone="warm">How you want it</Eyebrow>
          <div className="mt-3">
            <FulfilmentToggle
              value={fulfilment}
              onChange={setFulfilment}
              deliveryMinutes={deliveryMinutes}
              takeawayMinutes={takeawayMinutes}
            />
          </div>
        </section>

        {/* ── Profile gate ─────────────────────────────────────────────────────────────────── */}
        {!profileOk && (
          <GlassPanel className="mt-5 p-4" style={{ borderColor: 'rgb(255 107 26 / 0.3)' }}>
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgb(255 107 26 / 0.15)', color: 'var(--color-orange-500)' }}
              >
                <UserIcon size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold">Finish your profile first</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  We still need{' '}
                  {takeaway
                    ? 'your name and a valid phone number'
                    : readiness.missing.join(', ')}
                  .
                </p>
                <Link
                  href="/profile"
                  className="mt-3 inline-flex h-9 items-center rounded-[10px] px-4 text-xs font-bold text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  Go to profile
                </Link>
              </div>
            </div>
          </GlassPanel>
        )}

        {/* ── Where ────────────────────────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait" initial={false}>
          {takeaway ? (
            <m.section
              key="pickup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING.smooth}
              className="mt-7"
            >
              <Eyebrow tone="violet">Collection</Eyebrow>
              <GlassPanel className="mt-3 p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'rgb(168 85 247 / 0.16)', color: 'var(--color-purple-300)' }}
                  >
                    <MapPinIcon size={17} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-display font-bold">Juice Stop counter</p>
                    <p className="mt-0.5 leading-relaxed text-[var(--color-text-secondary)]">
                      {COMPLEX_NAME}, Kattankulathur
                    </p>
                    <ul className="mt-3 space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                      <li className="flex gap-2">
                        <span style={{ color: 'var(--color-orange-500)' }}>1.</span>
                        We&apos;ll give you a collection code the moment you order.
                      </li>
                      <li className="flex gap-2">
                        <span style={{ color: 'var(--color-orange-500)' }}>2.</span>
                        Wait for &ldquo;Ready for pickup&rdquo; — the app counts it down.
                      </li>
                      <li className="flex gap-2">
                        <span style={{ color: 'var(--color-orange-500)' }}>3.</span>
                        Show the code or QR at the counter. That&apos;s it.
                      </li>
                    </ul>
                  </div>
                </div>
              </GlassPanel>
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[var(--color-success)]">
                <CheckIcon size={13} strokeWidth={2.6} />
                No delivery wait — roughly {deliveryMinutes - takeawayMinutes} minutes faster.
              </p>
            </m.section>
          ) : (
            profile.addresses.length > 0 && (
              <m.section
                key="address"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING.smooth}
                className="mt-7"
              >
                <Eyebrow tone="warm">Deliver to</Eyebrow>
                <div className="mt-3 space-y-2.5">
                  {profile.addresses.map((a) => {
                    const active = (selectedAddress?.id ?? '') === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAddressId(a.id)}
                        aria-pressed={active}
                        className="pressable flex w-full items-start gap-3 rounded-[16px] p-3.5 text-left transition-colors duration-200"
                        style={{
                          background: active
                            ? 'linear-gradient(140deg, rgb(255 107 26 / 0.10), rgb(168 85 247 / 0.07))'
                            : 'var(--color-inset)',
                          border: `1px solid ${active ? 'rgb(255 107 26 / 0.35)' : 'var(--color-border-subtle)'}`,
                        }}
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                          style={{
                            borderColor: active
                              ? 'var(--color-orange-500)'
                              : 'var(--color-border-strong)',
                          }}
                        >
                          {active && (
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: 'var(--color-orange-500)' }}
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="font-display text-sm font-bold">{a.label}</span>
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                              style={{
                                background: 'rgb(255 107 26 / 0.16)',
                                color: 'var(--color-orange-500)',
                              }}
                            >
                              {blockLabel(a.block)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-text-secondary)]">
                            {a.flatOrRoom}
                            {a.floor.length > 0 && `, Floor ${a.floor}`} · {COMPLEX_NAME}
                          </span>
                          <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">
                            {a.contactName} · {a.contactPhone}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Link
                  href="/profile"
                  className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-purple-300)]"
                >
                  <MapPinIcon size={13} />
                  Manage addresses
                </Link>
              </m.section>
            )
          )}
        </AnimatePresence>

        {/* ── Extras ───────────────────────────────────────────────────────────────────────────
            Placed immediately above the order summary so an addition is confirmed by the line and
            the total moving directly beneath the tap, rather than somewhere off screen. */}
        <CheckoutExtras />

        {/* ── Order ────────────────────────────────────────────────────────────────────────── */}
        <section className="mt-7">
          <Eyebrow>Order · {totals.itemCount} items</Eyebrow>
          <GlassPanel className="mt-3 p-4">
            <ul className="space-y-2 text-sm">
              {totals.lines.map((p) => (
                <li key={p.line.lineId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[var(--color-text-secondary)]">
                    <span className="tabular font-semibold text-[var(--color-orange-500)]">
                      {p.line.quantity}×
                    </span>{' '}
                    {p.item.name}
                    {p.item.variants.length > 1 && ` (${p.variant.name})`}
                    {p.addOnNames.length > 0 && (
                      <span className="text-[var(--color-purple-300)]">
                        {' '}
                        + {p.addOnNames.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0">{Money.format(p.totalPaise)}</span>
                </li>
              ))}
            </ul>

            <div
              className="mt-3.5 border-t pt-3.5"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <BillSummary
                subtotalPaise={totals.subtotalPaise}
                deliveryFeePaise={totals.deliveryFeePaise}
                handlingFeePaise={totals.handlingFeePaise}
                taxPaise={totals.taxPaise}
                totalPaise={totals.totalPaise}
              />
            </div>
          </GlassPanel>
        </section>

        {/* ── Pay ──────────────────────────────────────────────────────────────────────────── */}
        <section className="mt-7">
          <Eyebrow tone="violet">Pay with</Eyebrow>
          <div className="mt-3 grid gap-2.5">
            {PAYMENT_METHODS.map((m2) => {
              const available = methodAvailable(m2.id);
              const active = method === m2.id && available;
              const reason = methodOptions?.find((o) => o.id === m2.id)?.unavailableReason;
              return (
                <button
                  key={m2.id}
                  type="button"
                  disabled={!available}
                  onClick={() => setMethod(m2.id)}
                  aria-pressed={active}
                  className="pressable relative rounded-[14px] px-3.5 py-3 text-left transition-colors duration-200 disabled:cursor-not-allowed"
                  style={{
                    background: active
                      ? 'linear-gradient(140deg, rgb(255 107 26 / 0.12), rgb(168 85 247 / 0.08))'
                      : 'var(--color-inset)',
                    border: `1px solid ${active ? 'rgb(255 107 26 / 0.4)' : 'var(--color-border-subtle)'}`,
                    opacity: available ? 1 : 0.45,
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold">{m2.label}</span>
                    {m2.id === 'UPI' && available && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{ background: 'rgb(34 197 94 / 0.16)', color: 'var(--color-success)' }}
                      >
                        PAY NOW
                      </span>
                    )}
                    {m2.id === 'COD' && available && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{ background: 'rgb(234 179 8 / 0.18)', color: 'var(--color-warning)' }}
                      >
                        PAY LATER
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--color-text-secondary)]">
                    {/* A disabled button with no explanation is a dead end. Say why. */}
                    {available ? m2.note : (reason ?? 'Unavailable right now.')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* What happens after the tap, stated before it.
              The kitchen genuinely does not start a UPI order until the money lands, so promising
              anything else here would be setting up the first broken status of the night. */}
          <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
            {method === 'UPI'
              ? 'You’ll get a QR for the exact amount. The kitchen starts once the payment is confirmed.'
              : `Keep ${Money.format(totals.totalPaise)} ready — the rider collects it at your door.`}
          </p>
        </section>

        {/* ── Note ─────────────────────────────────────────────────────────────────────────── */}
        <section className="mt-7">
          <Eyebrow>{takeaway ? 'Note for the kitchen' : 'Note for the rider'}</Eyebrow>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            placeholder={takeaway ? 'Extra napkins, no cutlery…' : 'Call when you reach the gate'}
            className="mt-3 h-12 w-full rounded-[13px] border bg-[var(--color-inset)] px-4 text-base placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          />
        </section>

        {!takingOrders && (
          <p
            className="mt-6 rounded-[13px] px-4 py-3 text-sm"
            style={{ background: 'rgb(255 107 26 / 0.12)', color: 'var(--color-orange-500)' }}
          >
            Ordering opens at 7 PM. Your cart is saved.
          </p>
        )}

        {placeError !== null && (
          <p
            role="alert"
            className="mt-6 rounded-[13px] px-4 py-3 text-sm"
            style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
          >
            {placeError}
          </p>
        )}

        <div className="mt-7">
          <TactileButton
            size="lg"
            className="w-full"
            disabled={blocked || placing}
            onClick={() => void placeOrder()}
          >
            {placing ? (
              'Placing…'
            ) : (
              <>
                <CheckIcon size={18} strokeWidth={2.4} />
                {/* The button says what the next screen does. "Place order" followed by a QR is a
                    small surprise, and surprises on a payment screen cost trust. */}
                {method === 'UPI' ? 'Pay' : takeaway ? 'Confirm pickup' : 'Place order'} ·{' '}
                <AnimatedPaise value={totals.totalPaise} />
              </>
            )}
          </TactileButton>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
            <ClockIcon size={12} />
            {takeaway ? `Ready in ~${takeawayMinutes} min` : `Arrives in ~${deliveryMinutes} min`} ·
            10 minutes to change your mind
          </p>
        </div>
      </div>
    </main>
  );
}
