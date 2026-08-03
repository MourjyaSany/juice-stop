'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Money, toBusinessDate } from '@juice-stop/core';
import { ApiError } from '@/lib/api';
import { admin, toPaise, type OwnerOverview } from '@/lib/kitchen-api';
import { AdminShell } from '@/components/admin/shell';
import { PizzaLoader } from '@/components/pizza-loader';
import { StaffPanel } from '@/components/staff/glass';
import { Delta, HourlyChart, RankedBars, RevenueBars, SplitBar } from '@/components/admin/charts';
import { StoreControl } from '@/components/admin/store-control';
import { useKitchenStream } from '@/components/kitchen/use-kitchen-stream';

/**
 * Owner dashboard.
 *
 * Reads only — every figure is derived from orders and the status audit trail, so this screen can
 * never become a second source of truth about what happened in the shop.
 *
 * **Live, and now genuinely so.** This used to poll on a slow timer only, on the reasoning that the
 * kitchen stream carries customer names and addresses. That reasoning does not survive contact with
 * this screen: the owner already reads customer names in the activity feed and full contact details
 * in the CSV export, so the stream tells them nothing they are not authorised to see. It is gated
 * server-side on a signed ADMIN role either way.
 *
 * So: events drive an immediate refresh, and the timer stays as a floor. Same shape as the kitchen
 * board — REST is the truth, events are the accelerant — because an owner watching a rush wants the
 * revenue figure to move when an order lands, not up to thirty seconds later.
 */

const REFRESH_MS = 30_000;

type Preset = 'today' | 'week' | 'month';

