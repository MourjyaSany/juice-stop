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

export type StoreState = 'OPEN' | 'CLOSED' | 'CLOSING_SOON';

/** ADR-013 capacity bands. */
export type CapacityBand = 'NORMAL' | 'BUSY' | 'PAUSED';

export interface StoreHoursOptions {
  timeZone?: string;
  openHour?: number;
  closeHour?: number;
}

export interface StoreStatus {
  state: StoreState;
  acceptingOrders: boolean;
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
      acceptingOrders: false,
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

  return {
    state: secondsUntilClose <= CLOSING_SOON_MINUTES * 60 ? 'CLOSING_SOON' : 'OPEN',
    acceptingOrders: capacityLoad < 1,
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
