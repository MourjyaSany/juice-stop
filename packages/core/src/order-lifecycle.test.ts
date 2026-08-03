import { describe, expect, it } from 'vitest';
import {
  KITCHEN_ACTIVE_STATUSES,
  ORDER_FLOW,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PHASE_ETA_SECONDS,
  TERMINAL_STATUSES,
  UNAMBIGUOUS_ALPHABET,
  collectsCashOnDelivery,
  formatOrderNumber,
  formatPickupToken,
  isFlowStatus,
  isTerminalStatus,
  phaseAnchor,
  phaseUrgency,
  requiresPrepayment,
} from './order-lifecycle.js';

describe('status vocabulary', () => {
  it('keeps the happy path a strict subset of all statuses', () => {
    for (const status of ORDER_FLOW) {
      expect(ORDER_STATUSES).toContain(status);
    }
  });

  it('excludes the exits from the happy path', () => {
    // CANCELLED and REJECTED are exits, not steps. If they leaked into ORDER_FLOW every progress
    // bar and step index in the app would need to special-case them.
    expect(ORDER_FLOW).not.toContain('CANCELLED' as never);
    expect(ORDER_FLOW).not.toContain('REJECTED' as never);
  });

  it('treats exactly the three settled states as terminal', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['CANCELLED', 'DELIVERED', 'REJECTED']);
    expect(isTerminalStatus('DELIVERED')).toBe(true);
    expect(isTerminalStatus('PREPARING')).toBe(false);
    expect(isTerminalStatus('nonsense')).toBe(false);
  });

  it('narrows unknown strings safely', () => {
    expect(isFlowStatus('READY')).toBe(true);
    expect(isFlowStatus('CANCELLED')).toBe(false);
    expect(isFlowStatus('')).toBe(false);
  });

  it('keeps AWAITING_PAYMENT out of the happy path', () => {
    // An entrance, not a step. In ORDER_FLOW it would add a seventh node to every progress bar and
    // shift every step index — including for COD orders, which never pass through it.
    expect(ORDER_STATUSES).toContain('AWAITING_PAYMENT');
    expect(ORDER_FLOW).not.toContain('AWAITING_PAYMENT' as never);
    expect(isFlowStatus('AWAITING_PAYMENT')).toBe(false);
  });

  it('keeps unpaid orders off the kitchen queue', () => {
    // The load-bearing assertion for prepaid orders: an unpaid ticket on the board is free food.
    expect(KITCHEN_ACTIVE_STATUSES).not.toContain('AWAITING_PAYMENT');
  });

  it('does not treat awaiting payment as settled', () => {
    // It is not terminal — payment or expiry still has to move it — so nothing may treat it as done.
    expect(isTerminalStatus('AWAITING_PAYMENT')).toBe(false);
  });
});

describe('payment', () => {
  it('offers exactly the two methods the shop accepts', () => {
    expect([...PAYMENT_METHODS]).toEqual(['UPI', 'COD']);
  });

  it('has dropped the methods that were never connected to a gateway', () => {
    for (const gone of ['CARD', 'NETBANKING', 'WALLET']) {
      expect(PAYMENT_METHODS).not.toContain(gone as never);
    }
  });

  it('gates the kitchen on UPI but not on cash', () => {
    expect(requiresPrepayment('UPI')).toBe(true);
    expect(requiresPrepayment('COD')).toBe(false);
  });

  it('knows when the rider still has money to collect', () => {
    expect(collectsCashOnDelivery('COD', 'PENDING')).toBe(true);
    expect(collectsCashOnDelivery('COD', 'PAID')).toBe(false);
    // A prepaid order must never prompt for cash, whatever its payment status says.
    expect(collectsCashOnDelivery('UPI', 'PENDING')).toBe(false);
    expect(collectsCashOnDelivery('UPI', 'PAID')).toBe(false);
  });

  it('distinguishes an abandoned payment from a failed one', () => {
    // Both end the order; only one is worth following up with the customer about.
    expect(PAYMENT_STATUSES).toContain('EXPIRED');
    expect(PAYMENT_STATUSES).toContain('FAILED');
    expect(PAYMENT_STATUSES).toContain('PENDING');
    expect(PAYMENT_STATUSES).toContain('PAID');
  });
});