export default function AdminOverviewPage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const window_ = useMemo(() => windowFor(preset), [preset]);

  const load = useCallback(async () => {
    try {
      setData(await admin.overview(window_.from, window_.to));
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) return;
      setError('Could not load the figures — retrying.');
    } finally {
      setLoading(false);
    }
  }, [window_.from, window_.to]);

  useEffect(() => {
    setLoading(true);
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Every order event refetches rather than patching state from the payload. Two code paths in
  // charge of what a revenue figure says is how a dashboard starts disagreeing with the database.
  const stream = useKitchenStream(
    useCallback(
      (event: { type: string }) => {
        if (event.type === 'ping') return;
        void load();
      },
      [load],
    ),
  );

  return (
    <AdminShell
      header={
        <header
          className="sticky top-0 z-20 border-b px-4 py-3 lg:px-6"
          style={{
            borderColor: 'var(--color-border-subtle)',
            background: 'color-mix(in srgb, var(--color-canvas) 88%, transparent)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 font-display text-lg font-bold">
                Overview
                {/* Honest connection lamp, same as the kitchen board's. A dashboard that looks live
                    while its stream is dead is worse than one that admits it is polling. */}
                <span
                  title={stream === 'live' ? 'Live' : stream === 'connecting' ? 'Connecting' : 'Polling only'}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    background: stream === 'live' ? 'rgb(34 197 94 / 0.16)' : 'var(--color-inset)',
                    color:
                      stream === 'live' ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${stream === 'live' ? 'animate-pulse' : ''}`}
                    style={{
                      background:
                        stream === 'live' ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                    }}
                    aria-hidden
                  />
                  {stream === 'live' ? 'Live' : stream === 'connecting' ? '…' : 'Polling'}
                </span>
              </h1>
              <p className="tabular text-xs text-[var(--color-text-tertiary)]">
                {window_.from === window_.to ? window_.from : `${window_.from} → ${window_.to}`}
                {' · service nights, not calendar days'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['today', 'week', 'month'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreset(id)}
                  aria-pressed={preset === id}
                  className="h-10 rounded-[10px] px-3.5 text-xs font-semibold capitalize"
                  style={{
                    background: preset === id ? 'rgb(168 85 247 / 0.16)' : 'var(--color-inset)',
                    color: preset === id ? 'var(--color-purple-300)' : 'var(--color-text-secondary)',
                  }}
                >
                  {id === 'today' ? 'Tonight' : id === 'week' ? '7 nights' : '30 nights'}
                </button>
              ))}
              <a
                href={admin.exportCsvUrl(window_.from, window_.to)}
                className="flex h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-xs font-semibold"
                style={{ background: 'var(--color-inset)', color: 'var(--color-text-secondary)' }}
              >
                <span aria-hidden>⤓</span> Export CSV
              </a>
            </div>
          </div>
        </header>
      }
    >
      {error !== null && (
        <p
          role="alert"
          className="mb-4 rounded-[12px] px-4 py-3 text-sm"
          style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
        >
          {error}
        </p>
      )}

      <section
        className="mb-4 rounded-[16px] p-4"
        style={{ background: 'var(--color-raised)', border: '1px solid var(--color-border-subtle)' }}
      >
        <h2 className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
          Shop control
        </h2>
        <StoreControl onChange={() => void load()} />
      </section>

      {loading && data === null ? (
        <div className="py-16"><PizzaLoader size={84} /></div>
      ) : data === null ? null : data.orderCount === 0 ? (
        <EmptyNight />
      ) : (
        <div className="space-y-4">
          {/* ── Headline figures ─────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Revenue"
              value={Money.format(toPaise(data.revenuePaise))}
              accent="#22C55E"
              emphasis
              delta={data.comparison?.revenueChangePct ?? null}
              hint={
                data.comparison === null
                  ? undefined
                  : `vs ${Money.format(toPaise(data.comparison.revenuePaise))} before`
              }
            />
            <Metric
              label="Orders"
              value={String(data.orderCount)}
              accent="#FF6B1A"
              emphasis
              delta={data.comparison?.orderChangePct ?? null}
              hint={data.comparison === null ? undefined : `vs ${data.comparison.orderCount} before`}
            />
            <Metric
              label="Average order"
              value={Money.format(toPaise(data.averageOrderValuePaise))}
              accent="#A855F7"
            />
            <Metric
              label="Peak hour"
              value={data.peakHour === null ? '—' : `${String(data.peakHour.hourIst).padStart(2, '0')}:00`}
              hint={data.peakHour === null ? undefined : `${data.peakHour.orders} orders`}
              accent="#EAB308"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="In progress" value={String(data.inProgress)} accent="#FF6B1A" />
            <Metric label="Completed" value={String(data.completed)} accent="#22C55E" />
            <Metric
              label="Cancelled / rejected"
              value={`${data.cancelled} / ${data.rejected}`}
              accent="#EF4444"
            />
            <Metric
              label="Refunds"
              value={data.refundsPaise === null ? 'Not tracked' : Money.format(toPaise(data.refundsPaise))}
              hint={data.refundsPaise === null ? 'No refund process exists yet' : undefined}
              accent="#94A3B8"
            />
          </div>

          {/* ── Where the money actually is ────────────────────────────────────────────────────
              Revenue above counts sales. This counts cash, and with cash on delivery back the two
              genuinely differ: food that has left the kitchen against money nobody has collected.
              Without this row that gap is invisible rather than absent, which is exactly the
              leakage COD was originally removed to avoid. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="Prepaid (UPI)"
              value={Money.format(toPaise(data.cash.prepaidPaise))}
              hint="settled before cooking"
              accent="#22C55E"
            />
            <Metric
              label="Cash collected"
              value={Money.format(toPaise(data.cash.collectedPaise))}
              hint="handed to riders"
              accent="#22C55E"
            />
            <Metric
              label="Cash outstanding"
              value={Money.format(toPaise(data.cash.outstandingPaise))}
              hint={
                data.cash.ordersOutstanding === 0
                  ? 'nothing owed'
                  : `${data.cash.ordersOutstanding} order${data.cash.ordersOutstanding === 1 ? '' : 's'} not yet collected`
              }
              accent={data.cash.ordersOutstanding === 0 ? '#94A3B8' : '#EAB308'}
            />
            <Metric
              label="Unpaid checkouts"
              value={String(data.awaitingPayment.count)}
              hint={
                data.awaitingPayment.count === 0
                  ? 'everyone who started, paid'
                  : `${Money.format(toPaise(data.awaitingPayment.valuePaise))} never paid for`
              }
              accent={data.awaitingPayment.count === 0 ? '#94A3B8' : '#EF4444'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* ── Revenue over time ──────────────────────────────────────────────────────── */}
            <Panel title="Revenue by night" className="lg:col-span-2">
              <RevenueBars series={data.revenueSeries} />
            </Panel>

            {/* ── Kitchen performance ────────────────────────────────────────────────────── */}
            <Panel title="Kitchen performance">
              {data.kitchen.sampleSize === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                  Nothing cooked yet tonight.
                </p>
              ) : (
                <div className="space-y-4">
                  <Readout
                    label="Average prep"
                    value={`${data.kitchen.averagePrepMinutes} min`}
                    note={`across ${data.kitchen.sampleSize} orders`}
                  />
                  <div>
                    <Readout
                      label="Within the 40-minute promise"
                      value={`${data.kitchen.onTimeRate}%`}
                    />
                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded-full"
                      style={{ background: 'var(--color-inset)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${data.kitchen.onTimeRate ?? 0}%`,
                          background:
                            (data.kitchen.onTimeRate ?? 0) >= 80
                              ? 'var(--color-success)'
                              : (data.kitchen.onTimeRate ?? 0) >= 60
                                ? 'var(--color-warning)'
                                : 'var(--color-danger)',
                        }}
                      />
                    </div>
                  </div>
                  <Readout
                    label="Repeat customers"
                    value={data.repeatCustomers === null ? '—' : String(data.repeatCustomers.count)}
                    // Honesty on the face of the number: it is grouped by an unverified phone
                    // number because there is no customer identity yet.
                    note={data.repeatCustomers === null ? undefined : 'estimated, by phone number'}
                  />
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top sellers">
              <RankedBars
                rows={data.topProducts.map((p) => ({
                  label: p.name,
                  quantity: p.quantity,
                  revenuePaise: p.revenuePaise,
                }))}
                emptyLabel="Nothing sold in this window."
              />
            </Panel>

            <Panel title="Popular categories">
              <RankedBars
                rows={data.categories.map((c) => ({
                  label: c.name,
                  quantity: c.quantity,
                  revenuePaise: c.revenuePaise,
                }))}
                emptyLabel="Nothing sold in this window."
              />
            </Panel>
          </div>

          {/* ── When the night actually happens ────────────────────────────────────────────── */}
          <Panel title="Orders by hour · 7 PM to 4 AM">
            <HourlyChart hours={data.hourly} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Delivery vs takeaway">
              <SplitBar
                rows={data.fulfilmentSplit.map((f) => ({
                  label: f.type === 'DELIVERY' ? 'Delivery' : 'Takeaway',
                  value: f.orders,
                  sublabel: `${f.orders} orders`,
                }))}
                palette={['#FF6B1A', '#A855F7']}
              />
            </Panel>

            <Panel title="How customers pay">
              <SplitBar
                rows={data.paymentMix.map((m) => ({
                  label: m.method,
                  value: m.orders,
                  sublabel: Money.format(toPaise(m.revenuePaise)),
                }))}
                palette={['#22C55E', '#EAB308', '#A855F7', '#FF6B1A']}
              />
              {/* With card, net banking and wallet gone, processing genuinely costs nothing: UPI
                  is zero-MDR by regulation and cash costs nothing to accept. The real cost of the
                  mix is not a fee — it is the cash outstanding above. */}
              <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]" style={{ borderColor: 'var(--color-border-subtle)' }}>
                No processing fees — UPI is zero-MDR by regulation and cash costs nothing to take.
                The cost of leaning on cash is collection risk, not a percentage.
              </p>
            </Panel>

            <Panel title="Lost orders">
              {data.lostOrders.length === 0 ? (
                <p className="py-8 text-center text-sm" style={{ color: 'var(--color-success)' }}>
                  Nothing rejected or cancelled. Every order got made.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.lostOrders.map((row) => (
                    <li key={row.reason} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-[var(--color-text-secondary)]">
                        {row.reason.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      <span className="tabular shrink-0 font-semibold" style={{ color: 'var(--color-danger)' }}>
                        {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* ── Inventory alerts ───────────────────────────────────────────────────────────── */}
          <Panel
            title="Inventory alerts"
            action={
              <Link
                href="/kitchen/inventory"
                className="text-xs font-semibold text-[var(--color-purple-300)]"
              >
                Manage →
              </Link>
            }
          >
            {data.inventoryAlerts.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">
                Everything is in stock and unlimited. Nothing needs attention.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.inventoryAlerts.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-[11px] px-3 py-2.5"
                    style={{
                      background: 'var(--color-inset)',
                      boxShadow: `inset 3px 0 0 0 ${item.inStock ? 'var(--color-warning)' : 'var(--color-danger)'}`,
                    }}
                  >
                    <span className="min-w-0 truncate text-sm">{item.name}</span>
                    <span
                      className="tabular shrink-0 text-xs font-semibold"
                      style={{ color: item.inStock ? 'var(--color-warning)' : 'var(--color-danger)' }}
                    >
                      {item.inStock ? `${item.stockRemaining} left` : 'Sold out'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="tabular pb-2 text-center text-[11px] text-[var(--color-text-tertiary)]">
            Updated {new Date(data.generatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
            {stream === 'live' ? ' · live' : ' · refreshes every 30s'}
          </p>
        </div>
      )}
    </AdminShell>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────────────────────────── */

function EmptyNight() {
  return (
    <div
      className="rounded-[18px] px-6 py-20 text-center"
      style={{ border: '1px dashed var(--color-border-subtle)' }}
    >
      <p className="text-4xl" aria-hidden>
        🌙
      </p>
      <p className="mt-4 font-display text-xl font-bold">No orders yet tonight</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-text-secondary)]">
        The night runs 7 PM to 4 AM. Figures appear here as orders come in — this is a good moment
        to check stock before the rush.
      </p>
      <Link
        href="/kitchen/inventory"
        className="mt-6 inline-flex h-12 items-center rounded-[12px] px-5 font-display text-sm font-bold text-white"
        style={{ background: 'var(--gradient-brand)' }}
      >
        Review inventory
      </Link>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
  emphasis = false,
  delta,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  accent: string;
  emphasis?: boolean;
  delta?: number | null | undefined;
}) {
  return (
    <StaffPanel
      className="px-4 py-3.5"
      accent={`${accent}1f`}
      style={emphasis ? { boxShadow: `inset 0 -2px 0 0 ${accent}, 0 14px 40px -22px rgb(0 0 0 / 0.9)` } : undefined}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p
        className={`tabular mt-1 font-display font-bold ${emphasis ? 'text-2xl' : 'text-xl'}`}
        style={{ color: accent }}
      >
        {value}
      </p>
      {delta !== undefined && (
        <p className="mt-0.5">
          <Delta pct={delta} />
        </p>
      )}
      {hint !== undefined && (
        <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">{hint}</p>
      )}
    </StaffPanel>
  );
}

function Panel({
  title,
  children,
  action,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <StaffPanel className={`p-4 ${className}`} accent="rgb(168 85 247 / 0.13)">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </StaffPanel>
  );
}

function Readout({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-[var(--color-text-secondary)]">
        {label}
        {note !== undefined && (
          <span className="block text-[11px] text-[var(--color-text-tertiary)]">{note}</span>
        )}
      </span>
      <span className="tabular shrink-0 font-display text-lg font-bold">{value}</span>
    </div>
  );
}

/**
 * Windows are in **business dates**, so "7 nights" means seven service nights — not seven calendar
 * days, which would cut tonight in half at midnight.
 */
function windowFor(preset: Preset): { from: string; to: string } {
  const today = toBusinessDate(new Date());
  if (preset === 'today') return { from: today, to: today };

  const days = preset === 'week' ? 6 : 29;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { from: toBusinessDate(start), to: today };
}
