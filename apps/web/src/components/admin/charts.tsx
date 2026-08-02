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
