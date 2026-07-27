/**
 * Store hours and capacity bands.
 *
 * Service runs 19:00 → 04:00 IST, wrapping midnight — which breaks every naive "is it between
 * open and close?" comparison. Lives in `core` because the storefront, the API and the kitchen
 * dashboard must all reach the same answer; two implementations would eventually disagree, and
 * the disagreement would show up as orders accepted after close.
 */

import { STORE_TIMEZONE, toBusinessDate, type BusinessDate } from './business-date.js';

export const DEFAULT_OPEN_HOUR = 19;
export const DEFAULT_CLOSE_HOUR = 4;
/** Below this many minutes remaining, we surface "last orders". */
export const CLOSING_SOON_MINUTES = 30;

/**
 * How long after closing we keep framing the message as "tonight is over" rather than
 * "we open at 7 PM".
 *
 * Both sit in the same closed gap (04:00 → 19:00), so the distinction is recency, not clock
 * position: at 04:30 the customer was just here and "kitchen's shut for tonight" is the natural
 * reply; by 16:00 the previous night is irrelevant and "opens at 7 PM" is what they need.
 */
export const POST_CLOSE_WINDOW_HOURS = 2;

export type StoreState = 'OPEN' | 'CLOSED' | 'CLOSING_SOON';

/** ADR-013 capacity bands. */
export type CapacityBand = 'NORMAL' | 'BUSY' | 'PAUSED';

/**
 * Why ordering is unavailable, when it is.
 *
 * The UI must say something different for each of these — "we open in 2h 14m" and "kitchen's at
 * capacity, back in ~15 min" are entirely different messages with different calls to action.
 * A single boolean would collapse them into one useless "closed".
 */
export type OrderingBlockedReason =
  | 'BEFORE_OPEN'
  | 'AFTER_CLOSE'
  | 'CAPACITY_PAUSED'
  | null;

export interface StoreHoursOptions {
  timeZone?: string;
  openHour?: number;
  closeHour?: number;
}

export interface StoreStatus {
  state: StoreState;
  /**
   * The menu is browsable 24/7 — always `true`.
   *
   * Deliberately a field rather than an implicit assumption, because the two capabilities are
   * genuinely independent and were previously conflated: a closed shop still wants customers
   * reading the menu, building a cart and pre-ordering. Browsing at 16:00 is how a 19:05 order
   * gets placed, and pre-orders are the cheapest revenue in the business — paid, predictable,
   * and they let the kitchen prep before the 22:30 wall.
   */
  canBrowseMenu: boolean;
  /** Ordering and payment: gated by the service window AND kitchen capacity. */
  acceptingOrders: boolean;
  /** Why ordering is off, when it is. Drives which message the UI shows. */
  orderingBlockedReason: OrderingBlockedReason;
  capacityLoad: number;
  quotedEtaMinutes: number | null;
  secondsUntilOpen: number | null;
  secondsUntilClose: number | null;
  businessDate: BusinessDate;
  localTime: string;
}

/** Wall-clock parts of an instant in the store's timezone. */
export function zonedClock(
  instant: Date,
  timeZone: string = STORE_TIMEZONE,
): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour'), minute: get('minute'), second: get('second') };
}

/**
 * Is the store within its serving window?
 *
 * The window wraps midnight, so the test is a disjunction (`>= open OR < close`), not the
 * conjunction that a same-day window would use. Getting this backwards means the shop appears
 * closed during its entire peak.
 */
export function isWithinServiceWindow(
  instant: Date = new Date(),
  options: StoreHoursOptions = {},
): boolean {
  const {
    timeZone = STORE_TIMEZONE,
    openHour = DEFAULT_OPEN_HOUR,
    closeHour = DEFAULT_CLOSE_HOUR,
  } = options;

  const { hour, minute, second } = zonedClock(instant, timeZone);
  const secondsIntoDay = hour * 3600 + minute * 60 + second;
  const openAt = openHour * 3600;
  const closeAt = closeHour * 3600;

  return openAt > closeAt
    ? secondsIntoDay >= openAt || secondsIntoDay < closeAt // wraps midnight
    : secondsIntoDay >= openAt && secondsIntoDay < closeAt; // same-day window
}

