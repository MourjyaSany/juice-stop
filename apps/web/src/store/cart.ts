'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Money, COMMERCIAL_TERMS, type Paise } from '@juice-stop/core';
import { addOnPrice, findItem, type MenuItem, type MenuVariant } from '@/data/menu';

/**
 * Cart.
 *
 * **Only identifiers are persisted — never prices.** Two reasons:
 *
 *  1. `bigint` cannot be JSON-serialised, and money is `bigint` paise (ADR-003). Storing a
 *     `number` instead would quietly reintroduce float risk on every read.
 *  2. A cart that remembers a price from three hours ago is a cart that can charge a stale price.
 *     Recomputing from the live menu on every render means what the customer sees is always what
 *     the menu currently says. The *order* snapshots prices at placement (ADR-011); the cart
 *     deliberately does not.
 */

export interface CartLine {
  lineId: string;
  itemId: string;
  variantId: string;
  addOnIds: string[];
  quantity: number;
  note: string;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'lineId'>) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
}

/** Two lines are the same if item, variant, add-ons and note all match. */
const signature = (l: Omit<CartLine, 'lineId' | 'quantity'>) =>
  `${l.itemId}|${l.variantId}|${[...l.addOnIds].sort().join(',')}|${l.note.trim()}`;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],

      add: (line) =>
        set((s) => {
          const sig = signature(line);
          const existing = s.lines.find((l) => signature(l) === sig);

          // Adding the same configuration again bumps quantity rather than creating a duplicate
          // row — two identical "Margherita (Large) + extra cheese" lines is a bug, not a feature.
          if (existing !== undefined) {
            return {
              lines: s.lines.map((l) =>
                l.lineId === existing.lineId
                  ? { ...l, quantity: Math.min(30, l.quantity + line.quantity) }
                  : l,
              ),
            };
          }

          return {
            lines: [
              ...s.lines,
              { ...line, lineId: `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` },
            ],
          };
        }),

      setQuantity: (lineId, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.lineId !== lineId)
              : s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(30, quantity) } : l)),
        })),

      remove: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'juice-stop:cart', version: 1 },
  ),
);

/* ── Derived pricing ────────────────────────────────────────────────────────────────────────── */

export interface PricedLine {
  line: CartLine;
  item: MenuItem;
  variant: MenuVariant;
  addOnNames: string[];
  unitPaise: Paise;
  totalPaise: Paise;
}

export interface CartTotals {
  lines: PricedLine[];
  itemCount: number;
  subtotalPaise: Paise;
  deliveryFeePaise: Paise;
  packagingFeePaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  meetsMinimum: boolean;
  shortfallPaise: Paise;
  /** Longest prep time across the cart — the kitchen cooks in parallel, so max not sum. */
  prepSeconds: number;
}

/**
 * Price the cart.
 *
 * Mirrors the server-side pricing engine exactly: subtotal → discount → fees → tax. Lines that
 * reference a vanished item or variant are skipped rather than throwing, so a menu change can
 * never leave a customer staring at a crashed cart.
 */
export function priceCart(lines: CartLine[], terms = COMMERCIAL_TERMS): CartTotals {
  const priced: PricedLine[] = [];

  for (const line of lines) {
    const item = findItem(line.itemId);
    if (item === undefined) continue;

    const variant = item.variants.find((v) => v.id === line.variantId);
    if (variant === undefined) continue;

    const selectedAddOns = item.addOns.filter((a) => line.addOnIds.includes(a.id));
    const addOnTotal = Money.sum(selectedAddOns.map((a) => addOnPrice(a, variant.id)));

    const unitPaise = Money.add(variant.pricePaise, addOnTotal);

    priced.push({
      line,
      item,
      variant,
      addOnNames: selectedAddOns.map((a) => a.name),
      unitPaise,
      totalPaise: Money.multiply(unitPaise, line.quantity),
    });
  }

  const subtotalPaise = Money.sum(priced.map((p) => p.totalPaise));
  const itemCount = priced.reduce((n, p) => n + p.line.quantity, 0);

  // Free delivery on every order; packaging only applies to a non-empty cart.
  const deliveryFeePaise = terms.deliveryFeePaise;
  const packagingFeePaise = priced.length > 0 ? terms.packagingFeePaise : Money.ZERO;

  const taxableBase = Money.add(subtotalPaise, Money.add(deliveryFeePaise, packagingFeePaise));
  const taxPaise = Money.percentOf(taxableBase, terms.gstRateBps);
  const totalPaise = Money.add(taxableBase, taxPaise);

  const shortfall = terms.minOrderPaise - subtotalPaise;

  return {
    lines: priced,
    itemCount,
    subtotalPaise,
    deliveryFeePaise,
    packagingFeePaise,
    taxPaise,
    totalPaise,
    meetsMinimum: subtotalPaise >= terms.minOrderPaise,
    shortfallPaise: Money.paise(shortfall > 0n ? shortfall : 0n),
    prepSeconds: priced.reduce((max, p) => Math.max(max, p.item.prepTimeSeconds), 0),
  };
}
