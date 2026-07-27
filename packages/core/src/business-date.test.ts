import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessDate,
  businessDateRange,
  businessDateRangeList,
  BusinessDateError,
  toBusinessDate,
} from './business-date.js';

/** IST is UTC+05:30. 23:30 IST on 27 Jul === 18:00 UTC on 27 Jul. */
const ist = (iso: string) => new Date(iso);

describe('toBusinessDate() — the midnight-crossing rule', () => {
  it.each([
    ['2026-07-27T13:35:00Z', '19:05 IST 27 Jul — service opens', '2026-07-27'],
    ['2026-07-27T18:00:00Z', '23:30 IST 27 Jul — peak', '2026-07-27'],
    ['2026-07-27T18:29:00Z', '23:59 IST 27 Jul — just before midnight', '2026-07-27'],
    ['2026-07-27T18:31:00Z', '00:01 IST 28 Jul — just after midnight', '2026-07-27'],
    ['2026-07-27T21:00:00Z', '02:30 IST 28 Jul — late night', '2026-07-27'],
    ['2026-07-27T22:25:00Z', '03:55 IST 28 Jul — last orders', '2026-07-27'],
    ['2026-07-27T23:29:00Z', '04:59 IST 28 Jul — final minute of the night', '2026-07-27'],
    ['2026-07-27T23:30:00Z', '05:00 IST 28 Jul — cutover, new business day', '2026-07-28'],
    ['2026-07-28T01:00:00Z', '06:30 IST 28 Jul — next morning', '2026-07-28'],
  ])('%s (%s) → %s', (iso, _label, expected) => {
    expect(toBusinessDate(ist(iso))).toBe(expected);
  });

  it('differs from the naive calendar date after midnight — the bug this exists to prevent', () => {
    const afterMidnight = ist('2026-07-27T21:00:00Z'); // 02:30 IST on 28 Jul

    // The naive answer, in IST, would be the 28th...
    const naive = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
      afterMidnight,
    );
    expect(naive).toBe('2026-07-28');

    // ...but the takings belong to the night of the 27th.
    expect(toBusinessDate(afterMidnight)).toBe('2026-07-27');
  });

  it('rejects invalid dates', () => {
    expect(() => toBusinessDate(new Date('nonsense'))).toThrow(BusinessDateError);
  });
});

describe('businessDateRange()', () => {
  it('covers 05:00 IST to 05:00 IST, half-open', () => {
    const { start, end } = businessDateRange(businessDate('2026-07-27'));

    // 05:00 IST on 27 Jul === 23:30 UTC on 26 Jul
    expect(start.toISOString()).toBe('2026-07-26T23:30:00.000Z');
    expect(end.toISOString()).toBe('2026-07-27T23:30:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000);
  });

  it('contains the whole service window and nothing from the next night', () => {
    const { start, end } = businessDateRange(businessDate('2026-07-27'));

    const open = ist('2026-07-27T13:30:00Z'); // 19:00 IST 27 Jul
    const close = ist('2026-07-27T22:30:00Z'); // 04:00 IST 28 Jul
    const nextNight = ist('2026-07-28T13:30:00Z'); // 19:00 IST 28 Jul

    expect(open >= start && open < end).toBe(true);
    expect(close >= start && close < end).toBe(true);
    expect(nextNight >= end).toBe(true);
  });

  it('is consistent with toBusinessDate for random instants', () => {
    const base = Date.UTC(2026, 6, 27, 0, 0, 0);
    for (let i = 0; i < 500; i++) {
      const instant = new Date(base + Math.floor(Math.random() * 5 * 86_400_000));
      const bd = toBusinessDate(instant);
      const { start, end } = businessDateRange(bd);
      expect(instant >= start && instant < end).toBe(true);
    }
  });
});

describe('date helpers', () => {
  it('shifts by whole days across month boundaries', () => {
    expect(addDays(businessDate('2026-07-31'), 1)).toBe('2026-08-01');
    expect(addDays(businessDate('2026-08-01'), -1)).toBe('2026-07-31');
    expect(addDays(businessDate('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('lists inclusive ranges', () => {
    expect(businessDateRangeList(businessDate('2026-07-27'), businessDate('2026-07-30'))).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
    ]);
  });

  it('rejects a reversed range', () => {
    expect(() =>
      businessDateRangeList(businessDate('2026-07-30'), businessDate('2026-07-27')),
    ).toThrow(BusinessDateError);
  });

  it('validates format', () => {
    expect(() => businessDate('27-07-2026')).toThrow(BusinessDateError);
    expect(() => businessDate('2026-7-27')).toThrow(BusinessDateError);
  });
});