export function getStoreStatus(
  instant: Date = new Date(),
  options: StoreHoursOptions & { capacityLoad?: number } = {},
): StoreStatus {
  const {
    timeZone = STORE_TIMEZONE,
    openHour = DEFAULT_OPEN_HOUR,
    closeHour = DEFAULT_CLOSE_HOUR,
  } = options;

  const { hour, minute, second } = zonedClock(instant, timeZone);
  const secondsIntoDay = hour * 3600 + minute * 60 + second;
  const openAt = openHour * 3600;
  const closeAt = closeHour * 3600;

  const businessDate = toBusinessDate(instant, { timeZone });
  const localTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (!isWithinServiceWindow(instant, options)) {
    const secondsUntilOpen =
      secondsIntoDay < openAt ? openAt - secondsIntoDay : 24 * 3600 - secondsIntoDay + openAt;

    return {
      state: 'CLOSED',
      // Browsing stays open. Only ordering and payment are gated by the clock.
      canBrowseMenu: true,
      acceptingOrders: false,
      orderingBlockedReason:
        secondsIntoDay >= closeAt && secondsIntoDay < closeAt + POST_CLOSE_WINDOW_HOURS * 3600
          ? 'AFTER_CLOSE'
          : 'BEFORE_OPEN',
      capacityLoad: 0,
      quotedEtaMinutes: null,
      secondsUntilOpen,
      secondsUntilClose: null,
      businessDate,
      localTime,
    };
  }

  const secondsUntilClose =
    secondsIntoDay >= openAt ? 24 * 3600 - secondsIntoDay + closeAt : closeAt - secondsIntoDay;

  const capacityLoad = options.capacityLoad ?? estimateCapacityLoad(secondsIntoDay, openHour);
  const capacityPaused = capacityLoad >= 1;

  return {
    state: secondsUntilClose <= CLOSING_SOON_MINUTES * 60 ? 'CLOSING_SOON' : 'OPEN',
    canBrowseMenu: true,
    acceptingOrders: !capacityPaused,
    orderingBlockedReason: capacityPaused ? 'CAPACITY_PAUSED' : null,
    capacityLoad,
    quotedEtaMinutes: quoteEta(capacityLoad),
    secondsUntilOpen: null,
    secondsUntilClose,
    businessDate,
    localTime,
  };
}

/**
 * Placeholder demand curve: quiet at 19:00, a wall around 22:30, peak 23:00–01:00, tailing to
 * close (03-user-flows.md F-10). Replaced in M2 by real `capacity_slots` occupancy.
 */
export function estimateCapacityLoad(secondsIntoDay: number, openHour = DEFAULT_OPEN_HOUR): number {
  const hourOfDay = secondsIntoDay / 3600;
  const nightHour = hourOfDay >= openHour ? hourOfDay : hourOfDay + 24;
  const peak = 23.75;
  const spread = 2.6;
  const load = 0.85 * Math.exp(-(((nightHour - peak) / spread) ** 2)) + 0.08;
  return Math.min(0.99, Math.max(0.05, Number(load.toFixed(2))));
}

/** Honest ETA: rises with kitchen load rather than quoting a flattering constant (ADR-013). */
export function quoteEta(capacityLoad: number): number {
  return 22 + Math.round(capacityLoad * 32);
}

export function capacityBand(load: number, warnThreshold = 0.8): CapacityBand {
  if (load >= 1) return 'PAUSED';
  if (load >= warnThreshold) return 'BUSY';
  return 'NORMAL';
}

export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Customer-facing copy explaining why ordering is unavailable.
 *
 * Lives in `core` so the storefront, the API's `STORE_CLOSED` error and any future notification
 * all say the same thing. Tone rule from 07-design-system.md §8: the *fact* comes first,
 * personality second — and never on an error or a money screen.
 */
export function orderingBlockedMessage(status: StoreStatus): string | null {
  const opensIn = formatCountdown(status.secondsUntilOpen ?? 0);

  switch (status.orderingBlockedReason) {
    case 'BEFORE_OPEN':
      return `Ordering opens at 7 PM — ${opensIn} to go. Browse and build your cart now.`;
    case 'AFTER_CLOSE':
      return `Kitchen's shut for tonight. Ordering reopens at 7 PM, ${opensIn} away.`;
    case 'CAPACITY_PAUSED':
      return "Kitchen's at capacity — not taking new orders for a few minutes.";
    default:
      return null;
  }
}
