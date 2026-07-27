'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Money } from '@juice-stop/core';
import {
  CATEGORIES,
  GROUPS,
  ITEMS,
  TAG_LABELS,
  hasChoices,
  priceFrom,
  type GroupId,
  type MenuItem,
} from '@/data/menu';
import { priceCart, useCart } from '@/store/cart';
import { ItemSheet } from './item-sheet';
import { BagIcon, CheckIcon, DietMark, PlusIcon, SearchIcon } from './icons';
import { EmptyState, useHydrated } from './ui';

/**
 * The menu browser.
 *
 * ~250 items presented as **two levels of navigation** rather than one endless list: group tabs
 * (Food · Snacks · Drinks · Combos) narrow to a handful of categories, which render as labelled
 * sections. A single flat list of 250 rows is unusable on a phone at 1 AM.
 *
 * Filtering and search are entirely client-side — the whole menu is already in memory, so
 * changing category or typing costs zero network round trips and shows no spinner.
 */
export function MenuBrowser({ acceptingOrders }: { acceptingOrders: boolean }) {
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  const totals = useMemo(() => priceCart(lines), [lines]);

  const [groupId, setGroupId] = useState<GroupId>('food');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searching = query.trim().length > 0;

  const notify = (name: string) => {
    setToast(`${name} added`);
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );

  const categories = useMemo(
    () => CATEGORIES.filter((c) => c.groupId === groupId),
    [groupId],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((item) => {
      if (vegOnly && !item.isVeg) return false;

      // Search deliberately ignores the group/category filters — someone typing "paneer" wants
      // every paneer dish, not the paneer dishes that happen to be in the tab they left open.
      if (q.length > 0) {
        return `${item.name} ${item.description ?? ''}`.toLowerCase().includes(q);
      }

      if (item.groupId !== groupId) return false;
      if (categoryId !== null && item.categoryId !== categoryId) return false;
      return true;
    });
  }, [groupId, categoryId, query, vegOnly]);

  /** Group the visible items under their category so sections stay labelled. */
  const sections = useMemo(() => {
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of visible) {
      const list = byCategory.get(item.categoryId) ?? [];
      list.push(item);
      byCategory.set(item.categoryId, list);
    }
    return CATEGORIES.filter((c) => byCategory.has(c.id)).map((c) => ({
      category: c,
      items: byCategory.get(c.id)!,
    }));
  }, [visible]);

  const openOrAdd = (item: MenuItem) => {
    // Items with a single price and no add-ons skip the sheet entirely — one tap, done.
    if (!hasChoices(item)) {
      useCart.getState().add({
        itemId: item.id,
        variantId: item.variants[0]!.id,
        addOnIds: [],
        quantity: 1,
        note: '',
      });
      notify(item.name);
      return;
    }
    setSheetItem(item);
  };

  return (
    <div>
      {/* Search */}
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
          <SearchIcon size={17} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 250+ items…"
          aria-label="Search the menu"
          className="h-12 w-full rounded-[14px] border bg-[var(--color-inset)] pl-11 pr-4 text-base placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
        />
      </div>

      {/* Group tabs — hidden while searching, since search spans every group. */}
      {!searching && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {GROUPS.map((g) => {
            const active = g.id === groupId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGroupId(g.id);
                  setCategoryId(null);
                }}
                aria-pressed={active}
                className="pressable flex flex-col items-center gap-1 rounded-[14px] py-2.5"
                style={
                  active
                    ? { background: 'var(--gradient-brand)', color: '#fff', boxShadow: 'var(--glow-orange)' }
                    : {
                        background: 'var(--color-raised)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-subtle)',
                      }
                }
              >
                <span className="text-base leading-none" aria-hidden>
                  {g.emoji}
                </span>
                <span className="text-[0.6875rem] font-semibold">{g.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Category chips within the group */}
      {!searching && categories.length > 1 && (
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
            All
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setVegOnly((v) => !v)}
          aria-pressed={vegOnly}
          className="pressable flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium"
          style={{
            background: vegOnly ? 'rgb(34 197 94 / 0.14)' : 'transparent',
            color: vegOnly ? 'var(--color-success)' : 'var(--color-text-secondary)',
          }}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full border"
            style={{
              borderColor: vegOnly ? 'var(--color-success)' : 'var(--color-border-strong)',
              background: vegOnly ? 'var(--color-success)' : 'transparent',
            }}
            aria-hidden
          >
            {vegOnly && <CheckIcon size={12} strokeWidth={3} className="text-black" />}
          </span>
          Veg only
        </button>
        <p className="tabular text-xs text-[var(--color-text-tertiary)]">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Sections */}
      {sections.length > 0 ? (
        <div className="mt-5 space-y-7">
          {sections.map(({ category, items }) => (
            <section key={category.id}>
              <div className="mb-3 flex items-baseline gap-2">
                <span aria-hidden>{category.emoji}</span>
                <h2 className="font-display text-base font-semibold">{category.name}</h2>
                <span className="tabular text-xs text-[var(--color-text-tertiary)]">
                  {items.length}
                </span>
                {category.note !== undefined && (
                  <span className="ml-auto text-[10px] text-[var(--color-text-tertiary)]">
                    {category.note}
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    acceptingOrders={acceptingOrders}
                    onAdd={() => openOrAdd(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<SearchIcon size={26} />}
          title="Nothing matches that"
          body="Try a different search, or browse a different section."
          action={
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryId(null);
                setVegOnly(false);
              }}
              className="pressable rounded-[12px] border px-5 py-2.5 text-sm font-semibold"
              style={{ background: 'var(--color-raised)' }}
            >
              Clear filters
            </button>
          }
        />
      )}

      <ItemSheet
        item={sheetItem}
        open={sheetItem !== null}
        onClose={() => setSheetItem(null)}
        onAdded={notify}
      />

      {/* Toast */}
      {toast !== null && (
        <div
          role="status"
          className="glass-strong fixed inset-x-0 bottom-[6.5rem] z-40 mx-auto flex w-fit items-center gap-2 rounded-full px-4 py-2.5"
          style={{ animation: 'rise 0.28s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <span style={{ color: 'var(--color-success)' }}>
            <CheckIcon size={16} strokeWidth={2.6} />
          </span>
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Floating cart bar */}
      {hydrated && totals.itemCount > 0 && (
        <Link
          href="/cart"
          className="glass-strong pressable fixed inset-x-4 bottom-[5.75rem] z-40 mx-auto flex max-w-[28rem] items-center justify-between rounded-[16px] px-4 py-3"
          style={{ animation: 'rise 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <span className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[11px]"
              style={{ background: 'var(--gradient-brand)', color: '#fff' }}
            >
              <BagIcon size={17} />
            </span>
            <span>
              <span className="tabular block text-sm font-semibold">
                {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
              </span>
              <span className="tabular block text-xs text-[var(--color-text-secondary)]">
                {Money.format(totals.subtotalPaise)}
              </span>
            </span>
          </span>
          <span className="font-display text-sm font-semibold text-[var(--color-purple-300)]">
            View cart →
          </span>
        </Link>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="pressable shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium"
      style={
        active
          ? { background: 'var(--color-purple-500)', color: '#fff' }
          : {
              background: 'var(--color-raised)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-subtle)',
            }
      }
    >
      {children}
    </button>
  );
}

function ItemRow({
  item,
  acceptingOrders,
  onAdd,
}: {
  item: MenuItem;
  acceptingOrders: boolean;
  onAdd: () => void;
}) {
  const soldOut = !item.inStock;
  const canAdd = acceptingOrders && !soldOut;
  const multi = item.variants.length > 1;

  return (
    <article
      className="glass flex items-start gap-3 rounded-[16px] p-3.5"
      style={soldOut ? { opacity: 0.5 } : undefined}
    >
      <span className="mt-[3px] shrink-0">
        <DietMark isVeg={item.isVeg} />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-sm font-semibold leading-snug">{item.name}</h3>

        {item.description !== undefined && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {item.description}
          </p>
        )}

        {item.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'rgb(255 107 26 / 0.15)', color: 'var(--color-orange-500)' }}
              >
                {TAG_LABELS[tag] ?? tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          {multi && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
              from
            </span>
          )}
          <span className="tabular font-display text-sm font-semibold">
            {Money.format(priceFrom(item))}
          </span>
          {multi && (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              · {item.variants.length} sizes
            </span>
          )}
        </div>
      </div>

      {soldOut ? (
        <span className="shrink-0 rounded-[10px] border px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
          Sold out
        </span>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          title={canAdd ? undefined : 'Ordering opens at 7 PM'}
          className="pressable flex h-9 shrink-0 items-center gap-1 rounded-[10px] px-3 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-35"
          style={{ background: 'var(--gradient-brand)' }}
        >
          <PlusIcon size={15} strokeWidth={2.6} />
          Add
        </button>
      )}
    </article>
  );
}
