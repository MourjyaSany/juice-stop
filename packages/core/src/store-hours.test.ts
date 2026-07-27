import { describe, expect, it } from 'vitest';
import {
  capacityBand,
  formatCountdown,
  getStoreStatus,
  isWithinServiceWindow,
  orderingBlockedMessage,
  quoteEta,
} from './store-hours.js';

/** IST is UTC+05:30. Helper: build the UTC instant for a given IST wall-clock time. */
const atIst = (dayUtc: string, istHour: number, istMinute = 0): Date => {
  const utcMinutes = istHour * 60 + istMinute - 330;
  const base = new Date(`${dayUtc}T00:00:00Z`);
  return new Date(base.getTime() + utcMinutes * 60_000);
};

describe('isWithinServiceWindow() — the midnight wrap', () => {
  it.each([
    [18, 30, false, 'before opening'],
    [18, 59, false, 'one minute before opening'],
    [19, 0, true, 'exactly at opening'],
    [21, 0, true, 'evening'],
    [23, 59, true, 'just before midnight'],
    [0, 30, true, 'after midnight — still trading'],
    [2, 30, true, 'peak late night'],
    [3, 59, true, 'final minute'],
    [4, 0, false, 'exactly at close'],
    [12, 0, false, 'midday'],
  ])('%s:%s IST → %s (%s)', (hour, minute, expected) => {
    expect(isWithinServiceWindow(atIst('2026-07-27', hour, minute))).toBe(expected);
  });

  it('would be inverted by a naive same-day comparison — the bug this guards', () => {
    // A naive `hour >= 19 && hour < 4` is never true. Every one of these is real trading time.
    for (const hour of [20, 22, 0, 1, 2, 3]) {
      expect(isWithinServiceWindow(atIst('2026-07-27', hour))).toBe(true);
    }
  });
});

describe('getStoreStatus()', () => {
  it('reports CLOSED with an accurate countdown before opening', () => {
    const status = getStoreStatus(atIst('2026-07-27', 17, 0));
    expect(status.state).toBe('CLOSED');
    expect(status.acceptingOrders).toBe(false);
    expect(status.quotedEtaMinutes).toBeNull();
    expect(status.secondsUntilOpen).toBe(2 * 3600); // 17:00 → 19:00
    expect(status.localTime).toBe('17:00');
  });

  it('counts down correctly from the small hours after close', () => {
    // 05:00 IST → opens again at 19:00 the same day, 14 hours away.
    const status = getStoreStatus(atIst('2026-07-28', 5, 0));
    expect(status.state).toBe('CLOSED');
    expect(status.secondsUntilOpen).toBe(14 * 3600);
  });

  it('reports OPEN during service with an honest ETA', () => {
    const status = getStoreStatus(atIst('2026-07-27', 21, 0));
    expect(status.state).toBe('OPEN');
    expect(status.acceptingOrders).toBe(true);
    expect(status.quotedEtaMinutes).toBeGreaterThan(0);
    expect(status.secondsUntilClose).toBe(7 * 3600); // 21:00 → 04:00
  });

  it('keeps the business date on the previous day after midnight', () => {
    const status = getStoreStatus(atIst('2026-07-28', 2, 30));
    expect(status.state).toBe('OPEN');
    expect(status.businessDate).toBe('2026-07-27'); // the night of the 27th
  });

  it('flips to CLOSING_SOON in the last 30 minutes', () => {
    expect(getStoreStatus(atIst('2026-07-28', 3, 45)).state).toBe('CLOSING_SOON');
    expect(getStoreStatus(atIst('2026-07-28', 3, 20)).state).toBe('OPEN');
  });

  it('stops accepting orders at 100% capacity (ADR-013)', () => {
    const busy = getStoreStatus(atIst('2026-07-27', 23, 30), { capacityLoad: 0.85 });
    expect(busy.acceptingOrders).toBe(true);

    const full = getStoreStatus(atIst('2026-07-27', 23, 30), { capacityLoad: 1 });
    expect(full.acceptingOrders).toBe(false);
  });

  it('quotes a longer ETA as the kitchen fills — never a flattering constant', () => {
    const quiet = getStoreStatus(atIst('2026-07-27', 23, 30), { capacityLoad: 0.1 });
    const slammed = getStoreStatus(atIst('2026-07-27', 23, 30), { capacityLoad: 0.95 });
    expect(slammed.quotedEtaMinutes!).toBeGreaterThan(quiet.quotedEtaMinutes!);
  });
});

