'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Money } from '@juice-stop/core';
import { kitchenApi, toPaise, type ApiOrder } from '@/lib/api';
import { AlertIcon, CheckIcon, ClockIcon, DietMark } from '@/components/icons';
import { SPRING } from '@/components/motion-provider';

const POLL_MS = 3000;

/**
 * Kitchen dashboard (M3).
 *
 * Design constraints, all from 06-wireframes.md §6 and none of them cosmetic:
 *   · Three columns, zero navigation — everything visible at once, readable from three metres.
 *   · Touch targets ≥ 64 px. Greasy fingers, fast hands, a wall-mounted tablet.
 *   · Urgency is colour AND a progress bar AND position — never colour alone, because a
 *     colour-blind chef and a sun-washed screen both have to work.
 *   · A permanent status bar. When the connection drops the kitchen must see it before the
 *     customer does.
 *
 * Transport is polling, not WebSocket, and that is a deliberate staged choice: the *contract*
 * here is already the one sockets will use (fetch the queue, reconcile, render), so swapping in
 * Socket.IO changes how updates arrive and nothing about how they are handled. Polling every 3 s
 * is honest, survives a dropped connection with no reconnection logic, and is entirely adequate
 * for one kitchen — REST is the source of truth either way (ADR-008).
 */
export default function KitchenPage() {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const knownIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  /* ── Chime ────────────────────────────────────────────────────────────────────────────────
     Synthesised via WebAudio rather than an audio file: no asset to load, no autoplay-policy
     fight, and it still works with the tablet offline. */
  const chime = useCallback(() => {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext;
      const ctx = new Ctx();
      [880, 1180].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + i * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.34);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.16);
        osc.stop(ctx.currentTime + i * 0.16 + 0.36);
      });
      setTimeout(() => void ctx.close(), 1200);
    } catch {
      /* Audio unavailable — the visual slide-in still announces the ticket. */
    }
  }, [soundOn]);

  const load = useCallback(async () => {
    try {
      const { orders: next } = await kitchenApi.queue();
      setConnected(true);
      setError(null);

      const incoming = next.filter((o) => o.status === 'PLACED' && !knownIds.current.has(o.id));
      if (!firstLoad.current && incoming.length > 0) chime();
      firstLoad.current = false;
      knownIds.current = new Set(next.map((o) => o.id));

      setOrders(next);
    } catch {
      // Degrade visibly rather than silently freezing — a stale board that looks live is the
      // worst possible failure in a kitchen.
      setConnected(false);
    }
  }, [chime]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo(
    () => ({
      incoming: orders.filter((o) => o.status === 'PLACED'),
      cooking: orders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING'),
      ready: orders.filter((o) => o.status === 'READY'),
    }),
    [orders],
  );

  const revenue = orders.reduce((sum, o) => sum + BigInt(o.totalPaise), 0n);

  return (
    <main className="min-h-dvh" style={{ background: 'var(--color-canvas)' }}>
      {/* ── Top bar ──────────────────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-5 py-3"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: connected ? 'var(--color-success)' : 'var(--color-danger)' }}
            aria-hidden
          />
          <h1 className="font-display text-lg font-bold tracking-[-0.01em]">KITCHEN</h1>
        </div>

        <span className="tabular font-mono text-sm text-[var(--color-text-secondary)]">
          {new Date(now).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>

        <div className="ml-auto flex items-center gap-5 text-sm">
          <Stat label="Active" value={String(orders.length)} />
          <Stat label="Value" value={Money.format(Money.paise(revenue))} />
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            aria-pressed={soundOn}
            className="rounded-[10px] px-3 py-2 text-xs font-semibold"
            style={{
              background: soundOn ? 'rgb(34 197 94 / 0.15)' : 'var(--color-raised)',
              color: soundOn ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            }}
          >
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {(!connected || error !== null) && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
              style={{ background: 'rgb(239 68 68 / 0.14)', color: 'var(--color-danger)' }}
            >
              <AlertIcon size={16} />
              {connected ? error : 'Lost connection to the server — retrying every 3 seconds.'}
            </p>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Board ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <Column title="New" tone="var(--color-orange-500)" count={columns.incoming.length}>
          {columns.incoming.map((order) => (
            <Ticket key={order.id} order={order} now={now} busy={busyId === order.id}>
              <BigButton
                label="Accept"
                tone="primary"
                onClick={() => void act(order.id, () => kitchenApi.accept(order.id))}
              />
              <BigButton
                label="Reject"
                tone="danger"
                onClick={() => void act(order.id, () => kitchenApi.reject(order.id, 'TOO_BUSY'))}
              />
            </Ticket>
          ))}
        </Column>

        <Column title="Cooking" tone="var(--color-warning)" count={columns.cooking.length}>
          {columns.cooking.map((order) => {
            const locked = now < new Date(order.editableUntil).getTime();
            return (
              <Ticket key={order.id} order={order} now={now} busy={busyId === order.id}>
                {order.status === 'ACCEPTED' ? (
                  <BigButton
                    label={locked ? 'Customer can still edit' : 'Start cooking'}
                    tone="primary"
                    disabled={locked}
                    onClick={() => void act(order.id, () => kitchenApi.start(order.id))}
                  />
                ) : (
                  <BigButton
                    label="Mark ready"
                    tone="success"
                    onClick={() => void act(order.id, () => kitchenApi.ready(order.id))}
                  />
                )}
              </Ticket>
            );
          })}
        </Column>

        <Column title="Ready" tone="var(--color-success)" count={columns.ready.length}>
          {columns.ready.map((order) => (
            <Ticket key={order.id} order={order} now={now} busy={busyId === order.id}>
              <BigButton
                label="Handed to rider"
                tone="success"
                onClick={() => void act(order.id, () => kitchenApi.dispatch(order.id))}
              />
            </Ticket>
          ))}
        </Column>
      </div>

      {orders.length === 0 && connected && (
        <p className="py-20 text-center text-sm text-[var(--color-text-tertiary)]">
          No active orders. The board fills as they come in.
        </p>
      )}
    </main>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────────────────────────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="leading-tight">
      <span className="block text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <span className="tabular block font-display text-sm font-bold">{value}</span>
    </span>
  );
}

function Column({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full" style={{ background: tone }} aria-hidden />
        <h2 className="font-display text-base font-bold">{title}</h2>
        <span
          className="tabular rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
        >
          {count}
        </span>
      </div>
      <div className="space-y-3">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </div>
    </section>
  );
}

function Ticket({
  order,
  now,
  busy,
  children,
}: {
  order: ApiOrder;
  now: number;
  busy: boolean;
  children: React.ReactNode;
}) {
  const placed = new Date(order.placedAt).getTime();
  const promised = new Date(order.promisedAt).getTime();
  const elapsed = Math.max(0, Math.floor((now - placed) / 1000));
  // Urgency against the promise we made the customer, not against wall-clock age.
  const pressure = Math.min(1.2, (now - placed) / Math.max(1, promised - placed));

  const tone =
    pressure >= 0.85 ? 'var(--color-danger)'
    : pressure >= 0.6 ? 'var(--color-warning)'
    : 'var(--color-purple-500)';
  const label = pressure >= 0.85 ? 'LATE RISK' : pressure >= 0.6 ? 'HURRY' : 'ON TIME';

  return (
    <m.article
      layout
      initial={{ opacity: 0, x: -24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      transition={SPRING.smooth}
      className="rounded-[16px] p-4"
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${pressure >= 0.85 ? 'rgb(239 68 68 / 0.5)' : 'var(--color-border-subtle)'}`,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-bold">{order.orderNumber.split('-').pop()}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            {new Date(placed).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {order.address['block'] !== undefined
              ? `Block ${order.address['block']} · ${order.address['flatOrRoom'] ?? ''}`
              : ''}
          </p>
        </div>
        <span
          className="tabular flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)`, color: tone }}
        >
          <ClockIcon size={11} />
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </span>
      </div>

      {/* Urgency carried by a bar as well as colour. */}
      <div
        className="mt-2.5 h-1 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--color-inset)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.min(100, pressure * 100)}%`, background: tone }}
        />
      </div>
      <p className="mt-1 text-[10px] font-bold tracking-[0.06em]" style={{ color: tone }}>
        {label}
      </p>

      <ul className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
        {order.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-1">
              <DietMark isVeg={!/chicken|egg|pepperoni|keema/i.test(item.name)} size={11} />
            </span>
            <span className="tabular shrink-0 font-bold" style={{ color: 'var(--color-orange-500)' }}>
              {item.quantity}×
            </span>
            <span className="min-w-0 flex-1">
              {item.name}
              {item.variantName.length > 0 && (
                <span className="text-[var(--color-text-secondary)]"> ({item.variantName})</span>
              )}
              {item.addOnNames.length > 0 && (
                <span className="block text-[11px] text-[var(--color-purple-300)]">
                  + {item.addOnNames.join(', ')}
                </span>
              )}
              {item.note.length > 0 && (
                <span className="block text-[11px] italic" style={{ color: 'var(--color-warning)' }}>
                  “{item.note}”
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {order.customerNote !== null && order.customerNote.length > 0 && (
        <p
          className="mt-2.5 rounded-[9px] px-2.5 py-2 text-[11px]"
          style={{ background: 'rgb(245 158 11 / 0.12)', color: 'var(--color-warning)' }}
        >
          {order.customerNote}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="tabular font-bold">{Money.format(toPaise(order.totalPaise))}</span>
        <span className="text-[var(--color-text-tertiary)]">{order.paymentMethod}</span>
      </div>

      <div className="mt-3 flex gap-2">{children}</div>
    </m.article>
  );
}

/** ≥ 64 px tall. Greasy fingers, fast hands, a tablet viewed from three metres. */
function BigButton({
  label,
  tone,
  onClick,
  disabled = false,
}: {
  label: string;
  tone: 'primary' | 'danger' | 'success';
  onClick: () => void;
  disabled?: boolean;
}) {
  const style =
    tone === 'primary'
      ? { background: 'var(--gradient-brand)', color: '#fff' }
      : tone === 'success'
        ? { background: 'var(--color-success)', color: '#06210f' }
        : { background: 'rgb(239 68 68 / 0.16)', color: 'var(--color-danger)' };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-[12px] font-display text-sm font-bold transition-transform duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ ...style, minHeight: 64 }}
    >
      <span className="flex items-center justify-center gap-1.5">
        {tone === 'success' && <CheckIcon size={16} strokeWidth={2.6} />}
        {label}
      </span>
    </button>
  );
}
