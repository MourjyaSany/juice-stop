import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay webhook signature verification.
 *
 * This function is the entire security boundary of automatic payment confirmation. Everything
 * downstream — releasing an order to the kitchen, marking money received — happens because this
 * returned true, so it gets its own file and its own tests rather than being three lines inside a
 * controller.
 *
 * **Verify the raw bytes, never the parsed body.** `JSON.parse` followed by `JSON.stringify` does
 * not round-trip: key order, unicode escaping and number formatting can all shift, and the
 * signature is over the exact bytes Razorpay sent. A "verified" webhook computed from a re-encoded
 * body is not verified — it is a signature check that passes for the attacker too, because the
 * only thing it proves is that our own serialiser is deterministic. ADR-005 says this; `main.ts`
 * enables `rawBody` for it.
 */

/**
 * Is this payload genuinely from Razorpay?
 *
 * @param rawBody the exact bytes received, before any parsing
 * @param signature the `x-razorpay-signature` header
 * @param secret the webhook secret configured in the Razorpay dashboard
 */
export function verifyRazorpaySignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  // A missing secret must fail closed. The tempting alternative — "skip verification when no
  // secret is configured" — turns a misconfigured deployment into an open endpoint that anybody
  // can use to mark orders paid.
  if (secret === undefined || secret.length === 0) return false;
  if (signature === undefined || signature.length === 0) return false;
  if (rawBody === undefined) return false;

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  if (body.length === 0) return false;

  const expected = createHmac('sha256', secret).update(body).digest('hex');

  // Constant-time, and length-checked first because `timingSafeEqual` throws on a length mismatch
  // rather than returning false.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * The subset of a Razorpay webhook we act on.
 *
 * Deliberately narrow. The full payload is large and mostly irrelevant, and destructuring only
 * what we use means an unexpected shape fails a type guard here rather than throwing somewhere
 * further in.
 */
export interface RazorpayCredit {
  /** Razorpay's own id for the payment. Stored as the reconciliation handle. */
  paymentId: string;
  /** Our order id, round-tripped through the `notes` we set when creating the QR. */
  orderId: string;
  /** Paise. Compared against the order total before anything is released. */
  amountPaise: bigint;
}

/**
 * Pull the fields we need out of a verified payload.
 *
 * Returns null rather than throwing on anything unexpected: a webhook we cannot understand should
 * be acknowledged and ignored, not retried forever because it 500s. Razorpay retries aggressively,
 * and an endpoint that errors on an event it simply does not handle becomes a loop.
 */
export function readCredit(payload: unknown): RazorpayCredit | null {
  if (payload === null || typeof payload !== 'object') return null;
  const event = (payload as { event?: unknown }).event;

  // `qr_code.credited` fires when money lands against a QR we minted; `payment.captured` covers
  // the payment-link and checkout paths. Both carry the payment entity in the same place.
  if (event !== 'qr_code.credited' && event !== 'payment.captured') return null;

  const payment = (
    payload as { payload?: { payment?: { entity?: Record<string, unknown> } } }
  ).payload?.payment?.entity;
  if (payment === undefined) return null;

  const paymentId = payment['id'];
  const amount = payment['amount'];
  const notes = payment['notes'];
  const orderId =
    notes !== null && typeof notes === 'object'
      ? (notes as Record<string, unknown>)['orderId']
      : undefined;

  if (typeof paymentId !== 'string' || typeof orderId !== 'string') return null;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return null;

  return { paymentId, orderId, amountPaise: BigInt(amount) };
}
