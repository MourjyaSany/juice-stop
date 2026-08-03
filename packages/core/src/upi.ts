/**
 * UPI payment requests.
 *
 * Builds the `upi://pay?…` URI that every Indian payment app understands. Rendered as a QR on the
 * customer's screen, or opened directly as a deep link when they are already paying from the phone
 * the order was placed on.
 *
 * **What this does and does not give you.** The URI carries the payee, the exact amount and a
 * reference, and a compliant app will lock the amount so the customer cannot edit it. What it
 * carries in the other direction is nothing: the UPI deep-link specification has **no callback**.
 * Money reaches the payee's bank account and the server that generated this string is never told.
 *
 * That is a property of UPI itself, not a gap in this module, and it is the reason confirmation is
 * a separate concern with its own port on the API side. A payment provider (Razorpay, Cashfree,
 * PhonePe PG) solves it by owning the collecting VPA and firing a signed webhook; without one, the
 * only honest confirmation is a human who can see the money arrive. Anything that claims otherwise
 * — parsing bank SMS, scraping notifications — is guessing about money, and guessing about money
 * is how a shop hands out free food.
 *
 * Lives in `core` because it is pure string construction over a Paise amount, it needs the same
 * money rules as everything else, and it is worth testing properly.
 */

import { toRupeeString, type Paise } from './money.js';

export class UpiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpiError';
  }
}

/**
 * A Virtual Payment Address — `name@bank`.
 *
 * Validated loosely on purpose. The handle space is controlled by NPCI and grows constantly, so a
 * strict allowlist of banks would reject a perfectly good VPA the week a new PSP launches. This
 * catches the mistakes that actually happen — a phone number pasted in, a missing handle, a stray
 * space — and leaves the rest to the payment app, which is the only thing that can truly resolve it.
 */
const VPA_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/;

export const isValidVpa = (vpa: string): boolean => VPA_PATTERN.test(vpa.trim());

export interface UpiPaymentRequest {
  /** The shop's VPA — where the money goes. */
  payeeVpa: string;
  /** Shown to the customer inside their payment app, so they know who they are paying. */
  payeeName: string;
  amountPaise: Paise;
  /**
   * Our own reference for this payment, echoed by some apps into the transaction record.
   *
   * Alphanumeric and capped at 35 characters because that is what the specification allows; longer
   * references are silently truncated by some apps, which turns a reconciliation key into a
   * near-miss that is worse than having none.
   */
  transactionRef: string;
  /** Free text shown on the payment screen, e.g. the order number. */
  note?: string;
}

const MAX_REF_LENGTH = 35;
const REF_PATTERN = /^[a-zA-Z0-9]{1,35}$/;

/**
 * Build the `upi://pay` URI.
 *
 * Parameter names are fixed by the UPI specification and are not free to rename:
 *   `pa` payee address · `pn` payee name · `am` amount · `cu` currency · `tr` reference · `tn` note
 *
 * The amount is emitted through `toRupeeString`, the same formatter invoices and CSV exports use,
 * so the figure in the QR is derived from the same paise the order was priced in. Formatting it
 * any other way — a float, a locale-aware string with grouping — is how a customer ends up being
 * asked for ₹1,359.10 or ₹359.1.
 */
export function buildUpiUri(request: UpiPaymentRequest): string {
  const payeeVpa = request.payeeVpa.trim();
  const payeeName = request.payeeName.trim();

  if (!isValidVpa(payeeVpa)) {
    throw new UpiError(`Not a valid UPI ID: "${request.payeeVpa}". Expected something like shop@bank.`);
  }
  if (payeeName.length === 0) {
    throw new UpiError('A payee name is required — the customer must see who they are paying.');
  }
  if (request.amountPaise <= 0n) {
    throw new UpiError('A UPI request must be for a positive amount.');
  }
  if (!REF_PATTERN.test(request.transactionRef)) {
    throw new UpiError(
      `Transaction reference must be 1–${MAX_REF_LENGTH} alphanumeric characters, got "${request.transactionRef}".`,
    );
  }

  // Built as ordered pairs rather than a URLSearchParams so the parameter order is stable and
  // readable in logs. URLSearchParams also encodes spaces as "+", which some older payment apps
  // render literally in the note field.
  const params: Array<[string, string]> = [
    ['pa', payeeVpa],
    ['pn', payeeName],
    ['am', toRupeeString(request.amountPaise)],
    ['cu', 'INR'],
    ['tr', request.transactionRef],
  ];

  const note = request.note?.trim();
  if (note !== undefined && note.length > 0) params.push(['tn', note]);

  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `upi://pay?${query}`;
}

/**
 * A payment reference derived from an order.
 *
 * Alphanumeric only, because the specification forbids anything else and the order number carries
 * hyphens (`JS-030826-4417`). Stripping them keeps the reference recognisable to a human reading a
 * bank statement next to an order list, which is the entire job it has to do when confirmation is
 * manual.
 */
export function paymentReferenceFor(orderNumber: string): string {
  const cleaned = orderNumber.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.slice(0, MAX_REF_LENGTH);
}
