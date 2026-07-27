import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_TERMS,
  DELIVERY_FEE_PAISE,
  GST_RATE_BPS,
  HANDLING_FEE_PAISE,
  isWaived,
  meetsMinimumOrder,
  MIN_ORDER_PAISE,
  shortfallToMinimum,
} from './pricing-config.js';
import { add, format, paise, percentOf } from './money.js';

describe('commercial terms', () => {
  it('charges nothing beyond the menu price', () => {
    expect(DELIVERY_FEE_PAISE).toBe(0n);
    expect(HANDLING_FEE_PAISE).toBe(0n);
    expect(GST_RATE_BPS).toBe(0);
    expect(COMMERCIAL_TERMS.freeDeliveryAlways).toBe(true);
  });

  it('sets the minimum order at ₹100', () => {
    expect(MIN_ORDER_PAISE).toBe(10_000n);
    expect(format(MIN_ORDER_PAISE)).toBe('₹100.00');
  });

  it('means the grand total equals the subtotal exactly', () => {
    const subtotal = paise(34_900); // ₹349
    const tax = percentOf(subtotal, GST_RATE_BPS);
    const total = add(add(subtotal, HANDLING_FEE_PAISE), add(DELIVERY_FEE_PAISE, tax));

    expect(tax).toBe(0n);
    expect(total).toBe(subtotal);
    expect(format(total)).toBe('₹349.00');
  });
});

describe('isWaived — drives the "FREE" label', () => {
  it('marks zero charges as waived so they render as FREE, not ₹0.00', () => {
    expect(isWaived(DELIVERY_FEE_PAISE)).toBe(true);
    expect(isWaived(HANDLING_FEE_PAISE)).toBe(true);
    expect(isWaived(paise(500))).toBe(false);
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
    expect(shortfallToMinimum(paise(7900))).toBe(2100n);
    expect(format(shortfallToMinimum(paise(7900)))).toBe('₹21.00');
    expect(shortfallToMinimum(paise(10_000))).toBe(0n);
    expect(shortfallToMinimum(paise(25_000))).toBe(0n);
  });
});
