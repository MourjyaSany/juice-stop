import { describe, expect, it } from 'vitest';
import { paise } from './money.js';
import { buildUpiUri, isValidVpa, paymentReferenceFor, UpiError } from './upi.js';

const base = {
  payeeVpa: 'juicestop@okhdfcbank',
  payeeName: 'Juice Stop',
  amountPaise: paise(35_910),
  transactionRef: 'JS0308264417',
};

const paramsOf = (uri: string): URLSearchParams =>
  new URLSearchParams(uri.slice(uri.indexOf('?') + 1));

describe('VPA validation', () => {
  it('accepts the handles customers actually use', () => {
    for (const vpa of [
      'juicestop@okhdfcbank',
      'mourjya.sany@oksbi',
      '9876543210@paytm',
      'shop-1@ybl',
      'a_b@upi',
    ]) {
      expect(isValidVpa(vpa)).toBe(true);
    }
  });

  it('rejects the mistakes that actually happen', () => {
    // A bare phone number is the common paste error — it looks like a UPI ID to a human.
    expect(isValidVpa('9876543210')).toBe(false);
    expect(isValidVpa('juicestop')).toBe(false);
    expect(isValidVpa('juice stop@okhdfcbank')).toBe(false);
    expect(isValidVpa('@okhdfcbank')).toBe(false);
    expect(isValidVpa('juicestop@')).toBe(false);
    expect(isValidVpa('')).toBe(false);
  });

  it('tolerates surrounding whitespace, because pasted values carry it', () => {
    expect(isValidVpa('  juicestop@okhdfcbank  ')).toBe(true);
  });
});

describe('buildUpiUri', () => {
  it('emits the scheme every Indian payment app registers', () => {
    expect(buildUpiUri(base).startsWith('upi://pay?')).toBe(true);
  });

  it('carries payee, amount and currency', () => {
    const params = paramsOf(buildUpiUri(base));
    expect(params.get('pa')).toBe('juicestop@okhdfcbank');
    expect(params.get('pn')).toBe('Juice Stop');
    expect(params.get('cu')).toBe('INR');
    expect(params.get('tr')).toBe('JS0308264417');
  });

  it('formats the amount as rupees with exactly two decimals', () => {
    // The single most important assertion here. An app asked for "359.1" or "1,359.10" either
    // rejects the request or charges the wrong number.
    expect(paramsOf(buildUpiUri(base)).get('am')).toBe('359.10');
  });

  it('never groups digits, however large the bill', () => {
    const uri = buildUpiUri({ ...base, amountPaise: paise(1_234_567) });
    expect(paramsOf(uri).get('am')).toBe('12345.67');
    expect(uri).not.toContain(',');
  });

  it('renders whole rupees with a trailing .00 rather than bare', () => {
    expect(paramsOf(buildUpiUri({ ...base, amountPaise: paise(20_000) })).get('am')).toBe('200.00');
  });

  it('includes the note only when there is one', () => {
    expect(paramsOf(buildUpiUri(base)).has('tn')).toBe(false);
    expect(paramsOf(buildUpiUri({ ...base, note: 'Order JS-030826-4417' })).get('tn')).toBe(
      'Order JS-030826-4417',
    );
    expect(paramsOf(buildUpiUri({ ...base, note: '   ' })).has('tn')).toBe(false);
  });

  it('percent-encodes spaces rather than using +', () => {
    // URLSearchParams would emit "+", which some older payment apps render literally in the note.
    const uri = buildUpiUri({ ...base, payeeName: 'Juice Stop Kattankulathur' });
    expect(uri).toContain('pn=Juice%20Stop%20Kattankulathur');
    expect(uri).not.toContain('+');
  });

  it('refuses an invalid payee rather than producing an unpayable QR', () => {
    expect(() => buildUpiUri({ ...base, payeeVpa: '9876543210' })).toThrow(UpiError);
    expect(() => buildUpiUri({ ...base, payeeName: '  ' })).toThrow(UpiError);
  });

  it('refuses a non-positive amount', () => {
    expect(() => buildUpiUri({ ...base, amountPaise: paise(0) })).toThrow(UpiError);
    expect(() => buildUpiUri({ ...base, amountPaise: paise(-100) })).toThrow(UpiError);
  });

  it('refuses a reference the specification would truncate', () => {
    expect(() => buildUpiUri({ ...base, transactionRef: 'JS-0308-4417' })).toThrow(UpiError);
    expect(() => buildUpiUri({ ...base, transactionRef: 'a'.repeat(36) })).toThrow(UpiError);
    expect(() => buildUpiUri({ ...base, transactionRef: '' })).toThrow(UpiError);
  });
});

describe('paymentReferenceFor', () => {
  it('strips the punctuation the UPI spec forbids', () => {
    expect(paymentReferenceFor('JS-030826-4417')).toBe('JS0308264417');
  });

  it('stays recognisable beside the order number on a bank statement', () => {
    // The whole point when confirmation is manual: a human matches this against a list of orders.
    const ref = paymentReferenceFor('JS-030826-4417');
    expect(ref).toContain('030826');
    expect(ref).toContain('4417');
  });

  it('caps at the 35 characters the specification allows', () => {
    expect(paymentReferenceFor('JS-'.repeat(40)).length).toBeLessThanOrEqual(35);
  });

  it('round-trips into a valid URI', () => {
    const uri = buildUpiUri({ ...base, transactionRef: paymentReferenceFor('JS-030826-4417') });
    expect(paramsOf(uri).get('tr')).toBe('JS0308264417');
  });
});
