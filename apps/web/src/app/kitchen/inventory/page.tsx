'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Money } from '@juice-stop/core';
import { ApiError } from '@/lib/api';
import { kitchen, toPaise, type InventoryItem, type StockPreset } from '@/lib/kitchen-api';
import { KitchenShell } from '@/components/kitchen/shell';
import { useKitchenStream } from '@/components/kitchen/use-kitchen-stream';
import { AddItemForm } from '@/components/admin/add-item';
import { kitchenSession } from '@/lib/kitchen-api';

/**
 * Inventory.
 *
 * One row per item, one tap to change availability. The whole catalogue is ~200 rows, which is
 * small enough to hold in memory and filter client-side — so searching costs no round trip, and a
 * cook looking for "paneer" mid-rush gets it instantly.
 *
 * Writes are optimistic. A cook tapping "Out of stock" needs the row to change *now*; waiting on
 * a round trip makes a tablet feel broken and gets the button pressed twice. The response
 * overwrites the guess, and a failure rolls it back with the reason.
 */

const PRESETS: Array<{ id: StockPreset; label: string }> = [
  { id: 'UNLIMITED', label: 'Unlimited' },
  { id: 'TEN', label: '10 left' },
  { id: 'FIVE', label: '5 left' },
  { id: 'OUT', label: 'Out of stock' },
];

