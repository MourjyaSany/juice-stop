'use client';

import { useMemo } from 'react';
import { m } from 'motion/react';
import { Money } from '@juice-stop/core';
import { CHECKOUT_EXTRAS } from '@/data/menu';
import { useCart } from '@/store/cart';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Eyebrow } from '@/components/system';
import { SPRING } from '@/components/motion-provider';

/** Small illustrations — cheaper and crisper than a generated image at this size. */
const GLYPH: Record<string, string> = {
  Mayo: '🥣',
  Kurkure: '🌽',
  'Compact Cigarette': '🚬',
};

/**
 * Last-minute add-ons at checkout.
 *
 * These are ordinary cart lines, not a parallel "extras" concept. That means they price, total,
 * snapshot onto the order and reach the kitchen through exactly the same code as everything else
 * — there is no second pricing path to drift out of sync with the first.
 *
 * Each is independently repeatable via the same stepper used on the menu, so quantity behaviour
 * is identical wherever a customer meets it.
 */
export function CheckoutExtras() {
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);

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

  const increment = (itemId: string, variantId: string) => {
    const existing = quantityByItem.get(itemId);
    if (existing !== undefined) setQuantity(existing.lineId, existing.quantity + 1);
    else add({ itemId, variantId, addOnIds: [], quantity: 1, note: '' });
  };

  const decrement = (itemId: string) => {
    const existing = quantityByItem.get(itemId);
    if (existing !== undefined) setQuantity(existing.lineId, existing.quantity - 1);
  };

  return (
    <section className="mt-7">
      <Eyebrow tone="warm">Anything else?</Eyebrow>
      <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
        Add as many as you like — they go straight onto this order.
      </p>

      <ul className="mt-3 space-y-2.5">
        {CHECKOUT_EXTRAS.map((item, i) => {
          const quantity = quantityByItem.get(item.id)?.quantity ?? 0;
          const inCart = quantity > 0;

          return (
            <m.li
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING.smooth, delay: i * 0.05 }}
              className="flex items-center gap-3 rounded-[14px] p-3 transition-colors duration-300"
              style={{
                background: inCart
                  ? 'linear-gradient(140deg, rgb(255 107 26 / 0.10), rgb(168 85 247 / 0.06))'
                  : 'var(--color-inset)',
                border: `1px solid ${inCart ? 'rgb(255 107 26 / 0.32)' : 'var(--color-border-subtle)'}`,
              }}
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-lg"
                style={{ background: 'var(--gradient-glow)' }}
              >
                {GLYPH[item.name] ?? '➕'}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold">{item.name}</p>
                <p className="tabular text-xs text-[var(--color-text-secondary)]">
                  {Money.format(item.variants[0]!.pricePaise)} each
                </p>
              </div>

              <QuantityStepper
                quantity={quantity}
                onIncrement={() => increment(item.id, item.variants[0]!.id)}
                onDecrement={() => decrement(item.id)}
                size="sm"
                label="Add"
              />
            </m.li>
          );
        })}
      </ul>
    </section>
  );
}
