'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type ApiOrder } from '@/lib/api';
import { kitchen, type KitchenStats, type RealtimeEnvelope } from '@/lib/kitchen-api';
import { KitchenShell } from '@/components/kitchen/shell';
import { KitchenOrderCard, type OrderAction } from '@/components/kitchen/order-card';
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
  const [stats, setStats] = useState<KitchenStats | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = useNow();
  const { play, muted, toggleMute } = useChime();

  const seenIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  const reconcile = useCallback(async () => {
    try {
      const [q, c, s] = await Promise.all([kitchen.queue(), kitchen.completed(), kitchen.stats()]);
      setQueue(q.orders);
      setCompleted(c.orders);
      setStats(s);
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
              label: order.fulfilmentType === 'TAKEAWAY' ? 'Handed over' : 'Out for delivery',
              onClick: () =>
                void act(order.id, async () => {
                  // Takeaway has no rider leg. The state machine still routes through
                  // OUT_FOR_DELIVERY because it is the only path to DELIVERED, so the counter
                  // hand-over collapses both moves into one tap rather than making a cook press
                  // "out for delivery" for a bag that is being handed across a counter.
                  await kitchen.dispatch(order.id);
                  if (order.fulfilmentType === 'TAKEAWAY') await kitchen.delivered(order.id);
                }),
            },
          ],
          blocked: null,
        };
      case 'OUT_FOR_DELIVERY':
        return {
          actions: [
            {
              label: 'Delivered',
              tone: 'quiet',
              onClick: () => void act(order.id, () => kitchen.delivered(order.id)),
            },
          ],
          blocked: null,
        };
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
