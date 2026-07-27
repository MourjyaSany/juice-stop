/**
 * Money.
 *
 * Every monetary value in Juice Stop is an integer count of **paise**, held as `bigint`.
 * Never a float. Never a rupee. See ADR-003.
 *
 *   ₹359.10  →  35910n paise
 *
 * The `Paise` brand makes it a type error to pass a raw number where money is expected, so a
 * rupee value can never be mistaken for a paise value at a call site.
 *
 * Formatting to "₹359.10" happens ONLY at the render boundary.
 */

declare const PAISE_BRAND: unique symbol;

/** An integer count of paise. Construct with {@link paise} or {@link fromRupees}. */
export type Paise = bigint & { readonly [PAISE_BRAND]: true };

export const ZERO = 0n as Paise;

/** Largest value we will accept: ₹10,00,000 (10 lakh) in paise. A single order above this is a bug. */
const MAX_PAISE = 100_000_000n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Construction
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Build a Paise value from an integer count of paise.
 *
 * @throws MoneyError if not a safe integer, or outside the sane range.
 */
export function paise(value: bigint | number): Paise {
  let v: bigint;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyError(`Not a finite number: ${value}`);
    if (!Number.isInteger(value)) {
      // The single most important guard in this file: a fractional "paise" means someone did
      // float arithmetic upstream, and the error is already baked in. Fail loudly.
      throw new MoneyError(`Paise must be a whole number, got ${value}. Did you pass rupees?`);
    }
    if (!Number.isSafeInteger(value)) throw new MoneyError(`Unsafe integer: ${value}`);
    v = BigInt(value);
  } else {
    v = value;
  }

  if (v > MAX_PAISE || v < -MAX_PAISE) {
    throw new MoneyError(`Amount out of range: ${v} paise (limit ±${MAX_PAISE})`);
  }
  return v as Paise;
}

/**
 * Parse a rupee amount into paise.
 *
 * Accepts `"359.10"`, `"359.1"`, `"359"`, `"1,234.50"`, `"₹359.10"`, or a number.
 * Rejects anything with more than 2 decimal places rather than silently truncating — a third
 * decimal place means the caller's arithmetic was already wrong.
 */
export function fromRupees(value: string | number): Paise {
  const raw = String(value).trim().replace(/^₹\s*/, '').replace(/,/g, '');

  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new MoneyError(
      `Invalid rupee amount: "${value}". Expected up to 2 decimal places, e.g. "359.10".`,
    );
  }

  const negative = raw.startsWith('-');
  const [whole = '0', frac = ''] = (negative ? raw.slice(1) : raw).split('.');
  const paisePart = frac.padEnd(2, '0');
  const total = BigInt(whole) * 100n + BigInt(paisePart);

  return paise(negative ? -total : total);
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Arithmetic — closed over Paise, so a result is always still money
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

export const add = (a: Paise, b: Paise): Paise => paise(a + b);
export const sub = (a: Paise, b: Paise): Paise => paise(a - b);

/** Multiply by a whole quantity (e.g. line total = unit price × qty). */
export function multiply(amount: Paise, quantity: number): Paise {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return paise(amount * BigInt(quantity));
}

export function sum(amounts: readonly Paise[]): Paise {
  return paise(amounts.reduce<bigint>((acc, a) => acc + a, 0n));
}

export const negate = (a: Paise): Paise => paise(-a);
export const abs = (a: Paise): Paise => paise(a < 0n ? -a : a);
export const isZero = (a: Paise): boolean => a === 0n;
export const isNegative = (a: Paise): boolean => a < 0n;
export const isPositive = (a: Paise): boolean => a > 0n;
export const equals = (a: Paise, b: Paise): boolean => a === b;
export const gt = (a: Paise, b: Paise): boolean => a > b;
export const gte = (a: Paise, b: Paise): boolean => a >= b;
export const lt = (a: Paise, b: Paise): boolean => a < b;
export const lte = (a: Paise, b: Paise): boolean => a <= b;
export const max = (a: Paise, b: Paise): Paise => (a > b ? a : b);
export const min = (a: Paise, b: Paise): Paise => (a < b ? a : b);

/** Clamp to a range. Used to cap discounts at `maxDiscountPaise`. */
export function clamp(amount: Paise, lower: Paise, upper: Paise): Paise {
  if (lower > upper) throw new MoneyError('clamp: lower bound exceeds upper bound');
  return min(max(amount, lower), upper);
}

