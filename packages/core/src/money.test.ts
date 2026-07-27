import { describe, expect, it } from 'vitest';
import {
  ZERO,
  add,
  allocate,
  atLeastZero,
  clamp,
  format,
  fromRupees,
  multiply,
  MoneyError,
  paise,
  percentOf,
  sub,
  sum,
  taxIncludedIn,
  toRupeeString,
} from './money.js';

describe('paise()', () => {
  it('accepts whole numbers and bigints', () => {
    expect(paise(35910)).toBe(35910n);
    expect(paise(0n)).toBe(0n);
    expect(paise(-500)).toBe(-500n);
  });

  it('REJECTS fractional input — a fractional paisa means float arithmetic upstream', () => {
    expect(() => paise(359.1)).toThrow(MoneyError);
    expect(() => paise(0.1 + 0.2)).toThrow(/whole number/);
  });

  it('rejects non-finite and out-of-range values', () => {
    expect(() => paise(Number.NaN)).toThrow(MoneyError);
    expect(() => paise(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => paise(100_000_001n)).toThrow(/out of range/);
  });
});

describe('fromRupees()', () => {
  it.each([
    ['359.10', 35910n],
    ['359.1', 35910n],
    ['359', 35900n],
    ['0.05', 5n],
    ['1,234.50', 123450n],
    ['₹359.10', 35910n],
    ['-50.00', -5000n],
    [359.1, 35910n],
  ])('parses %o → %o paise', (input, expected) => {
    expect(fromRupees(input)).toBe(expected);
  });

  it('rejects more than 2 decimal places rather than silently truncating', () => {
    expect(() => fromRupees('359.105')).toThrow(MoneyError);
    expect(() => fromRupees('abc')).toThrow(MoneyError);
    expect(() => fromRupees('')).toThrow(MoneyError);
  });

  it('survives the float trap that starts every money bug', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754.
    // Going through strings and integers, the arithmetic is exact.
    expect(add(fromRupees('0.10'), fromRupees('0.20'))).toBe(fromRupees('0.30'));
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and sums exactly', () => {
    expect(add(paise(18900), paise(7900))).toBe(26800n);
    expect(sub(paise(36800), paise(5000))).toBe(31800n);
    expect(sum([paise(18900), paise(7900), paise(9900)])).toBe(36700n);
    expect(sum([])).toBe(ZERO);
  });

  it('multiplies by whole quantities only', () => {
    expect(multiply(paise(18900), 3)).toBe(56700n);
    expect(multiply(paise(18900), 0)).toBe(0n);
    expect(() => multiply(paise(100), 1.5)).toThrow(MoneyError);
    expect(() => multiply(paise(100), -1)).toThrow(MoneyError);
  });

  it('clamps and floors at zero', () => {
    expect(clamp(paise(9000), ZERO, paise(5000))).toBe(5000n);
    expect(atLeastZero(paise(-500))).toBe(0n);
  });
});

describe('percentOf() — GST', () => {
  it('applies 5% GST rounding halves away from zero', () => {
    // ₹359.10 × 5% = ₹17.955 → ₹17.96
    expect(percentOf(paise(35910), 500)).toBe(1796n);
  });

  it('handles the exact-half boundary deterministically', () => {
    // 100 × 5% = 5.0 exactly
    expect(percentOf(paise(100), 500)).toBe(5n);
    // 10 × 5% = 0.5 → rounds up to 1
    expect(percentOf(paise(10), 500)).toBe(1n);
    // 9 × 5% = 0.45 → rounds down to 0
    expect(percentOf(paise(9), 500)).toBe(0n);
  });

  it('rejects invalid basis points', () => {
    expect(() => percentOf(paise(100), -1)).toThrow(MoneyError);
    expect(() => percentOf(paise(100), 5.5)).toThrow(MoneyError);
  });
});

