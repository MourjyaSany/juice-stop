import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrderingService } from './ordering.service.js';
import { AppConfigService } from '../../core/config/config.service.js';
import { readCredit, verifyRazorpaySignature } from '../payments/razorpay-signature.js';

/**
 * Razorpay's callback — the only thing in this codebase that may mark a prepaid order paid without
 * a human.
 *
 * It lives in `ordering` rather than `payments` because what it *does* is move an order, and the
 * state machine that owns that lives here. `PaymentsModule` is imported by this module, not the
 * other way round, so putting it there would invert the dependency.
 *
 * Four rules, each of which is the difference between this endpoint and an open door:
 *
 * 1. **Verify the raw bytes before parsing.** `main.ts` enables `rawBody` for exactly this. A
 *    signature checked against a re-encoded body proves only that our serialiser is deterministic
 *    (ADR-005).
 * 2. **Answer 200 to everything this handler sees.** Razorpay retries anything else, aggressively.
 *    An event we do not handle, an order that has vanished, an unverified signature — all are
 *    acknowledged and dropped, because a 500 on an unknown event type turns this into a retry loop
 *    that never drains. (A body that is not valid JSON never reaches here at all: Nest's parser
 *    rejects it with a 400 first. That is fine — Razorpay does not send malformed JSON, so the
 *    only thing which can trigger it is a prober, and 400 is the right answer to one.)
 * 3. **Never trust the amount in the payload.** It is compared against what the order actually
 *    costs before anything is released, so a tampered-but-somehow-valid request cannot buy a ₹499
 *    combo for ₹1. That is the same rule the pricing engine follows.
 * 4. **Confirmation is idempotent.** Razorpay delivers at least once and will resend after a
 *    timeout; `confirmPayment` treats an already-paid order as a no-op rather than an error.
 *
 * Unauthenticated by necessity — Razorpay cannot hold a session. The signature *is* the
 * authentication, which is why it fails closed when no secret is configured.
 */
@Controller('webhooks/razorpay')
export class PaymentWebhookController {
  constructor(
    private readonly ordering: OrderingService,
    private readonly config: AppConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ): Promise<{ received: true; applied: boolean }> {
    const verified = verifyRazorpaySignature(
      request.rawBody,
      signature,
      this.config.payments.razorpayWebhookSecret,
    );

    // A forged or unsigned call is acknowledged and ignored. Answering 401 would tell whoever sent
    // it that the endpoint exists and that their signature was the only thing wrong.
    if (!verified) return { received: true, applied: false };

    let payload: unknown;
    try {
      payload = JSON.parse((request.rawBody ?? Buffer.alloc(0)).toString('utf8'));
    } catch {
      return { received: true, applied: false };
    }

    const credit = readCredit(payload);
    if (credit === null) return { received: true, applied: false };

    const applied = await this.ordering.confirmPaymentFromProvider({
      orderId: credit.orderId,
      amountPaise: credit.amountPaise,
      providerRef: credit.paymentId,
      provider: 'razorpay',
    });

    return { received: true, applied };
  }
}