describe('browsing is always open; only ordering is gated', () => {
  it.each([
    [10, 0, 'mid-morning'],
    [16, 30, 'late afternoon'],
    [18, 59, 'one minute before opening'],
    [21, 0, 'mid-service'],
    [2, 30, 'peak late night'],
    [5, 0, 'after close'],
  ])('%s:%s IST (%s) — menu browsable', (hour, minute) => {
    expect(getStoreStatus(atIst('2026-07-27', hour, minute)).canBrowseMenu).toBe(true);
  });

  it('separates browsing from ordering before opening', () => {
    const status = getStoreStatus(atIst('2026-07-27', 16, 0));
    expect(status.canBrowseMenu).toBe(true);
    expect(status.acceptingOrders).toBe(false);
    expect(status.orderingBlockedReason).toBe('BEFORE_OPEN');
  });

  it('distinguishes "just closed" from "opens later" — recency, not clock position', () => {
    // Both sit in the same closed gap (04:00 → 19:00); only the framing differs.
    expect(getStoreStatus(atIst('2026-07-28', 4, 15)).orderingBlockedReason).toBe('AFTER_CLOSE');
    expect(getStoreStatus(atIst('2026-07-28', 5, 30)).orderingBlockedReason).toBe('AFTER_CLOSE');
    expect(getStoreStatus(atIst('2026-07-28', 6, 30)).orderingBlockedReason).toBe('BEFORE_OPEN');
    expect(getStoreStatus(atIst('2026-07-27', 16, 0)).orderingBlockedReason).toBe('BEFORE_OPEN');
  });

  it('reports CAPACITY_PAUSED during service, not a clock reason', () => {
    const status = getStoreStatus(atIst('2026-07-27', 23, 30), { capacityLoad: 1 });
    expect(status.canBrowseMenu).toBe(true);
    expect(status.acceptingOrders).toBe(false);
    expect(status.orderingBlockedReason).toBe('CAPACITY_PAUSED');
  });

  it('clears the block reason when ordering is live', () => {
    const status = getStoreStatus(atIst('2026-07-27', 21, 0));
    expect(status.acceptingOrders).toBe(true);
    expect(status.orderingBlockedReason).toBeNull();
    expect(orderingBlockedMessage(status)).toBeNull();
  });

  it('produces a distinct message per reason', () => {
    const before = orderingBlockedMessage(getStoreStatus(atIst('2026-07-27', 16, 0)));
    const after = orderingBlockedMessage(getStoreStatus(atIst('2026-07-28', 4, 30)));
    const paused = orderingBlockedMessage(
      getStoreStatus(atIst('2026-07-27', 23, 30), { capacityLoad: 1 }),
    );

    expect(before).toMatch(/opens at 7 PM/);
    expect(before).toMatch(/3h 0m/); // 16:00 → 19:00
    expect(after).toMatch(/reopens at 7 PM/);
    expect(paused).toMatch(/capacity/i);
    expect(new Set([before, after, paused]).size).toBe(3);
  });
});

describe('capacityBand() — ADR-013 thresholds as approved', () => {
  it.each([
    [0.0, 'NORMAL'],
    [0.79, 'NORMAL'],
    [0.8, 'BUSY'], // warn at 80%, not 90%
    [0.99, 'BUSY'], // queue with rising ETAs between 80% and 100%
    [1.0, 'PAUSED'], // intake stops
  ])('load %s → %s', (load, expected) => {
    expect(capacityBand(load)).toBe(expected);
  });
});

describe('helpers', () => {
  it('formats countdowns readably', () => {
    expect(formatCountdown(2 * 3600 + 14 * 60)).toBe('2h 14m');
    expect(formatCountdown(45 * 60)).toBe('45m');
    expect(formatCountdown(0)).toBe('0m');
  });

  it('quotes ETAs monotonically in load', () => {
    expect(quoteEta(0)).toBeLessThan(quoteEta(0.5));
    expect(quoteEta(0.5)).toBeLessThan(quoteEta(1));
  });
});