describe('taxIncludedIn() — tax-inclusive menu prices', () => {
  it('extracts GST already contained in a gross amount', () => {
    // ₹105.00 gross at 5% contains exactly ₹5.00 of tax
    expect(taxIncludedIn(paise(10500), 500)).toBe(500n);
  });

  it('round-trips: gross − containedTax = net, and net + 5% ≈ gross', () => {
    const gross = paise(20000); // ₹200.00
    const tax = taxIncludedIn(gross, 500);
    const net = sub(gross, tax);
    expect(add(net, percentOf(net, 500))).toBe(gross);
  });
});

describe('allocate() — the reconciliation-drift killer', () => {
  it('splits a discount across line items summing EXACTLY to the total', () => {
    const discount = paise(5000); // ₹50.00
    const lineTotals = [18900n, 7900n, 9900n]; // ₹189, ₹79, ₹99

    const parts = allocate(discount, lineTotals);

    expect(parts).toEqual([2575n, 1076n, 1349n]);
    expect(sum(parts)).toBe(discount); // ← the invariant that matters
  });

  it('never loses or invents a paisa, across many awkward splits', () => {
    for (let total = 1; total <= 200; total++) {
      for (const weights of [
        [1n, 1n, 1n],
        [1n, 2n, 3n],
        [18900n, 7900n, 9900n],
        [1n, 1n, 1n, 1n, 1n, 1n, 1n],
        [999n, 1n],
      ]) {
        const parts = allocate(paise(total), weights);
        expect(sum(parts)).toBe(paise(total));
        expect(parts).toHaveLength(weights.length);
      }
    }
  });

  it('handles a three-way split of an indivisible amount', () => {
    // ₹0.10 across three equal shares cannot divide evenly.
    const parts = allocate(paise(10), [1n, 1n, 1n]);
    expect(sum(parts)).toBe(10n);
    expect(parts).toEqual([4n, 3n, 3n]);
  });

  it('splits evenly when all weights are zero instead of dividing by zero', () => {
    const parts = allocate(paise(10), [0n, 0n, 0n]);
    expect(sum(parts)).toBe(10n);
  });

  it('handles negative amounts (refund allocation)', () => {
    const parts = allocate(paise(-5000), [18900n, 7900n, 9900n]);
    expect(sum(parts)).toBe(-5000n);
  });

  it('rejects empty weights and negative weights', () => {
    expect(() => allocate(paise(100), [])).toThrow(MoneyError);
    expect(() => allocate(paise(100), [-1n])).toThrow(MoneyError);
  });
});

describe('formatting', () => {
  it('renders plain rupee strings for invoices and CSV', () => {
    expect(toRupeeString(paise(35910))).toBe('359.10');
    expect(toRupeeString(paise(5))).toBe('0.05');
    expect(toRupeeString(paise(-5000))).toBe('-50.00');
    expect(toRupeeString(ZERO)).toBe('0.00');
  });

  it('uses Indian digit grouping for display', () => {
    expect(format(paise(35910))).toBe('₹359.10');
    expect(format(paise(123456))).toBe('₹1,234.56');
    expect(format(paise(12345678))).toBe('₹1,23,456.78');
    expect(format(paise(100000000))).toBe('₹10,00,000.00');
    expect(format(paise(35910), { symbol: false })).toBe('359.10');
    expect(format(paise(-35910))).toBe('-₹359.10');
  });
});

describe('a realistic checkout, to the paisa', () => {
  it('matches the bill shown in the wireframes exactly', () => {
    // 06-wireframes.md §4 — Chicken Zinger + extra cheese ×2, Fries, MIDNIGHT50
    const zinger = add(paise(24900), multiply(paise(2000), 2)); // ₹249 + 2×₹20 = ₹289
    const fries = paise(7900);
    const subtotal = sum([zinger, fries]); // ₹368.00
    expect(subtotal).toBe(36800n);

    const discount = paise(5000); // ₹50 coupon
    const deliveryFee = paise(1900);
    const packagingFee = paise(500);

    const taxable = add(sub(subtotal, discount), add(deliveryFee, packagingFee));
    expect(taxable).toBe(34200n); // ₹342.00

    const gst = percentOf(taxable, 500); // 5%
    expect(gst).toBe(1710n); // ₹17.10

    const total = add(taxable, gst);
    expect(total).toBe(35910n);
    expect(format(total)).toBe('₹359.10');
  });
});
