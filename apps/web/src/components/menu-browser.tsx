'use client';

import { useMemo, useState } from 'react';
import { Money } from '@juice-stop/core';
import { CATEGORIES, PRODUCTS, TAG_LABELS, type MenuProduct } from '@/data/menu';
import { CheckIcon, ClockIcon, DietMark, PlusIcon, SearchIcon, StarIcon } from './icons';
import { EmptyState } from './ui';

/**
 * The menu browser.
 *
 * Two deliberate decisions:
 *
 * 1. **The catalogue is imported here, not passed as a prop.** `bigint` cannot cross the RSC
 *    serialisation boundary, and money is `bigint` paise (ADR-003). Importing the static module
 *    directly sidesteps that entirely — no conversion to `number` and back, which is exactly the
 *    round-trip that reintroduces float error into prices.
 *
 * 2. **Filtering and search are entirely client-side.** The whole menu is well under 60 KB, so
 *    changing category or typing a query costs zero network round trips and shows no spinner.
 *    That is the difference between feeling native and feeling like a website
 *    (01-system-architecture.md §12).
 */
export function MenuBrowser({ acceptingOrders }: { acceptingOrders: boolean }) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (categoryId !== null && p.categoryId !== categoryId) return false;
      if (vegOnly && !p.isVeg) return false;
      if (q.length > 0 && !`${p.name} ${p.tagline}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [categoryId, query, vegOnly]);

  const clearAll = () => {
    setQuery('');
    setCategoryId(null);
    setVegOnly(false);
  };

  return (
    <div>
      {/* Search — no network request, so results appear as fast as the user types. */}
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
          <SearchIcon size={17} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the whole menu…"
          aria-label="Search the menu"
          className="h-12 w-full rounded-[14px] border bg-[var(--color-inset)] pl-11 pr-4 text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
        />
      </div>

      {/* Category pills */}
      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        <Pill active={categoryId === null} onClick={() => setCategoryId(null)}>
          All
        </Pill>
        {CATEGORIES.map((c) => (
          <Pill key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
            {c.name}
          </Pill>
        ))}
      </div>

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

      {/* Results */}
      {visible.length > 0 ? (
        <div className="mt-4 space-y-3">
          {visible.map((product) => (
            <ProductRow key={product.id} product={product} acceptingOrders={acceptingOrders} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<SearchIcon size={26} />}
          title="Nothing matches that"
          body="Try a different search, or browse the whole menu."
          action={
            <button
              type="button"
              onClick={clearAll}
              className="pressable rounded-[12px] border px-5 py-2.5 text-sm font-semibold"
              style={{ background: 'var(--color-raised)' }}
            >
              Clear filters
            </button>
          }
        />
      )}
    </div>
  );
}

function Pill({
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
      className="pressable shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium"
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
      {children}
    </button>
  );
}

function ProductRow({
  product,
  acceptingOrders,
}: {
  product: MenuProduct;
  acceptingOrders: boolean;
}) {
  const soldOut = !product.inStock;
  const canAdd = acceptingOrders && !soldOut;

  return (
    <article
      className="glass liftable flex gap-3.5 rounded-[20px] p-3.5"
      style={soldOut ? { opacity: 0.5 } : undefined}
    >
      <div
        className="flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-[14px] text-3xl"
        style={{
          background: 'var(--gradient-glow)',
          filter: soldOut ? 'grayscale(1)' : undefined,
        }}
        aria-hidden
      >
        {product.emoji}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="mt-[3px]">
            <DietMark isVeg={product.isVeg} />
          </span>
          <h3 className="min-w-0 flex-1 font-display text-sm font-semibold leading-snug">
            {product.name}
          </h3>
        </div>

        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-secondary)]">
          {product.tagline}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1">
            <StarIcon size={12} filled className="text-[var(--color-warning)]" />
            <span className="tabular">{product.rating}</span>
            <span className="opacity-60">({product.ratingCount})</span>
          </span>
          <span className="flex items-center gap-1">
            <ClockIcon size={12} />
            <span className="tabular">{Math.round(product.prepTimeSeconds / 60)} min</span>
          </span>
          {product.spiceLevel > 0 && (
            <span aria-label={`Spice level ${product.spiceLevel} of 3`}>
              {'🌶️'.repeat(product.spiceLevel)}
            </span>
          )}
        </div>

        {product.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {product.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'rgb(168 85 247 / 0.15)', color: 'var(--color-purple-300)' }}
              >
                {TAG_LABELS[tag] ?? tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="tabular font-display text-base font-semibold">
              {Money.format(Money.paise(product.pricePaise))}
            </span>
            {product.compareAtPaise !== null && (
              <span className="tabular text-xs text-[var(--color-text-tertiary)] line-through">
                {Money.format(Money.paise(product.compareAtPaise))}
              </span>
            )}
          </div>

          {soldOut ? (
            <span className="rounded-[10px] border px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              Sold out
            </span>
          ) : (
            <button
              type="button"
              disabled={!canAdd}
              /* Disabled before 7 PM, but the OrderingBanner above already explains why — a dead
                 button with no explanation is the thing to avoid, not a disabled one. */
              title={canAdd ? undefined : 'Ordering opens at 7 PM'}
              className="pressable flex h-9 items-center gap-1 rounded-[10px] px-3.5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-35"
              style={{ background: 'var(--gradient-brand)' }}
            >
              <PlusIcon size={15} strokeWidth={2.5} />
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
