'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Money } from '@juice-stop/core';
import { storefrontApi, type ExtraGroupDto, type ExtraItemDto } from '@/lib/api';
import { useCart } from '@/store/cart';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Eyebrow } from '@/components/system';
import { DietMark } from '@/components/icons';
import { SPRING } from '@/components/motion-provider';
import { tapFeedback } from '@/lib/haptics';

/**
 * Last-minute add-ons at checkout.
 *
 * One button per **category**, not per item. The five groups — Mayo, Beverage, Smoke, Chips,
 * Biscuit — are filled from the API, so the owner adding a new drink from `/admin/menu` changes
 * what is behind the Beverage button mid-service with no deploy. Previously each individual extra
 * was its own row, which meant every new one made the checkout page longer and none of them could
 * be changed without shipping a build.
 *
 * Everything added here is an ordinary cart line. They price, total, snapshot onto the order and
 * reach the kitchen ticket through exactly the same code as a pizza — there is no parallel
 * "extras" path to drift out of sync, and the kitchen needs no change to display them.
 *
 * Mayo has no dropdown because a group of one does not deserve one. That is decided by the group's
 * `mode` from the server rather than by counting items, so a second mayo appearing later does not
 * silently change how the button behaves.
 */
export function CheckoutExtras() {
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);

  const [groups, setGroups] = useState<ExtraGroupDto[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storefrontApi
      .extras()
      .then((r) => {
        if (!cancelled) setGroups(r.groups.filter((g) => g.items.length > 0));
      })
      // Silent: checkout must still work if this fails. Losing the add-on rail costs an upsell;
      // blocking the page over it would cost the order.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const quantityByItem = useMemo(() => {
    const map = new Map<string, { lineId: string; quantity: number }>();
    for (const l of lines) {
      const existing = map.get(l.itemId);
      map.set(l.itemId, {
        lineId: existing?.lineId ?? l.lineId,
        quantity: (existing?.quantity ?? 0) + l.quantity,
      });
    }
    return map;
  }, [lines]);

  const increment = (item: ExtraItemDto) => {
    tapFeedback('add');
    const existing = quantityByItem.get(item.id);
    if (existing !== undefined) setQuantity(existing.lineId, existing.quantity + 1);
    else add({ itemId: item.id, variantId: item.variantId, addOnIds: [], quantity: 1, note: '' });
  };

  const decrement = (item: ExtraItemDto) => {
    tapFeedback('remove');
    const existing = quantityByItem.get(item.id);
    if (existing !== undefined) setQuantity(existing.lineId, existing.quantity - 1);
  };

  /** How many of anything in this group are already on the order. Drives the button's badge. */
  const groupCount = (group: ExtraGroupDto): number =>
    group.items.reduce((sum, i) => sum + (quantityByItem.get(i.id)?.quantity ?? 0), 0);

  if (groups.length === 0) return null;

  return (
    <section className="mt-7">
      <Eyebrow tone="warm">Anything else?</Eyebrow>
      <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
        Tap to add — they go straight onto this order.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {groups.map((group) => {
          const count = groupCount(group);
          const single = group.mode === 'single' ? group.items[0] : undefined;
          const isOpen = openGroup === group.categoryId;

          return (
            <button
              key={group.categoryId}
              type="button"
              aria-pressed={count > 0}
              aria-expanded={single === undefined ? isOpen : undefined}
              onClick={() => {
                if (single !== undefined) {
                  increment(single);
                  return;
                }
                tapFeedback('select');
                setOpenGroup(isOpen ? null : group.categoryId);
              }}
              className="pressable relative flex flex-col items-center gap-1.5 rounded-[15px] px-2 py-3 transition-colors duration-200"
              style={{
                background:
                  count > 0
                    ? 'linear-gradient(150deg, rgb(255 107 26 / 0.16), rgb(168 85 247 / 0.09))'
                    : isOpen
                      ? 'rgb(255 255 255 / 0.07)'
                      : 'var(--color-inset)',
                border: `1px solid ${
                  count > 0
                    ? 'rgb(255 107 26 / 0.38)'
                    : isOpen
                      ? 'rgb(255 255 255 / 0.18)'
                      : 'var(--color-border-subtle)'
                }`,
              }}
            >
              <span aria-hidden className="text-xl leading-none">
                {group.emoji}
              </span>
              <span className="font-display text-[11px] font-bold leading-none">{group.label}</span>

              {/* The count is the feedback. On a single-tap button there is no other confirmation
                  that the tap landed, and a stepper in a five-across grid would be unusably small. */}
              {count > 0 && (
                <m.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING.bouncy}
                  className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-display text-[10px] font-bold text-white"
                  style={{ background: 'var(--gradient-brand)' }}
                >
                  {count}
                </m.span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── The open dropdown ────────────────────────────────────────────────────────────────
          Rendered below the grid rather than as a floating menu: on a phone a popover over a
          five-across row covers the buttons it came from, and the customer loses their place. */}
      <AnimatePresence initial={false}>
        {groups
          .filter((g) => g.categoryId === openGroup && g.mode === 'dropdown')
          .map((group) => (
            <m.div
              key={group.categoryId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING.smooth}
              className="overflow-hidden"
            >
              <ul
                className="mt-2.5 space-y-1.5 rounded-[15px] p-2.5"
                style={{
                  background: 'var(--color-inset)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                {group.items.map((item) => {
                  const quantity = quantityByItem.get(item.id)?.quantity ?? 0;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-[11px] px-3 py-2.5"
                      style={{
                        background:
                          quantity > 0 ? 'rgb(255 107 26 / 0.10)' : 'var(--color-raised)',
                      }}
                    >
                      <span className="shrink-0">
                        <DietMark isVeg={item.isVeg} size={11} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="tabular text-xs text-[var(--color-text-secondary)]">
                          {Money.format(Money.paise(BigInt(item.pricePaise)))}
                        </p>
                      </div>
                      <QuantityStepper
                        quantity={quantity}
                        onIncrement={() => increment(item)}
                        onDecrement={() => decrement(item)}
                        size="sm"
                        label="Add"
                      />
                    </li>
                  );
                })}
              </ul>
            </m.div>
          ))}
      </AnimatePresence>
    </section>
  );
}
