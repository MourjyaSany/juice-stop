import { capacityBand, formatCountdown, type StoreStatus } from '@juice-stop/core';

/**
 * The single most important element on the landing page.
 *
 * Server-rendered so it is correct in the first paint, and **honest**: it shows real kitchen
 * load and a real ETA. The whole point of ADR-013 is that we never quote a time we cannot keep.
 */
export function StoreStatusCard({ status }: { status: StoreStatus }) {
  const band = capacityBand(status.capacityLoad);

  if (status.state === 'CLOSED') {
    return (
      <div className="glass rounded-[20px] p-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            🌙
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-[var(--color-text-primary)]">
              We open in{' '}
              <span className="tabular text-gradient">
                {formatCountdown(status.secondsUntilOpen ?? 0)}
              </span>
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Browse now · schedule for 7:05 PM
            </p>
          </div>
        </div>
      </div>
    );
  }

  const dotColour =
    band === 'PAUSED'
      ? 'bg-[var(--color-danger)]'
      : band === 'BUSY'
        ? 'bg-[var(--color-warning)]'
        : 'bg-[var(--color-success)]';

  const headline =
    band === 'PAUSED'
      ? "Kitchen's at capacity"
      : status.state === 'CLOSING_SOON'
        ? 'Last orders soon'
        : 'Open now';

  return (
    <div className="glass rounded-[20px] p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Status is carried by colour AND an icon AND text — never colour alone. */}
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className={`animate-pulse-dot absolute inline-flex h-full w-full rounded-full ${dotColour}`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColour}`} />
          </span>
          <div>
            <p className="font-display text-base font-semibold">{headline}</p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {status.state === 'CLOSING_SOON' && status.secondsUntilClose
                ? `Closing in ${formatCountdown(status.secondsUntilClose)}`
                : `Kitchen at ${Math.round(status.capacityLoad * 100)}%`}
            </p>
          </div>
        </div>

        {status.quotedEtaMinutes !== null && (
          <div className="text-right">
            <p className="tabular font-display text-2xl font-semibold text-gradient">
              ~{status.quotedEtaMinutes}
            </p>
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
              minutes
            </p>
          </div>
        )}
      </div>

      {/* Capacity bar. At ≥80% we warn BEFORE checkout, never after payment (ADR-013). */}
      <div className="mt-4">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-inset)]"
          role="meter"
          aria-valuenow={Math.round(status.capacityLoad * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Kitchen capacity"
        >
          <div
            className="h-full rounded-full transition-transform duration-500"
            style={{
              width: `${Math.round(status.capacityLoad * 100)}%`,
              background:
                band === 'PAUSED'
                  ? 'var(--color-danger)'
                  : band === 'BUSY'
                    ? 'linear-gradient(90deg,#F59E0B,#EF4444)'
                    : 'var(--gradient-brand)',
            }}
          />
        </div>

        {band === 'BUSY' && (
          <p className="mt-2 text-xs text-[var(--color-warning)]">
            Kitchen&apos;s slammed — longer waits tonight. We&apos;ll tell you before you pay.
          </p>
        )}
        {band === 'PAUSED' && (
          <p className="mt-2 text-xs text-[var(--color-danger)]">
            Not taking new orders for a few minutes. Back shortly 🔥
          </p>
        )}
      </div>
    </div>
  );
}