export default function KitchenInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unavailable' | 'limited'>('all');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [isOwner, setIsOwner] = useState(false);

  // The add-item form is owner-only. The API enforces that regardless — this just avoids showing a
  // cook a control that can only ever answer 403.
  useEffect(() => {
    if (kitchenSession.get() === null) return;
    void kitchen
      .session()
      .then((r) => setIsOwner(r.session.role === 'ADMIN'))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      const { items: loaded } = await kitchen.inventory();
      setItems(loaded);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return;
      setError('Could not load the menu.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Another cook on another tablet changing an item must be visible here too — two people
  // disabling the same thing from different screens is a normal Friday.
  const stream = useKitchenStream(
    useCallback(
      (event) => {
        if (event.type === 'inventory.changed') void load();
      },
      [load],
    ),
  );

  const apply = async (item: InventoryItem, run: () => Promise<InventoryItem>, optimistic: Partial<InventoryItem>) => {
    const previous = items;
    setPending((p) => new Set(p).add(item.id));
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, ...optimistic } : i)));

    try {
      const updated = await run();
      setItems((current) => current.map((i) => (i.id === item.id ? updated : i)));
      setError(null);
    } catch (cause) {
      setItems(previous);
      setError(cause instanceof ApiError ? cause.message : 'That change did not save.');
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(item.id);
        return next;
      });
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'unavailable' && item.inStock) return false;
      if (filter === 'limited' && item.stockRemaining === null) return false;
      if (q.length === 0) return true;
      return `${item.name} ${item.categoryName}`.toLowerCase().includes(q);
    });
  }, [items, query, filter]);

  const soldOutCount = items.filter((i) => !i.inStock).length;
  const limitedCount = items.filter((i) => i.inStock && i.stockRemaining !== null).length;

  return (
    <KitchenShell
      stream={stream}
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
              <h1 className="font-display text-lg font-bold">Inventory</h1>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {items.length} items · {soldOutCount} sold out · {limitedCount} limited
              </p>
            </div>

            <div className="flex flex-1 items-center gap-2 sm:max-w-md">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the menu…"
                className="h-11 min-w-0 flex-1 rounded-[11px] px-3.5 text-sm outline-none"
                style={{
                  background: 'var(--color-inset)',
                  border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            {(
              [
                ['all', `All ${items.length}`],
                ['unavailable', `Sold out ${soldOutCount}`],
                ['limited', `Limited ${limitedCount}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className="h-10 rounded-[10px] px-3.5 text-xs font-semibold"
                style={{
                  background: filter === id ? 'rgb(255 107 26 / 0.16)' : 'var(--color-inset)',
                  color: filter === id ? 'var(--color-orange-500)' : 'var(--color-text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
      }
    >
      {isOwner && (
        <section
          className="mb-4 rounded-[14px] p-4"
          style={{ background: 'var(--color-raised)', border: '1px solid var(--color-border-subtle)' }}
        >
          <AddItemForm onCreated={() => void load()} />
        </section>
      )}

      {error !== null && (
        <p
          role="alert"
          className="mb-4 rounded-[12px] px-4 py-3 text-sm"
          style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
        >
          {error}
        </p>
      )}

      <div className="space-y-2">
        {visible.map((item) => (
          <InventoryRow
            key={item.id}
            item={item}
            busy={pending.has(item.id)}
            onToggle={() =>
              void apply(item, () => kitchen.setAvailability(item.id, !item.inStock), {
                inStock: !item.inStock,
                stockRemaining: item.inStock ? 0 : null,
              })
            }
            onPreset={(preset) =>
              void apply(item, () => kitchen.setPreset(item.id, preset), {
                inStock: preset !== 'OUT',
                stockRemaining:
                  preset === 'UNLIMITED' ? null : preset === 'TEN' ? 10 : preset === 'FIVE' ? 5 : 0,
              })
            }
          />
        ))}

        {visible.length === 0 && (
          <p className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">
            Nothing matches that.
          </p>
        )}
      </div>
    </KitchenShell>
  );
}

function InventoryRow({
  item,
  busy,
  onToggle,
  onPreset,
}: {
  item: InventoryItem;
  busy: boolean;
  onToggle: () => void;
  onPreset: (preset: StockPreset) => void;
}) {
  const activePreset: StockPreset =
    !item.inStock
      ? 'OUT'
      : item.stockRemaining === null
        ? 'UNLIMITED'
        : item.stockRemaining > 5
          ? 'TEN'
          : 'FIVE';

  return (
    <article
      className="flex flex-wrap items-center gap-3 rounded-[14px] p-3 transition-opacity duration-150 lg:flex-nowrap"
      style={{
        background: 'var(--color-raised)',
        border: `1px solid ${item.inStock ? 'var(--color-border-subtle)' : 'rgb(239 68 68 / 0.32)'}`,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px]"
        style={{ border: `2px solid ${item.isVeg ? '#22C55E' : '#EF4444'}` }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: item.isVeg ? '#22C55E' : '#EF4444' }}
        />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{item.name}</p>
        <p className="tabular truncate text-xs text-[var(--color-text-tertiary)]">
          {item.categoryName} · {Money.format(toPaise(item.pricePaise))}
          {item.inStock && item.stockRemaining !== null && (
            <span className="font-semibold text-[var(--color-warning)]">
              {' '}
              · {item.stockRemaining} left
            </span>
          )}
        </p>
      </div>

      {/* Availability switch. Its own control, separate from the presets, because "is this
          orderable at all" is the question a cook answers fastest and most often. */}
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={item.inStock}
        className="flex h-12 w-[8.5rem] shrink-0 items-center justify-center gap-2 rounded-[11px] text-xs font-bold uppercase tracking-[0.06em] transition-colors duration-150"
        style={
          item.inStock
            ? { background: 'rgb(34 197 94 / 0.16)', color: 'var(--color-success)' }
            : { background: 'rgb(239 68 68 / 0.16)', color: 'var(--color-danger)' }
        }
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: 'currentColor' }}
          aria-hidden
        />
        {item.inStock ? 'Available' : 'Sold out'}
      </button>

      <div className="flex w-full shrink-0 gap-1.5 lg:w-auto">
        {PRESETS.map((preset) => {
          const active = preset.id === activePreset;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPreset(preset.id)}
              disabled={busy}
              aria-pressed={active}
              className="h-12 flex-1 rounded-[10px] px-2.5 text-[11px] font-semibold transition-colors duration-150 lg:flex-none"
              style={{
                background: active ? 'rgb(255 107 26 / 0.16)' : 'var(--color-inset)',
                color: active ? 'var(--color-orange-500)' : 'var(--color-text-secondary)',
                boxShadow: active ? 'inset 0 0 0 1px rgb(255 107 26 / 0.36)' : 'none',
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </article>
  );
}
