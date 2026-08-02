'use client';

import { Money } from '@juice-stop/core';
import { toPaise } from '@/lib/kitchen-api';

/**
 * Charts, hand-drawn in SVG.
 *
 * No charting library. Recharts or Chart.js would add 100–200 KB to a dashboard that needs two
 * chart types, and the published-artifact CSP forbids external scripts anyway. More importantly a
 * library would bring its own visual language — tooltips, fonts, palettes — into an app with an
 * established design system, and fighting that back out is more work than drawing a bar.
 *
 * Both charts encode value in **height or length as well as colour**, and both label their axes,
 * so neither depends on colour perception to be read.
 */

export function RevenueBars({
  series,
}: {
  series: Array<{ businessDate: string; revenuePaise: string; orders: number }>;
}) {
  if (series.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">
        No takings in this window yet.
      </p>
    );
  }

  const values = series.map((d) => Number(BigInt(d.revenuePaise) / 100n));
  const peak = Math.max(...values, 1);

  return (
    <div>
      <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Revenue by night">
        {series.map((day, i) => {
          const rupees = values[i]!;
          const heightPct = Math.max(2, (rupees / peak) * 100);
          return (
            <div key={day.businessDate} className="group relative flex flex-1 flex-col justify-end">
              <span
                className="w-full rounded-t-[5px] transition-[height] duration-500"
                style={{
                  height: `${heightPct}%`,
                  background:
                    rupees === peak
                      ? 'linear-gradient(180deg, #FF8A3D, #FF3D81)'
                      : 'linear-gradient(180deg, rgb(255 107 26 / 0.55), rgb(255 107 26 / 0.18))',
                }}
              />
              {/* Value on hover and on focus, so it is reachable without a pointer. */}
              <span
                tabIndex={0}
                className="tabular absolute inset-x-0 -top-6 mx-auto w-max rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                style={{ background: 'var(--color-inset)', color: 'var(--color-text-primary)' }}
              >
                ₹{rupees.toLocaleString('en-IN')} · {day.orders}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {series.map((day) => (
          <span
            key={day.businessDate}
            className="tabular flex-1 truncate text-center text-[9px] text-[var(--color-text-tertiary)]"
          >
            {day.businessDate.slice(8)}/{day.businessDate.slice(5, 7)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal ranking. Bars are proportional, so the leader is obvious without reading numbers. */
export function RankedBars({
  rows,
  emptyLabel,
}: {
  rows: Array<{ label: string; quantity: number; revenuePaise: string }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">{emptyLabel}</p>;
  }

  const peak = Math.max(...rows.map((r) => r.quantity), 1);

  return (
    <ol className="space-y-2.5">
      {rows.map((row, i) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="tabular mr-2 text-[var(--color-text-tertiary)]">{i + 1}</span>
              {row.label}
            </span>
            <span className="tabular shrink-0 text-[var(--color-text-secondary)]">
              {row.quantity} · {Money.format(toPaise(row.revenuePaise))}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--color-inset)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.quantity / peak) * 100}%`,
                background: 'linear-gradient(90deg, #FF6B1A, #A855F7)',
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Orders per hour of the service night.
 *
 * The staffing chart. Labelled every third hour so the axis stays readable on a phone, and the
 * busiest bar is tinted differently *and* is the tallest — never colour alone.
 */
export function HourlyChart({
  hours,
}: {
  hours: Array<{ hourIst: number; orders: number; revenuePaise: string }>;
}) {
  const peak = Math.max(...hours.map((h) => h.orders), 1);
  const total = hours.reduce((sum, h) => sum + h.orders, 0);

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">
        No orders yet — the shape of the night appears here as they arrive.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-32 items-end gap-1" role="img" aria-label="Orders by hour of the night">
        {hours.map((hour) => (
          <div key={hour.hourIst} className="group relative flex flex-1 flex-col justify-end">
            <span
              className="w-full rounded-t-[4px] transition-[height] duration-500"
              style={{
                height: `${Math.max(2, (hour.orders / peak) * 100)}%`,
                background:
                  hour.orders === peak
                    ? 'linear-gradient(180deg,#A855F7,#FF3D81)'
                    : 'rgb(168 85 247 / 0.35)',
              }}
            />
            <span
              tabIndex={0}
              className="tabular absolute inset-x-0 -top-6 mx-auto w-max rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
              style={{ background: 'var(--color-inset)' }}
            >
              {String(hour.hourIst).padStart(2, '0')}:00 · {hour.orders}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        {hours.map((hour, i) => (
          <span
            key={hour.hourIst}
            className="tabular flex-1 text-center text-[9px] text-[var(--color-text-tertiary)]"
          >
            {i % 3 === 0 ? String(hour.hourIst).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Proportional split as a single stacked bar.
 *
 * A pie chart of two or three slices is harder to read than one bar and costs more pixels. Each
 * segment is labelled with its own share, so the bar is a summary rather than the only source.
 */
export function SplitBar({
  rows,
  palette,
}: {
  rows: Array<{ label: string; value: number; sublabel?: string }>;
  palette: string[];
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-[var(--color-text-tertiary)]">Nothing yet.</p>;
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label="Split">
        {rows.map((row, i) => (
          <span
            key={row.label}
            style={{ width: `${(row.value / total) * 100}%`, background: palette[i % palette.length] }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map((row, i) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: palette[i % palette.length] }}
                aria-hidden
              />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="tabular shrink-0 text-[var(--color-text-secondary)]">
              {Math.round((row.value / total) * 100)}%
              {row.sublabel !== undefined && (
                <span className="text-[var(--color-text-tertiary)]"> · {row.sublabel}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Period-over-period delta. Colour plus an arrow plus a sign — three encodings, not one. */
export function Delta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-[11px] text-[var(--color-text-tertiary)]">no baseline</span>;
  }
  const up = pct >= 0;
  return (
    <span
      className="tabular text-[11px] font-semibold"
      style={{ color: up ? 'var(--color-success)' : 'var(--color-danger)' }}
    >
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {pct}%
    </span>
  );
}
