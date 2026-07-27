import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_TERMS,
  DELIVERY_FEE_PAISE,
  meetsMinimumOrder,
  MIN_ORDER_PAISE,
  shortfallToMinimum,
} from './pricing-config.js';
import { format, paise } from './money.js';

describe('commercial terms', () => {
  it('delivers free on every order', () => {
    expect(DELIVERY_FEE_PAISE).toBe(0n);
    expect(COMMERCIAL_TERMS.freeDeliveryAlways).toBe(true);
    expect(format(DELIVERY_FEE_PAISE)).toBe('₹0.00');
  });

  it('sets the minimum order at ₹100', () => {
    expect(MIN_ORDER_PAISE).toBe(10_000n);
    expect(format(MIN_ORDER_PAISE)).toBe('₹100.00');
  });
});

describe('minimum order checks', () => {
  it.each([
    [9900n, false, 'one rupee short'],
    [10_000n, true, 'exactly at the minimum'],
    [10_100n, true, 'above'],
    [0n, false, 'empty cart'],
  ])('subtotal %s → meets minimum: %s (%s)', (subtotal, expected) => {
    expect(meetsMinimumOrder(paise(subtotal))).toBe(expected);
  });

  it('reports the exact shortfall, never a negative', () => {
    expect(shortfallToMinimum(paise(7900))).toBe(2100n); // ₹79 → needs ₹21 more
    expect(format(shortfallToMinimum(paise(7900)))).toBe('₹21.00');
    expect(shortfallToMinimum(paise(10_000))).toBe(0n);
    expect(shortfallToMinimum(paise(25_000))).toBe(0n);
  });
});