describe('phase timing', () => {
  it('quotes the agreed allowance for every phase', () => {
    expect(PHASE_ETA_SECONDS.PLACED).toBe(50 * 60);
    expect(PHASE_ETA_SECONDS.ACCEPTED).toBe(50 * 60);
    expect(PHASE_ETA_SECONDS.PREPARING).toBe(40 * 60);
    expect(PHASE_ETA_SECONDS.READY).toBe(25 * 60);
    expect(PHASE_ETA_SECONDS.OUT_FOR_DELIVERY).toBe(15 * 60);
  });

  it('anchors the early phases to placement, not to the transition', () => {
    const placed = 1_000_000;
    const accepted = placed + 5 * 60_000;

    // Accepting is an acknowledgement, not progress. Anchoring it to the transition would hand the
    // customer back the five minutes they had already waited — the timer would visibly go up.
    expect(phaseAnchor('PLACED', placed, accepted)).toBe(placed);
    expect(phaseAnchor('ACCEPTED', placed, accepted)).toBe(placed);
  });

  it('anchors the working phases to their own transition', () => {
    const placed = 1_000_000;
    const changed = placed + 8 * 60_000;
    for (const status of ['PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const) {
      expect(phaseAnchor(status, placed, changed)).toBe(changed);
    }
  });

  it('counts down from the full allowance at the instant a phase begins', () => {
    const placed = 0;
    const changed = 8 * 60_000;
    const { secondsRemaining } = phaseUrgency('PREPARING', placed, changed, changed);
    expect(secondsRemaining).toBe(40 * 60);
  });

  it('does not restart the clock when an order is accepted', () => {
    const placed = 0;
    const fiveMinutesIn = 5 * 60_000;
    const before = phaseUrgency('PLACED', placed, placed, fiveMinutesIn);
    const after = phaseUrgency('ACCEPTED', placed, fiveMinutesIn, fiveMinutesIn);
    expect(after.secondsRemaining).toBe(before.secondsRemaining);
    expect(after.secondsRemaining).toBe(45 * 60);
  });

  it('clamps at zero rather than going negative', () => {
    const changed = 0;
    const wayOverdue = 60 * 60_000;
    const { secondsRemaining, level } = phaseUrgency('OUT_FOR_DELIVERY', 0, changed, wayOverdue);
    expect(secondsRemaining).toBe(0);
    expect(level).toBe('late');
  });

  it('escalates through every band in order', () => {
    const allowanceMs = PHASE_ETA_SECONDS.PREPARING * 1000;
    const at = (fraction: number) => phaseUrgency('PREPARING', 0, 0, allowanceMs * fraction).level;

    expect(at(0)).toBe('calm');
    expect(at(0.54)).toBe('calm');
    expect(at(0.55)).toBe('watch');
    expect(at(0.79)).toBe('watch');
    expect(at(0.8)).toBe('pressing');
    expect(at(0.99)).toBe('pressing');
    expect(at(1)).toBe('late');
    expect(at(2)).toBe('late');
  });

  it('never reports a delivered order as late', () => {
    const { level, secondsRemaining } = phaseUrgency('DELIVERED', 0, 0, 10 * 60 * 60_000);
    expect(level).toBe('calm');
    expect(secondsRemaining).toBe(0);
  });

  it('grades kitchen and customer identically for the same order', () => {
    // The whole reason this lives in core: staff and customer disagreeing about whether food is
    // late is worse than either answer on its own.
    const placed = 0;
    const changed = 10 * 60_000;
    const now = changed + 30 * 60_000;
    const a = phaseUrgency('PREPARING', placed, changed, now);
    const b = phaseUrgency('PREPARING', placed, changed, now);
    expect(a).toEqual(b);
  });
});

describe('human-read codes', () => {
  it('excludes every character that is ambiguous when read aloud', () => {
    for (const char of ['I', 'O', '0', '1', 'S', '5']) {
      expect(UNAMBIGUOUS_ALPHABET).not.toContain(char);
    }
  });

  it('formats a pickup token from the supplied randomness', () => {
    // Fixed source, so the assertion is about formatting rather than luck.
    const token = formatPickupToken(() => 0);
    expect(token).toBe('JS-2222');
  });

  it('only ever emits alphabet characters, across the whole random range', () => {
    const samples = [0, 0.13, 0.37, 0.5, 0.74, 0.999999];
    for (const value of samples) {
      const token = formatPickupToken(() => value);
      for (const char of token.slice(3)) {
        expect(UNAMBIGUOUS_ALPHABET).toContain(char);
      }
    }
  });

  it('never indexes past the end of the alphabet', () => {
    // Math.floor(0.999999 * length) must stay in range, or the token contains "undefined".
    expect(formatPickupToken(() => 0.999999)).not.toContain('undefined');
  });

  it('formats an order number as JS-DDMMYY-NNNN', () => {
    expect(formatOrderNumber(new Date(2026, 7, 2), 4417)).toBe('JS-020826-4417');
  });

  it('zero-pads single-digit days and months', () => {
    expect(formatOrderNumber(new Date(2026, 0, 5), 1234)).toBe('JS-050126-1234');
  });
});
