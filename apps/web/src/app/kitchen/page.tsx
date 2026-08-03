'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Money } from '@juice-stop/core';
import { ApiError, type ApiOrder } from '@/lib/api';
import { kitchen, toPaise, type KitchenStats, type RealtimeEnvelope } from '@/lib/kitchen-api';
import { KitchenShell } from '@/components/kitchen/shell';
import { KitchenOrderCard, type OrderAction, type UndoAction } from '@/components/kitchen/order-card';
import { useKitchenStream, useNow } from '@/components/kitchen/use-kitchen-stream';
import { useChime } from '@/components/kitchen/use-chime';

/**
 * Kitchen dashboard.
 *
 * Four columns matching the four things a cook tracks, and no navigation between them — having
 * everything on screen at once is the entire point of a kitchen board.
 *
 * Updates arrive over SSE and are reconciled against REST on a slow timer. That is not redundancy
 * for its own sake: a board silently missing an order is this screen's worst failure, so REST
 * stays the source of truth (ADR-008) and events are only the fast path.
 */

const RECONCILE_MS = 15_000;

/**
 * What the step-back control returns an order to.
 *
 * Mirrors the server's `previousStatus`, and only for the labels — the server decides the actual
 * target. Absent keys are the statuses with no way back: a rejected or cancelled order has
 * settled money against it, and resurrecting one is a worse problem than re-entering it.
 */
const PREVIOUS_LABEL: Record<string, string> = {
  ACCEPTED: 'Incoming',
  PREPARING: 'Accepted',
  READY: 'Preparing',
  OUT_FOR_DELIVERY: 'Ready',
  DELIVERED: 'Out for delivery',
};

type ColumnId = 'incoming' | 'preparing' | 'ready' | 'completed';

const COLUMNS: Array<{ id: ColumnId; title: string; statuses: string[]; accent: string }> = [
  { id: 'incoming', title: 'Incoming', statuses: ['PLACED', 'ACCEPTED'], accent: '#FF6B1A' },
  { id: 'preparing', title: 'Preparing', statuses: ['PREPARING'], accent: '#EAB308' },
  { id: 'ready', title: 'Ready', statuses: ['READY'], accent: '#22C55E' },
  {
    id: 'completed',
    title: 'Completed',
    statuses: ['OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'],
    accent: '#A855F7',
  },
];

