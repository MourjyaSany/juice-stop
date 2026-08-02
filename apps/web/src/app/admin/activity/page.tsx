'use client';

import { useCallback, useEffect, useState } from 'react';
import { Money } from '@juice-stop/core';
import { ApiError } from '@/lib/api';
import { admin, toPaise, type ActivityEvent } from '@/lib/kitchen-api';
import { AdminShell } from '@/components/admin/shell';

/**
 * Live activity feed.
 *
 * Every lifecycle transition in the shop, newest first, read straight from the status audit trail
 * — so it shows what actually happened rather than what a separate log thought happened. Undos
 * appear as their own entries rather than erasing the move they reversed, which is the whole point
 * of keeping the trail.
 */

const REFRESH_MS = 10_000;

const TONE: Record<string, { colour: string; label: string }> = {
  PLACED: { colour: '#FF6B1A', label: 'Order placed' },
  ACCEPTED: { colour: '#EAB308', label: 'Accepted' },
  PREPARING: { colour: '#EAB308', label: 'Started cooking' },
  READY: { colour: '#22C55E', label: 'Ready' },
  OUT_FOR_DELIVERY: { colour: '#A855F7', label: 'Out for delivery' },
  DELIVERED: { colour: '#22C55E', label: 'Delivered' },
  REJECTED: { colour: '#EF4444', label: 'Rejected' },
  CANCELLED: { colour: '#EF4444', label: 'Cancelled' },
};

export default function AdminActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { events: next } = await admin.activity();
      setEvents(next);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) return;
      setError('Could not load activity — retrying.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

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
          <h1 className="font-display text-lg font-bold">Activity</h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Every status change, newest first · refreshes every 10s
          </p>
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

      {loading ? (
        <p className="py-20 text-center text-sm text-[var(--color-text-tertiary)]">Loading…</p>
      ) : events.length === 0 ? (
        <div
          className="rounded-[18px] px-6 py-20 text-center"
          style={{ border: '1px dashed var(--color-border-subtle)' }}
        >
          <p className="text-4xl" aria-hidden>
            😴
          </p>
          <p className="mt-4 font-display text-xl font-bold">All quiet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
            Nothing has moved yet. Activity appears the moment the first order lands.
          </p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {events.map((event) => {
            const tone = TONE[event.to] ?? { colour: '#94A3B8', label: event.to };
            const undo = event.reason === 'UNDO';
            return (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-[12px] px-3.5 py-3"
                style={{
                  background: 'var(--color-raised)',
                  boxShadow: `inset 3px 0 0 0 ${tone.colour}`,
                }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: tone.colour }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold" style={{ color: tone.colour }}>
                      {undo ? `Undone → ${tone.label}` : tone.label}
                    </span>
                    <span className="text-[var(--color-text-secondary)]">
                      {' · '}
                      {event.orderNumber.replace(/^JS-\d+-/, '#')}
                      {event.customerName !== null && ` · ${event.customerName}`}
                    </span>
                  </p>
                  <p className="tabular text-[11px] text-[var(--color-text-tertiary)]">
                    {event.from ?? 'new'} → {event.to} · by {event.actor.toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-sm font-semibold">
                    {Money.format(toPaise(event.totalPaise))}
                  </p>
                  <p className="tabular text-[11px] text-[var(--color-text-tertiary)]">
                    {new Date(event.at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Kolkata',
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </AdminShell>
  );
}
