'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { admin, type EffectiveStoreStatus } from '@/lib/kitchen-api';

/**
 * Open or close the shop by hand.
 *
 * The scheduled window is a default, not a rule. This is the control an owner reaches for when
 * there is a queue outside at 18:30 or when the gas has run out at 22:00.
 *
 * Every manual state is **bounded**. An unbounded "open" is one nobody remembers to undo, and a
 * shop that is silently accepting orders at 06:00 three weeks later is worse than one that closed
 * on schedule. The expiry is shown, counted down and clearable.
 */

const DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 180, label: '3 hours' },
  { minutes: 480, label: 'All night' },
] as const;

export function StoreControl({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<EffectiveStoreStatus | null>(null);
  const [minutes, setMinutes] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setStatus(await admin.storeStatus());
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) return;
      setError('Could not read the store status.');
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Re-read periodically so an expiry that lapses server-side is reflected here without a
    // refresh — the countdown reaching zero is a prediction, the server is the fact.
    const poll = setInterval(() => void load(), 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [load]);

  const apply = async (mode: 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED') => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await admin.setStoreOverride(mode, mode === 'AUTO' ? undefined : minutes));
      onChange?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That change did not save.');
    } finally {
      setBusy(false);
    }
  };

  if (status === null) {
    return (
      <p className="py-6 text-center text-sm text-[var(--color-text-tertiary)]">
        Reading store status…
      </p>
    );
  }

  const manual = status.override.mode !== 'AUTO';
  const open = status.acceptingOrders;

  return (
    <div style={{ opacity: busy ? 0.6 : 1 }}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex h-11 items-center gap-2.5 rounded-[11px] px-3.5 text-sm font-bold"
          style={{
            background: open ? 'rgb(34 197 94 / 0.14)' : 'rgb(239 68 68 / 0.14)',
            color: open ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'currentColor' }}
            aria-hidden
          />
          {open ? 'Taking orders' : 'Not taking orders'}
        </span>

        <div className="min-w-0 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {manual ? (
            <>
              <strong style={{ color: 'var(--color-warning)' }}>
                Manual override by {status.override.setBy}
              </strong>
              {status.override.expiresAt !== null && (
                <>
                  {' · reverts in '}
                  <span className="tabular">{countdown(status.override.expiresAt, now)}</span>
                </>
              )}
              {/* The schedule is still shown, so an owner always knows what they are overriding. */}
              <span className="block text-[var(--color-text-tertiary)]">
                Schedule alone says {status.scheduledOpen ? 'open' : 'closed'} · {status.localTime} IST
              </span>
            </>
          ) : (
            <>
              Following the 7 PM – 4 AM schedule
              <span className="block text-[var(--color-text-tertiary)]">
                {status.localTime} IST
              </span>
            </>
          )}
        </div>
      </div>

      {!manual && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
            For
          </span>
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              onClick={() => setMinutes(d.minutes)}
              aria-pressed={minutes === d.minutes}
              className="h-9 rounded-[9px] px-3 text-xs font-semibold"
              style={{
                background: minutes === d.minutes ? 'rgb(168 85 247 / 0.16)' : 'var(--color-inset)',
                color:
                  minutes === d.minutes ? 'var(--color-purple-300)' : 'var(--color-text-secondary)',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {manual ? (
          <button
            type="button"
            onClick={() => void apply('AUTO')}
            disabled={busy}
            className="h-12 flex-1 rounded-[11px] font-display text-sm font-bold"
            style={{ background: 'var(--color-inset)', color: 'var(--color-text-secondary)' }}
          >
            Back to the schedule
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void apply('FORCE_OPEN')}
              disabled={busy}
              className="h-12 flex-1 rounded-[11px] font-display text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#22C55E,#16A34A)' }}
            >
              Open now
            </button>
            <button
              type="button"
              onClick={() => void apply('FORCE_CLOSED')}
              disabled={busy}
              className="h-12 flex-1 rounded-[11px] font-display text-sm font-bold"
              style={{ background: 'rgb(239 68 68 / 0.14)', color: 'var(--color-danger)' }}
            >
              Close now
            </button>
          </>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function countdown(untilIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((Date.parse(untilIso) - now) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${m}:${String(s).padStart(2, '0')}`;
}
