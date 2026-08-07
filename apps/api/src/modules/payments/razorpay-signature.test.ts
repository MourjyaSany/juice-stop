import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readCredit, verifyRazorpaySignature } from './razorpay-signature.js';

const SECRET = 'whsec_test_abc123';
const sign = (body: string, secret = SECRET): string =>
  createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');

const creditBody = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    event: 'qr_code.credited',
    payload: {
      payment: {
        entity: {
          id: 'pay_ABC123',
          amount: 12_000,
          notes: { orderId: 'ord_live_1' },
          ...overrides,
        },
      },
    },
  });

describe('webhook signature — the entire security boundary of automatic confirmation', () => {
  it('accepts a payload signed with the configured secret', () => {
    const body = creditBody();
    expect(verifyRazorpaySignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('REJECTS a payload signed with a different secret', () => {
    const body = creditBody();
    expect(verifyRazorpaySignature(Buffer.from(body), sign(body, 'wrong'), SECRET)).toBe(false);
  });

  it('REJECTS a payload whose body was altered after signing', () => {
    // The attack this exists to stop: take a real ₹120 webhook and change it to a different order.
    const original = creditBody();
    const signature = sign(original);
    const tampered = original.replace('ord_live_1', 'ord_live_2');
    expect(verifyRazorpaySignature(Buffer.from(tampered), signature, SECRET)).toBe(false);
  });

  it('REJECTS when no secret is configured — fails closed, never open', () => {
    // A misconfigured deployment must not become an endpoint anyone can mark orders paid with.
    const body = creditBody();
    expect(verifyRazorpaySignature(Buffer.from(body), sign(body), undefined)).toBe(false);
    expect(verifyRazorpaySignature(Buffer.from(body), sign(body), '')).toBe(false);
  });

  it('rejects a missing or empty signature header', () => {
    const body = creditBody();
    expect(verifyRazorpaySignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(Buffer.from(body), '', SECRET)).toBe(false);
  });

  it('rejects an empty or absent body', () => {
    expect(verifyRazorpaySignature(Buffer.alloc(0), sign(''), SECRET)).toBe(false);
    expect(verifyRazorpaySignature(undefined, 'abc', SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on mismatched lengths; the length check has to come first.
    const body = creditBody();
    expect(() => verifyRazorpaySignature(Buffer.from(body), 'short', SECRET)).not.toThrow();
    expect(verifyRazorpaySignature(Buffer.from(body), 'short', SECRET)).toBe(false);
  });

  it('accepts a string body identically to the same bytes', () => {
    const body = creditBody();
    expect(verifyRazorpaySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('is sensitive to key order, which is why raw bytes are verified and not a re-encode', () => {
    // Same data, different serialisation. A handler that re-encoded the parsed body before
    // verifying would compute a different digest and reject genuine webhooks — or, worse, be
    // "fixed" by skipping verification.
    const a = JSON.stringify({ event: 'qr_code.credited', id: 1 });
    const b = JSON.stringify({ id: 1, event: 'qr_code.credited' });
    expect(sign(a)).not.toBe(sign(b));
  });
});

describe('reading a credit', () => {
  it('extracts the payment id, our order id and the amount in paise', () => {
    const credit = readCredit(JSON.parse(creditBody()));
    expect(credit).toEqual({
      paymentId: 'pay_ABC123',
      orderId: 'ord_live_1',
      amountPaise: 12_000n,
    });
  });

  it('handles the payment-link path as well as the QR path', () => {
    const body = JSON.parse(creditBody());
    body.event = 'payment.captured';
    expect(readCredit(body)?.orderId).toBe('ord_live_1');
  });

  it('ignores events we do not act on rather than throwing', () => {
    // Razorpay sends many event types and retries anything that errors. An unhandled event has to
    // be acknowledged and dropped, or the endpoint becomes a retry loop.
    const body = JSON.parse(creditBody());
    body.event = 'payment.failed';
    expect(readCredit(body)).toBeNull();
  });

  it('returns null when our order id is missing from notes', () => {
    const body = JSON.parse(creditBody({ notes: {} }));
    expect(readCredit(body)).toBeNull();
  });

  it('returns null on a malformed or non-integer amount', () => {
    expect(readCredit(JSON.parse(creditBody({ amount: 0 })))).toBeNull();
    expect(readCredit(JSON.parse(creditBody({ amount: -100 })))).toBeNull();
    expect(readCredit(JSON.parse(creditBody({ amount: 12.5 })))).toBeNull();
    expect(readCredit(JSON.parse(creditBody({ amount: '12000' })))).toBeNull();
  });

  it('survives junk without throwing', () => {
    for (const junk of [null, undefined, 'string', 42, [], {}, { event: 'qr_code.credited' }]) {
      expect(() => readCredit(junk)).not.toThrow();
      expect(readCredit(junk)).toBeNull();
    }
  });
});
