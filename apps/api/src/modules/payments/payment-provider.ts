import { Money, type Paise } from '@juice-stop/core';

/**
 * The seam between "we need money for this order" and "money arrived".
 *
 * There are exactly two ways to learn that a UPI payment succeeded, and they are different enough
 * that the difference has to reach the customer's screen:
 *
 *   AUTOMATIC — a payment provider owns the collecting VPA and calls us back on a signed webhook.
 *               Confirmation lands in seconds with cryptographic proof behind it.
 *   MANUAL    — we generate the QR against the shop's own UPI ID. Money reaches the bank account
 *               and nothing tells the server, because the UPI deep-link specification has no
 *               callback. A person who can see the money arrive is the only honest confirmation.
 *
 * Both are legitimate. A campus shop with the owner's phone on the counter genuinely confirms in
 * seconds; a gateway costs a KYC signup that a shop may not want on day one. What is *not*
 * legitimate is pretending the second is the first — so `confirmation` is part of the contract and
 * travels all the way to the checkout copy. A customer told "confirming automatically" who then
 * waits for a cook to notice is a customer who stops believing the next status too.
 *
 * Adding a gateway later means implementing this interface and changing `PAYMENT_PROVIDER`. No
 * controller, no order code and no component knows which adapter is in use.
 */

export type ConfirmationMode = 'AUTOMATIC' | 'MANUAL';

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amountPaise: Paise;
  /** Our alphanumeric reference, already derived from the order number. */
  reference: string;
  /**
   * The deadline already recorded against the order, when there is one.
   *
   * Present when re-serving a request the customer is coming back to — a refreshed tab, a phone
   * picked up again. Without it every reload would silently extend the window, and a payment
   * window that renews itself on refresh is not a window.
   */
  expiresAt?: Date;
}

export interface PaymentRequest {
  reference: string;
  /**
   * The `upi://pay` URI. Rendered as a QR, and usable as a deep link when the customer is paying
   * from the same phone they ordered on.
   *
   * Empty string when the provider hosts its own QR image and gives us no URI to build one from —
   * see `qrImageUrl`. The client picks whichever it was handed.
   */
  upiUri: string;
  /**
   * A QR image the provider hosts, when it owns the collecting account rather than us.
   *
   * Razorpay returns a rendered PNG rather than a payable URI, because the VPA behind it is theirs
   * and is minted per request. Null on the direct-UPI path, where we build the code ourselves from
   * the shop's own ID.
   */
  qrImageUrl: string | null;
  /** Decimal rupees, for display beside the QR. Money never crosses this boundary as a float. */
  amountRupees: string;
  amountPaise: string;
  expiresAt: string;
  confirmation: ConfirmationMode;
  /** The provider's own id for this request, when it has one. Null for the direct-UPI path. */
  providerRef: string | null;
}

export interface PaymentProvider {
  /** Stable id, written to `paymentConfirmedBy` so an audit can tell adapters apart. */
  readonly id: string;

  readonly confirmation: ConfirmationMode;

  /**
   * Can this provider take money right now?
   *
   * False disables UPI at checkout rather than throwing at the end of it. A customer who has built
   * a cart and typed an address should learn that UPI is unavailable *before* they choose it, not
   * as an error after they tap pay.
   */
  isAvailable(): boolean;

  createRequest(input: CreatePaymentInput): Promise<PaymentRequest>;
}

/** Shared helper so every adapter presents the amount identically. */
export const amountFields = (amountPaise: Paise): Pick<PaymentRequest, 'amountRupees' | 'amountPaise'> => ({
  amountRupees: Money.toRupeeString(amountPaise),
  amountPaise: amountPaise.toString(),
});

/** DI token. An interface cannot be injected by type in Nest — it does not exist at runtime. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