export default function KitchenDashboardPage() {
  const [queue, setQueue] = useState<ApiOrder[]>([]);
  const [completed, setCompleted] = useState<ApiOrder[]>([]);
  const [awaiting, setAwaiting] = useState<ApiOrder[]>([]);
  const [stats, setStats] = useState<KitchenStats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = useNow();
  const { play, muted, toggleMute } = useChime();

  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  const reconcile = useCallback(async () => {
    try {
      const [q, c, s, a] = await Promise.all([
        kitchen.queue(),
        kitchen.completed(),
        kitchen.stats(),
        kitchen.awaitingPayment(),
      ]);
      setQueue(q.orders);
      setCompleted(c.orders);
      setStats(s);
      setAwaiting(a.orders);
      setError(null);

      // Chime for genuinely new tickets only, and never on the first load — signing in at 23:00 to
      // twelve open orders must not fire twelve chimes.
      const arrived = q.orders.filter((o) => !seenIds.current.has(o.id));
      for (const order of q.orders) seenIds.current.add(order.id);
      if (primed.current && arrived.length > 0) play();
      primed.current = true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return; // the shell handles redirect
      setError('Lost contact with the server — retrying.');
    }
  }, [play]);

  const onEvent = useCallback(
    (event: RealtimeEnvelope) => {
      // Every event triggers a reconcile rather than patching state from the payload. Applying
      // deltas would put two code paths in charge of what an order looks like, and they diverge
      // exactly under load — the one moment they must not.
      if (event.type === 'ping') return;
      void reconcile();
    },
    [reconcile],
  );

  const stream = useKitchenStream(onEvent);

  useEffect(() => {
    void reconcile();
    const id = setInterval(() => void reconcile(), RECONCILE_MS);
    return () => clearInterval(id);
  }, [reconcile]);

  const act = useCallback(
    async (id: string, run: () => Promise<unknown>) => {
      setBusyId(id);
      try {
        await run();
        await reconcile();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'That action did not go through.');
      } finally {
        setBusyId(null);
      }
    },
    [reconcile],
  );

  const byColumn = useMemo(() => {
    const all = [...queue, ...completed];
    const map = new Map<ColumnId, ApiOrder[]>();
    for (const column of COLUMNS) {
      map.set(
        column.id,
        all.filter((o) => column.statuses.includes(o.status)),
      );
    }
    return map;
  }, [queue, completed]);

  /** Completion gate. Only orders awaiting handover have one. */
  const otpGateFor = (order: ApiOrder) =>
    order.status === 'OUT_FOR_DELIVERY'
      ? {
          label: order.fulfilmentType === 'TAKEAWAY' ? 'Collected' : 'Delivered',
          onSubmit: (otp: string) =>
            void act(order.id, () => kitchen.delivered(order.id, otp)),
        }
      : null;

  /** The step back, offered only where the server has one to give. */
  const undoFor = (order: ApiOrder): UndoAction | null => {
    const label = PREVIOUS_LABEL[order.status];
    if (label === undefined) return null;
    return { toLabel: label, onClick: () => void act(order.id, () => kitchen.undo(order.id)) };
  };

  /**
   * Available actions come from the order's current status, so the board can only offer moves the
   * server-side state machine would accept. The API rejects invalid jumps regardless — this just
   * stops us drawing a button whose only outcome is an error.
   */
  const actionsFor = (order: ApiOrder): { actions: OrderAction[]; blocked: string | null } => {
    const editWindowOpen = now < new Date(order.editableUntil).getTime();

    switch (order.status) {
      case 'PLACED':
        return {
          actions: [
            { label: 'Accept', onClick: () => void act(order.id, () => kitchen.accept(order.id)) },
            {
              label: 'Reject',
              tone: 'danger',
              onClick: () => void act(order.id, () => kitchen.reject(order.id, 'TOO_BUSY')),
            },
          ],
          blocked: null,
        };
      case 'ACCEPTED':
        return {
          actions: editWindowOpen
            ? []
            : [
                {
                  label: 'Start preparing',
                  onClick: () => void act(order.id, () => kitchen.start(order.id)),
                },
              ],
          // Not a dead disabled button: the block has a reason the cook can act on, so it is
          // stated with a countdown rather than left to be guessed at.
          blocked: editWindowOpen
            ? `Customer can still edit · ${countdown(order.editableUntil, now)}`
            : null,
        };
      case 'PREPARING':
        return {
          actions: [
            { label: 'Mark ready', onClick: () => void act(order.id, () => kitchen.ready(order.id)) },
          ],
          blocked: null,
        };
      case 'READY':
        return {
          actions: [
            {
              label: order.fulfilmentType === 'TAKEAWAY' ? 'Handed to customer' : 'Out for delivery',
              // Takeaway no longer auto-completes here. Completion is proof of possession for both
              // fulfilment types now — the code is the proof, and a bag handed across a counter
              // deserves the same check as one handed over at a door.
              onClick: () => void act(order.id, () => kitchen.dispatch(order.id)),
            },
          ],
          blocked: null,
        };
      case 'OUT_FOR_DELIVERY':
        // No plain action — the only way out of this phase is the code, so offering a button
        // beside it would just be a button that always errors.
        return { actions: [], blocked: null };
      default:
        return { actions: [], blocked: null };
    }
  };

  return (
    <KitchenShell
      stream={stream}
      header={<KitchenHeader stats={stats} muted={muted} onToggleMute={toggleMute} now={now} />}
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

      <AwaitingPayment
        orders={awaiting}
        busyId={busyId}
        onConfirm={(id) => void act(id, () => kitchen.confirmPayment(id))}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const orders = byColumn.get(column.id) ?? [];
          return (
            <section key={column.id} className="min-w-0">
              <header
                className="mb-3 flex items-center justify-between rounded-[12px] px-3.5 py-2.5"
                style={{
                  background: 'var(--color-raised)',
                  boxShadow: `inset 0 -2px 0 0 ${column.accent}`,
                }}
              >
                <h2 className="font-display text-sm font-bold uppercase tracking-[0.08em]">
                  {column.title}
                </h2>
                <span
                  className="tabular rounded-full px-2.5 py-0.5 font-display text-sm font-bold"
                  style={{ background: `${column.accent}22`, color: column.accent }}
                >
                  {orders.length}
                </span>
              </header>

              <div className="space-y-3">
                {orders.map((order) => {
                  const { actions, blocked } = actionsFor(order);
                  return (
                    <KitchenOrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      actions={actions}
                      undo={undoFor(order)}
                      otpGate={otpGateFor(order)}
                      busy={busyId === order.id}
                      blockedReason={blocked}
                    />
                  );
                })}

                {orders.length === 0 && (
                  <p
                    className="rounded-[14px] py-10 text-center text-sm text-[var(--color-text-tertiary)]"
                    style={{ border: '1px dashed var(--color-border-subtle)' }}
                  >
                    Nothing here
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </KitchenShell>
  );
}

/**
 * Orders waiting on money.
 *
 * Deliberately a strip above the board rather than a fifth column. These are not tickets — nothing
 * is cooked, nothing is timed, and a cook scanning for the next thing to make must not have
 * uncooked, unpaid rows in that scan. It collapses to nothing when empty, which is most of the time.
 *
 * Confirming is a **human assertion that money arrived**, so the control says exactly that. The
 * amount is the largest thing in each row because it is what has to be matched against the
 * notification on the counter phone — that comparison is the entire verification, and making it
 * easy is the difference between a real check and a reflex tap.
 */
function AwaitingPayment({
  orders,
  busyId,
  onConfirm,
}: {
  orders: ApiOrder[];
  busyId: string | null;
  onConfirm: (id: string) => void;
}) {
  if (orders.length === 0) return null;

  return (
    <section
      className="mb-4 rounded-[14px] p-3.5"
      style={{
        background: 'rgb(234 179 8 / 0.08)',
        border: '1px solid rgb(234 179 8 / 0.28)',
      }}
    >
      <header className="mb-3 flex items-center gap-2.5">
        <span
          className="h-2.5 w-2.5 animate-pulse rounded-full"
          style={{ background: '#EAB308' }}
          aria-hidden
        />
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.08em]">
          Awaiting payment
        </h2>
        <span
          className="tabular rounded-full px-2 py-0.5 font-display text-xs font-bold"
          style={{ background: 'rgb(234 179 8 / 0.2)', color: '#EAB308' }}
        >
          {orders.length}
        </span>
        <p className="ml-auto hidden text-[11px] text-[var(--color-text-tertiary)] sm:block">
          Not cooking yet · confirm once the money is in the account
        </p>
      </header>

      <ul className="grid gap-2 lg:grid-cols-2">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center gap-3 rounded-[12px] px-3.5 py-3"
            style={{ background: 'var(--color-raised)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="tabular font-display text-xl font-bold">
                {Money.format(toPaise(order.totalPaise))}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
                {order.paymentReference ?? order.orderNumber}
                {order.customerName !== null && ` · ${order.customerName}`}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === order.id}
              onClick={() => onConfirm(order.id)}
              className="h-12 shrink-0 rounded-[11px] px-4 font-display text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)' }}
            >
              {busyId === order.id ? 'Confirming…' : 'Payment received'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KitchenHeader({
  stats,
  muted,
  onToggleMute,
  now,
}: {
  stats: KitchenStats | null;
  muted: boolean;
  onToggleMute: () => void;
  now: number;
}) {
  const open = stats?.acceptingOrders === true;

  return (
    <header
      className="sticky top-0 z-20 border-b px-4 py-3 lg:px-6"
      style={{
        borderColor: 'var(--color-border-subtle)',
        background: 'color-mix(in srgb, var(--color-canvas) 88%, transparent)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: open ? 'var(--color-success)' : 'var(--color-text-tertiary)',
              boxShadow: open ? '0 0 10px var(--color-success)' : 'none',
            }}
            aria-hidden
          />
          <p className="font-display text-base font-bold">
            {stats === null ? 'Loading…' : open ? 'Kitchen open' : 'Kitchen closed'}
          </p>
          {stats?.openSince != null && (
            <p className="tabular text-xs text-[var(--color-text-tertiary)]">
              since {istTime(stats.openSince)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <p className="tabular hidden font-mono text-sm text-[var(--color-text-secondary)] sm:block">
            {new Date(now).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'Asia/Kolkata',
            })}
          </p>
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            className="flex h-11 min-w-[3rem] items-center justify-center gap-1.5 rounded-[11px] px-3 text-sm font-semibold"
            style={{
              background: muted ? 'rgb(239 68 68 / 0.14)' : 'var(--color-inset)',
              color: muted ? 'var(--color-danger)' : 'var(--color-text-secondary)',
            }}
          >
            <span aria-hidden>{muted ? '🔇' : '🔔'}</span>
            <span className="hidden md:inline">{muted ? 'Muted' : 'Sound on'}</span>
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Waiting" value={stats?.waiting ?? '—'} accent="#FF6B1A" />
        <Metric label="Preparing" value={stats?.preparing ?? '—'} accent="#EAB308" />
        <Metric label="Ready" value={stats?.ready ?? '—'} accent="#22C55E" />
        <Metric label="Done tonight" value={stats?.completedToday ?? '—'} accent="#A855F7" />
        <Metric
          label="Avg prep"
          value={stats?.averagePrepMinutes != null ? `${stats.averagePrepMinutes}m` : '—'}
          accent="#94A3B8"
        />
      </div>
    </header>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-[11px] px-3 py-2" style={{ background: 'var(--color-raised)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p className="tabular mt-0.5 font-display text-xl font-bold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

const istTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

function countdown(untilIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((new Date(untilIso).getTime() - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`;
}