/** Floor at zero. A discount must never make a bill negative. */
export const atLeastZero = (a: Paise): Paise => max(a, ZERO);

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Rates & rounding
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Apply a rate expressed in **basis points** (1 bps = 0.01%).
 *
 *   500 bps = 5%   (GST on restaurant service)
 *  1000 bps = 10%
 *
 * Rounds half away from zero — the convention Indian tax invoices use, and the one that makes
 * `₹1.005 → ₹1.01` rather than the banker's-rounding surprise of `₹1.00`.
 */
export function percentOf(amount: Paise, basisPoints: number): Paise {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, got ${basisPoints}`);
  }
  return paise(divideRoundHalfUp(amount * BigInt(basisPoints), 10_000n));
}

/**
 * Extract the tax already contained in a tax-inclusive amount.
 *
 *   taxIncludedIn(₹105.00, 500bps) → ₹5.00
 *
 * Needed whenever menu prices are displayed inclusive of GST.
 */
export function taxIncludedIn(grossAmount: Paise, basisPoints: number): Paise {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, got ${basisPoints}`);
  }
  const denominator = 10_000n + BigInt(basisPoints);
  return paise(divideRoundHalfUp(grossAmount * BigInt(basisPoints), denominator));
}

/** Integer division rounding halves away from zero. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Split an amount across weighted shares **without losing or inventing a single paisa**.
 *
 * The classic failure: apply a ₹50 discount proportionally across three line items, round each
 * independently, and the parts sum to ₹49.99. Over a year that discrepancy is a reconciliation
 * nightmare with no obvious cause.
 *
 * Largest-remainder method: floor every share, then hand the leftover paise out one at a time to
 * whichever shares were rounded down hardest.
 *
 *   allocate(₹50.00, [18900n, 7900n, 9900n])  →  parts that sum to EXACTLY ₹50.00
 *
 * @returns one Paise value per weight, in the same order, summing exactly to `amount`.
 */
export function allocate(amount: Paise, weights: readonly (bigint | number)[]): Paise[] {
  if (weights.length === 0) throw new MoneyError('allocate: at least one weight required');

  const w = weights.map((x) => {
    const b = typeof x === 'number' ? BigInt(Math.round(x)) : x;
    if (b < 0n) throw new MoneyError('allocate: weights must be non-negative');
    return b;
  });

  const totalWeight = w.reduce((a, b) => a + b, 0n);

  // Degenerate case: no weight anywhere. Split as evenly as possible rather than dividing by zero.
  if (totalWeight === 0n) {
    const base = amount / BigInt(w.length);
    const parts = w.map(() => base);
    let leftover = amount - base * BigInt(w.length);
    const step = leftover < 0n ? -1n : 1n;
    for (let i = 0; leftover !== 0n; i = (i + 1) % parts.length) {
      parts[i] = parts[i]! + step;
      leftover -= step;
    }
    return parts.map((p) => paise(p));
  }

  const floors: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];

  for (let i = 0; i < w.length; i++) {
    const numerator = amount * w[i]!;
    const q = numerator / totalWeight;
    floors.push(q);
    remainders.push({ index: i, remainder: numerator - q * totalWeight });
  }

  let leftover = amount - floors.reduce((a, b) => a + b, 0n);

  // Hand out the remaining paise to the largest fractional remainders first; ties go to the
  // earlier index so the result is deterministic and reproducible in tests and audits.
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1,
  );

  const step = leftover < 0n ? -1n : 1n;
  for (let i = 0; leftover !== 0n; i++) {
    const target = remainders[i % remainders.length]!;
    floors[target.index] = floors[target.index]! + step;
    leftover -= step;
  }

  return floors.map((p) => paise(p));
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Rendering — the ONLY place money becomes a string
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** `35910n` → `"359.10"`. No symbol, no grouping. For CSV, invoices and API payloads. */
export function toRupeeString(amount: Paise): string {
  const negative = amount < 0n;
  const v = negative ? -amount : amount;
  const whole = v / 100n;
  const frac = (v % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** `35910n` → `"₹359.10"` with Indian digit grouping (₹1,23,456.78). For display. */
export function format(amount: Paise, options: { symbol?: boolean } = {}): string {
  const { symbol = true } = options;
  const negative = amount < 0n;
  const v = negative ? -amount : amount;
  const whole = (v / 100n).toString();
  const frac = (v % 100n).toString().padStart(2, '0');

  // Indian grouping: last 3 digits, then groups of 2 (1,23,45,678)
  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const head = whole.slice(0, -3);
    const tail = whole.slice(-3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
  }

  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${grouped}.${frac}`;
}

/** Serialise for JSON. `bigint` has no native JSON representation, so we emit a number of paise. */
export function toJSON(amount: Paise): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MoneyError(`Amount too large to serialise safely: ${amount}`);
  }
  return Number(amount);
}
