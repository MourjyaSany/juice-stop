'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Money } from '@juice-stop/core';
import {
  BROWSABLE_CATEGORIES as CATEGORIES,
  GROUPS,
  BROWSABLE_ITEMS as ITEMS,
  TAG_LABELS,
  hasChoices,
  priceFrom,
  type GroupId,
  type MenuItem,
} from '@/data/menu';
import { priceCart, useCart } from '@/store/cart';
import { assetForItem } from '@/data/assets';
import { useAcceptingOrders, useIsSoldOut, useStockLeft } from '@/components/storefront-live';
import { ItemSheet } from './item-sheet';
import { FloatingCart } from './floating-cart';
import { CartDrawer } from './cart-drawer';
import { QuantityStepper } from './quantity-stepper';
import { GeneratedImage } from './system/generated-image';
import { CheckIcon, DietMark, SearchIcon } from './icons';
import { EmptyState, useHydrated } from './ui';
import { SPRING } from './motion-provider';


export function MenuBrowser({ acceptingOrders }: { acceptingOrders: boolean }) {
  // The prop is the server-rendered schedule; the hook is what the API says right now, including
  // a manual override the owner set thirty seconds ago. The hook wins once it has an answer.
  const takingOrders = useAcceptingOrders(acceptingOrders);
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  const totals = useMemo(() => priceCart(lines), [lines]);

  const [groupId, setGroupId] = useState<GroupId>('food');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const searching = query.trim().length > 0;
  const categories = useMemo(() => CATEGORIES.filter((c) => c.groupId === groupId), [groupId]);

  /** How many of each item are in the cart, for the stepper's resting state. */
  const quantityByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
    return map;
  }, [lines]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((item) => {
      if (vegOnly && !item.isVeg) return false;
      // Search spans every group — someone typing "paneer" wants every paneer dish, not just the
      // ones in the tab they happened to leave open.
      if (q.length > 0) return `${item.name} ${item.description ?? ''}`.toLowerCase().includes(q);
      if (item.groupId !== groupId) return false;
      if (categoryId !== null && item.categoryId !== categoryId) return false;
      return true;
    });
  }, [groupId, categoryId, query, vegOnly]);

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

  /* ── Cart operations for single-configuration items ───────────────────────────────────────── */

  const incrementSimple = (item: MenuItem) => {
    const state = useCart.getState();
    const existing = state.lines.find((l) => l.itemId === item.id);
    if (existing !== undefined) state.setQuantity(existing.lineId, existing.quantity + 1);
    else
      state.add({
        itemId: item.id,
        variantId: item.variants[0]!.id,
        addOnIds: [],
        quantity: 1,
        note: '',
      });
  };

  const decrementSimple = (item: MenuItem) => {
    const state = useCart.getState();
    const existing = state.lines.find((l) => l.itemId === item.id);
    if (existing !== undefined) state.setQuantity(existing.lineId, existing.quantity - 1);
  };

  return (
    <div>
      <SearchField value={query} onChange={setQuery} />

      {/* Group segmented control — hidden while searching, since search spans every group. */}
      <AnimatePresence initial={false}>
        {!searching && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING.smooth}
            className="overflow-hidden"
          >
            <div
              className="mt-4 grid grid-cols-4 gap-1 rounded-[16px] p-1"
              style={{ background: 'var(--color-inset)', border: '1px solid var(--color-border-subtle)' }}
            >
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
                    className="relative flex flex-col items-center gap-1 rounded-[12px] py-2.5 transition-colors duration-200"
                    style={{ color: active ? '#fff' : 'var(--color-text-secondary)' }}
                  >
                    {/* One shared pill that slides between tabs — the hallmark of a segmented
                        control that feels native rather than four independently styled buttons. */}
                    {active && (
                      <m.span
                        layoutId="group-pill"
                        transition={SPRING.snappy}
                        className="absolute inset-0 rounded-[12px]"
                        style={{
                          background: 'var(--gradient-brand)',
                          boxShadow: '0 4px 14px -5px rgb(255 107 26 / 0.7)',
                        }}
                      />
                    )}
                    <span className="relative text-base leading-none" aria-hidden>
                      {g.emoji}
                    </span>
                    <span className="relative text-[0.6875rem] font-semibold">{g.name}</span>
                  </button>
                );
              })}
            </div>

            {categories.length > 1 && (
              <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 py-0.5">
                <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
                  All
                </Chip>
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    active={categoryId === c.id}
                    onClick={() => setCategoryId(c.id)}
                  >
                    <span className="mr-1" aria-hidden>
                      {c.emoji}
                    </span>
                    {c.name}
                  </Chip>
                ))}
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>

      <div className="mt-3.5 flex items-center justify-between">
        <VegToggle active={vegOnly} onToggle={() => setVegOnly((v) => !v)} />
        <p className="tabular text-xs text-[var(--color-text-tertiary)]">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {sections.length > 0 ? (
        <div className="mt-6 space-y-8">
          {sections.map(({ category, items }) => (
            <section key={category.id}>
              <SectionHeader
                emoji={category.emoji}
                name={category.name}
                count={items.length}
                note={category.note}
              />

              <div className="mt-3.5 space-y-2.5">
                {items.map((item, index) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    quantity={quantityByItem.get(item.id) ?? 0}
                    acceptingOrders={takingOrders}
                    onOpenSheet={() => setSheetItem(item)}
                    onIncrement={() => incrementSimple(item)}
                    onDecrement={() => decrementSimple(item)}
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
          body="Try a different search, or browse another section."
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

      <ItemSheet item={sheetItem} open={sheetItem !== null} onClose={() => setSheetItem(null)} />

      {hydrated && (
        <FloatingCart
          itemCount={totals.itemCount}
          subtotalPaise={totals.subtotalPaise}
          onOpen={() => setCartOpen(true)}
        />
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────────────────────────── */

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <m.div
      animate={{ scale: focused ? 1.01 : 1 }}
      transition={SPRING.snappy}
      className="relative rounded-[15px]"
      style={{
        boxShadow: focused ? '0 0 0 2px rgb(255 107 26 / 0.4), 0 8px 24px -12px rgb(255 107 26 / 0.6)' : 'none',
      }}
    >
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
        <SearchIcon size={17} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search 250+ items…"
        aria-label="Search the menu"
        className="h-12 w-full rounded-[15px] border bg-[var(--color-inset)] pl-11 pr-4 text-base placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
      />
    </m.div>
  );
}

function SectionHeader({
  emoji,
  name,
  count,
  note,
}: {
  emoji: string;
  name: string;
  count: number;
  // Explicit `| undefined` because exactOptionalPropertyTypes separates "absent" from
  // "present and undefined", and the caller forwards an optional field directly.
  note?: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-sm"
        style={{ background: 'var(--gradient-glow)' }}
        aria-hidden
      >
        {emoji}
      </span>
      <h2 className="font-display text-base font-bold tracking-[-0.01em]">{name}</h2>
      <span
        className="tabular rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: 'var(--color-raised)', color: 'var(--color-text-tertiary)' }}
      >
        {count}
      </span>
      {/* Hairline that fades out — closes the header without a hard rule across the card. */}
      <span
        aria-hidden
        className="ml-1 h-px flex-1"
        style={{
          background:
            'linear-gradient(90deg, var(--color-border-strong), transparent)',
        }}
      />
      {note !== undefined && (
        <span className="text-[10px] text-[var(--color-text-tertiary)]">{note}</span>
      )}
    </div>
  );
}

function ItemCard({
  item,
  index,
  quantity,
  acceptingOrders,
  onOpenSheet,
  onIncrement,
  onDecrement,
}: {
  item: MenuItem;
  index: number;
  quantity: number;
  acceptingOrders: boolean;
  onOpenSheet: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  // Two sources, one meaning. `item.inStock` is the build-time catalogue default; the live flag
  // is what the kitchen has decided tonight and always wins. Everything downstream — the grey
  // wash, the disabled stepper, the "Sold out" pill — already keys off this one boolean.
  const liveSoldOut = useIsSoldOut(item.id);
  const stockLeft = useStockLeft(item.id);
  const soldOut = !item.inStock || liveSoldOut;
  const disabled = !acceptingOrders || soldOut;
  const choices = hasChoices(item);
  const inCart = quantity > 0;

  return (
    <m.article
      /* ENTRANCE — fires when the row scrolls into view, not on mount. In a 90-item category the
         rows below the fold would otherwise have finished animating before anyone saw them.
         Stagger is `index % 8` so each screenful ripples, rather than item 80 waiting 1.4s. */
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      whileInView={{ opacity: soldOut ? 0.45 : 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ ...SPRING.smooth, delay: (index % 8) * 0.04 }}
      /* INTERACTION — deliberately different in kind from the entrance. Entrance travels
         vertically; touch compresses in place. A press that repeated the entrance would read as
         the row reloading rather than responding. */
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      className="group relative flex items-center gap-3.5 rounded-[18px] p-3.5 transition-[box-shadow,border-color] duration-300"
      style={{
        background: inCart
          ? 'linear-gradient(135deg, rgb(255 107 26 / 0.09), rgb(168 85 247 / 0.05))'
          : 'linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.015))',
        border: `1px solid ${inCart ? 'rgb(255 107 26 / 0.35)' : 'rgb(255 255 255 / 0.07)'}`,
        boxShadow: inCart
          ? '0 6px 22px -12px rgb(255 107 26 / 0.55)'
          : '0 2px 8px -4px rgb(0 0 0 / 0.4)',
      }}
    >
      {/* Warm wash that blooms under the pointer. Opacity only — no repaint of the card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[18px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(120% 100% at 12% 50%, rgb(255 107 26 / 0.10), transparent 60%)',
        }}
      />
      <div
        className="h-[4.25rem] w-[4.25rem] shrink-0 transition-transform duration-300 group-hover:scale-[1.05]"
        style={{ filter: soldOut ? 'grayscale(1)' : undefined }}
      >
        <GeneratedImage
          slug={assetForItem(item.name, item.categoryId)}
          rounded="15px"
          className="h-full w-full"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <span className="mt-[3px] shrink-0">
            <DietMark isVeg={item.isVeg} size={13} />
          </span>
          <h3 className="min-w-0 flex-1 font-display text-[0.9375rem] font-semibold leading-snug tracking-[-0.005em]">
            {item.name}
          </h3>
        </div>

        {item.description !== undefined && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {item.description}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="flex items-baseline gap-1">
            {item.variants.length > 1 && (
              <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                from
              </span>
            )}
            <span className="tabular font-display text-[0.9375rem] font-bold">
              {Money.format(priceFrom(item))}
            </span>
          </span>

          {item.variants.length > 1 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: 'rgb(168 85 247 / 0.16)', color: 'var(--color-purple-300)' }}
            >
              {item.variants.length} sizes
            </span>
          )}

          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: 'rgb(255 107 26 / 0.16)', color: 'var(--color-orange-500)' }}
            >
              {TAG_LABELS[tag] ?? tag}
            </span>
          ))}

          {/* Scarcity, but only when it is real — the count comes from the kitchen, not from a
              growth tactic. Shown at five or fewer because that is where it changes a decision. */}
          {!soldOut && stockLeft !== null && stockLeft <= 5 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: 'rgb(245 158 11 / 0.18)', color: 'var(--color-warning)' }}
            >
              Only {stockLeft} left
            </span>
          )}
        </div>
      </div>

      {soldOut ? (
        <span className="shrink-0 rounded-[10px] border px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
          Sold out
        </span>
      ) : choices ? (
        // Items with sizes or add-ons must go through the sheet — silently picking a size for
        // someone is how a customer ends up with a small pizza they did not order.
        <button
          type="button"
          onClick={onOpenSheet}
          disabled={disabled}
          title={disabled ? 'Ordering opens at 7 PM' : undefined}
          className="pressable relative flex h-9 shrink-0 items-center gap-1 rounded-[11px] px-3.5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-35"
          style={{
            background: 'var(--gradient-brand)',
            boxShadow: '0 4px 14px -4px rgb(255 107 26 / 0.5)',
          }}
        >
          Add
          {inCart && (
            <m.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={SPRING.bouncy}
              className="tabular absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
              style={{ background: 'var(--color-text-primary)', color: 'var(--color-canvas)' }}
            >
              {quantity}
            </m.span>
          )}
        </button>
      ) : (
        <QuantityStepper
          quantity={quantity}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          disabled={disabled}
          disabledTitle="Ordering opens at 7 PM"
        />
      )}
    </m.article>
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
      className="pressable relative shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200"
      style={{
        color: active ? '#fff' : 'var(--color-text-secondary)',
        background: active ? 'transparent' : 'var(--color-raised)',
        border: `1px solid ${active ? 'transparent' : 'var(--color-border-subtle)'}`,
      }}
    >
      {active && (
        <m.span
          layoutId="category-chip"
          transition={SPRING.snappy}
          className="absolute inset-0 rounded-full"
          style={{
            background: 'var(--color-purple-500)',
            boxShadow: '0 4px 14px -6px rgb(168 85 247 / 0.9)',
          }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

function VegToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className="pressable flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition-colors duration-200"
      style={{
        background: active ? 'rgb(34 197 94 / 0.14)' : 'transparent',
        color: active ? 'var(--color-success)' : 'var(--color-text-secondary)',
      }}
    >
      <m.span
        animate={{
          backgroundColor: active ? 'rgb(34,197,94)' : 'rgba(0,0,0,0)',
          borderColor: active ? 'rgb(34,197,94)' : 'var(--color-border-strong)',
        }}
        transition={{ duration: 0.2 }}
        className="flex h-5 w-5 items-center justify-center rounded-full border"
        aria-hidden
      >
        <AnimatePresence>
          {active && (
            <m.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={SPRING.bouncy}
              className="text-black"
            >
              <CheckIcon size={12} strokeWidth={3.2} />
            </m.span>
          )}
        </AnimatePresence>
      </m.span>
      Veg only
    </button>
  );
}
