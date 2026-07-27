'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { getStoreStatus, Money, toBusinessDate } from '@juice-stop/core';
import { priceCart, useCart } from '@/store/cart';
import { useOrders } from '@/store/orders';
import { checkProfileReadiness, useProfile } from '@/store/profile';
import { findBuilding } from '@/data/buildings';
import { CheckIcon, ChevronLeftIcon, MapPinIcon, UserIcon } from '@/components/icons';
import { BillSummary } from '@/components/bill-summary';
import { Button, Card, SectionLabel, Skeleton, useHydrated } from '@/components/ui';

type PaymentMethod = 'UPI' | 'CARD' | 'COD';

const METHODS: Array<{ id: PaymentMethod; label: string; note: string }> = [
  // UPI first and default: zero MDR by regulation in India, versus ~2% on cards. Every order
  // moved to UPI is straight margin (09-deployment.md §4).
  { id: 'UPI', label: 'UPI', note: 'GPay · PhonePe · Paytm' },
  { id: 'CARD', label: 'Card', note: 'Debit or credit' },
  { id: 'COD', label: 'Cash on delivery', note: 'Pay the rider' },
];

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

  const [addressId, setAddressId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  const selectedAddress =
    profile.addresses.find((a) => a.id === addressId) ?? readiness.defaultAddress;

  const blocked =
    !readiness.ready ||
    selectedAddress === null ||
    totals.itemCount === 0 ||
    !totals.meetsMinimum ||
    !status.acceptingOrders;

  const placeOrder = () => {
    if (blocked || selectedAddress === null || placing) return;
    setPlacing(true);

    const placedAt = Date.now();
    const building = findBuilding(selectedAddress.buildingId);

    // Honest ETA: kitchen prep + packing + travel including the building's own overhead
    // (lift queues, gate checks), scaled by current kitchen load (ADR-013).
    const travelSeconds = 6 * 60 + (building?.extraEtaMinutes ?? 3) * 60;
    const loadFactor = 1 + status.capacityLoad * 0.6;
    const etaSeconds = Math.round((totals.prepSeconds + 120 + travelSeconds) * loadFactor);

    const order = place({
      businessDate: toBusinessDate(new Date(placedAt)),
      placedAt,
      promisedAt: placedAt + etaSeconds * 1000,
      prepSeconds: totals.prepSeconds,
      paymentMethod: method,
      customerNote: note.trim(),
      // Prices are snapshotted here (ADR-011): a menu edit at 01:00 must never retroactively
      // change an order that has already been placed and paid for.
      lines: totals.lines.map((p) => ({
        name: p.item.name,
        variantName: p.item.variants.length > 1 ? p.variant.name : '',
        addOnNames: p.addOnNames,
        quantity: p.line.quantity,
        unitPaiseStr: p.unitPaise.toString(),
        totalPaiseStr: p.totalPaise.toString(),
        note: p.line.note,
      })),
      address: {
        label: selectedAddress.label,
        buildingName: building?.name ?? 'Unknown building',
        flatOrRoom: selectedAddress.flatOrRoom,
        floor: selectedAddress.floor,
        landmark: selectedAddress.landmark,
        contactName: selectedAddress.contactName,
        contactPhone: selectedAddress.contactPhone,
      },
      subtotalPaiseStr: totals.subtotalPaise.toString(),
      deliveryFeePaiseStr: totals.deliveryFeePaise.toString(),
      handlingFeePaiseStr: totals.handlingFeePaise.toString(),
      taxPaiseStr: totals.taxPaise.toString(),
      totalPaiseStr: totals.totalPaise.toString(),
    });

    clearCart();
    router.push(`/orders/${order.id}`);
  };

  if (!hydrated) {
    return (
      <main className="min-h-dvh">
        <div className="pb-nav mx-auto w-full max-w-lg space-y-3 px-5 pt-6">
          <Skeleton className="h-10 w-40 rounded-[12px]" />
          <Skeleton className="h-32 w-full rounded-[18px]" />
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

        {/* ① Profile gate — named gaps, with a direct route to fix them. */}
        {!readiness.ready && (
          <Card className="mt-5 p-4" style={{ borderColor: 'rgb(255 107 26 / 0.3)' }}>
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgb(255 107 26 / 0.15)', color: 'var(--color-orange-500)' }}
              >
                <UserIcon size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">Finish your profile first</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                  We still need {readiness.missing.join(', ')}.
                </p>
                <Link
                  href="/profile"
                  className="mt-3 inline-flex h-9 items-center rounded-[10px] px-4 text-xs font-semibold text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  Go to profile
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* ② Address */}
        {profile.addresses.length > 0 && (
          <section className="mt-7">
            <SectionLabel>Deliver to</SectionLabel>
            <div className="mt-3 space-y-2.5">
              {profile.addresses.map((a) => {
                const active = (selectedAddress?.id ?? '') === a.id;
                const building = findBuilding(a.buildingId);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddressId(a.id)}
                    aria-pressed={active}
                    className="pressable glass flex w-full items-start gap-3 rounded-[16px] p-3.5 text-left"
                    style={{ borderColor: active ? 'var(--color-orange-500)' : undefined }}
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: active ? 'var(--color-orange-500)' : 'var(--color-border-strong)',
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
                      <span className="block font-display text-sm font-semibold">{a.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {a.flatOrRoom}
                        {a.floor.length > 0 && `, Floor ${a.floor}`} · {building?.name}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">
                        {a.contactName} · {a.contactPhone}
                      </span>
                      {building?.gateNote !== undefined && (
                        <span
                          className="mt-1.5 block text-xs"
                          style={{ color: 'var(--color-warning)' }}
                        >
                          {building.gateNote}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <Link
              href="/profile"
              className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-[var(--color-purple-300)]"
            >
              <MapPinIcon size={13} />
              Manage addresses
            </Link>
          </section>
        )}

        {/* ③ Order summary */}
        <section className="mt-7">
          <SectionLabel>Order · {totals.itemCount} items</SectionLabel>
          <Card className="mt-3 p-4">
            <ul className="space-y-2 text-sm">
              {totals.lines.map((p) => (
                <li key={p.line.lineId} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[var(--color-text-secondary)]">
                    <span className="tabular">{p.line.quantity}×</span> {p.item.name}
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
          </Card>
        </section>

        {/* ④ Payment */}
        <section className="mt-7">
          <SectionLabel>Pay with</SectionLabel>
          <div className="mt-3 space-y-2">
            {METHODS.map((m) => {
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  aria-pressed={active}
                  className="pressable flex w-full items-center justify-between rounded-[14px] border px-4 py-3.5"
                  style={{
                    borderColor: active ? 'var(--color-orange-500)' : 'var(--color-border-subtle)',
                    background: active ? 'rgb(255 107 26 / 0.08)' : 'var(--color-inset)',
                  }}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-4 w-4 items-center justify-center rounded-full border-2"
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
                    <span className="text-left">
                      <span className="block text-sm font-semibold">{m.label}</span>
                      <span className="block text-xs text-[var(--color-text-secondary)]">
                        {m.note}
                      </span>
                    </span>
                  </span>
                  {m.id === 'UPI' && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: 'rgb(34 197 94 / 0.15)', color: 'var(--color-success)' }}
                    >
                      Fastest
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ⑤ Note */}
        <section className="mt-7">
          <SectionLabel>Note for the rider</SectionLabel>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            placeholder="Call when you reach the gate"
            className="mt-3 h-12 w-full rounded-[12px] border bg-[var(--color-inset)] px-4 text-base placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
          />
        </section>

        {!status.acceptingOrders && (
          <p
            className="mt-6 rounded-[12px] px-4 py-3 text-sm"
            style={{ background: 'rgb(255 107 26 / 0.12)', color: 'var(--color-orange-500)' }}
          >
            Ordering opens at 7 PM. Your cart is saved.
          </p>
        )}

        <div className="mt-6">
          <Button size="lg" className="w-full" disabled={blocked || placing} onClick={placeOrder}>
            {placing ? (
              'Placing…'
            ) : (
              <>
                <CheckIcon size={18} strokeWidth={2.4} />
                Place order · <span className="tabular">{Money.format(totals.totalPaise)}</span>
              </>
            )}
          </Button>
          <p className="mt-3 text-center text-xs text-[var(--color-text-tertiary)]">
            Payment is simulated — no gateway is connected yet.
          </p>
        </div>
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
