/**
 * The business day.
 *
 * Juice Stop serves 19:00 → ~04:00 IST, crossing midnight. A calendar date is therefore the wrong
 * key for every financial and analytical question: an order at 02:30 on 28 Jul belongs to the
 * night of **27 Jul**.
 *
 * See ADR-010. Postgres holds the authoritative definition as a generated stored column; this
 * module MUST stay identical to it:
 *
 *   ((created_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 hours')::date
 */

export const STORE_TIMEZONE = 'Asia/Kolkata' as const;

/**
 * Hours subtracted before taking the date. Places the cutover at 05:00 IST — one hour past the
 * 04:00 close. If closing time ever moves past 05:00, this constant and the SQL generated column
 * must change together.
 */
export const BUSINESS_DATE_OFFSET_HOURS = 5;

/** `YYYY-MM-DD` — a calendar date with no time and no zone. */
export type BusinessDate = string & { readonly __brand: 'BusinessDate' };

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class BusinessDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessDateError';
  }
}

export function businessDate(value: string): BusinessDate {
  if (!BUSINESS_DATE_PATTERN.test(value)) {
    throw new BusinessDateError(`Invalid business date: "${value}". Expected YYYY-MM-DD.`);
  }
  return value as BusinessDate;
}

/**
 * Wall-clock components of `instant` in a given IANA timezone.
 *
 * Uses `Intl` rather than a fixed +05:30 offset so the logic stays correct if the store ever
 * operates somewhere with DST — and so it is obvious what is being computed.
 */
function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts: Record<string, string> = {};
  for (const { type, value } of formatter.formatToParts(instant)) {
    if (type !== 'literal') parts[type] = value;
  }

  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    second: Number(parts['second']),
  };
}

/** The UTC offset of `timeZone` at `instant`, in minutes (IST → 330). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The business date an instant belongs to.
 *
 *   toBusinessDate(2026-07-27T18:00:00Z)  // 23:30 IST 27 Jul → "2026-07-27"
 *   toBusinessDate(2026-07-27T21:00:00Z)  // 02:30 IST 28 Jul → "2026-07-27"  ← the whole point
 *   toBusinessDate(2026-07-28T01:00:00Z)  // 06:30 IST 28 Jul → "2026-07-28"
 */
export function toBusinessDate(
  instant: Date = new Date(),
  options: { timeZone?: string; offsetHours?: number } = {},
): BusinessDate {
  const { timeZone = STORE_TIMEZONE, offsetHours = BUSINESS_DATE_OFFSET_HOURS } = options;

  if (Number.isNaN(instant.getTime())) throw new BusinessDateError('Invalid date');

  const shifted = new Date(instant.getTime() - offsetHours * 3_600_000);
  const { year, month, day } = zonedParts(shifted, timeZone);

  return businessDate(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

/**
 * The UTC instant range covered by a business date — `[start, end)`.
 *
 * Use for `WHERE created_at >= start AND created_at < end`. Half-open by design: a closed upper
 * bound double-counts the boundary row.
 */
export function businessDateRange(
  date: BusinessDate,
  options: { timeZone?: string; offsetHours?: number } = {},
): { start: Date; end: Date } {
  const { timeZone = STORE_TIMEZONE, offsetHours = BUSINESS_DATE_OFFSET_HOURS } = options;

  const [y, m, d] = date.split('-').map(Number) as [number, number, number];

  // Local midnight of the shifted day, resolved to UTC via the zone's offset at that moment.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = offsetMinutes(new Date(guess), timeZone);
  const localMidnightUtc = guess - offset * 60_000;

  const start = new Date(localMidnightUtc + offsetHours * 3_600_000);
  const end = new Date(start.getTime() + 24 * 3_600_000);

  return { start, end };
}

/** Today's business date. */
export const currentBusinessDate = (
  options: { timeZone?: string; offsetHours?: number } = {},
): BusinessDate => toBusinessDate(new Date(), options);

/** Shift a business date by whole days. `addDays(d, -1)` is "last night". */
export function addDays(date: BusinessDate, days: number): BusinessDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return businessDate(shifted.toISOString().slice(0, 10));
}

/** Inclusive list of business dates from `from` to `to`. */
export function businessDateRangeList(from: BusinessDate, to: BusinessDate): BusinessDate[] {
  if (from > to) throw new BusinessDateError(`Range start ${from} is after end ${to}`);
  const out: BusinessDate[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}
