import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PAYMENT_WINDOW_MS } from '@juice-stop/core';
import { AppConfigService } from '../../core/config/config.service.js';
import {
  amountFields,
  type CreatePaymentInput,
  type PaymentProvider,
  type PaymentRequest,
} from './payment-provider.js';

/**
 * UPI through Razorpay, with automatic confirmation.
 *
 * The sibling of `DirectUpiProvider`, and the reason that one carries a `MANUAL` confirmation flag.
 * Razorpay owns the collecting VPA, so when money lands it can tell us — a signed webhook naming
 * the exact order. That closes the three things the direct path cannot:
 *
 *   · **Nobody has to assert that money arrived.** The direct path trusts a staff tap; this is
 *     cryptographic proof tied to one order.
 *   · **No amount-matching by eye.** Two ₹120 orders a minute apart are unambiguous here, where a
 *     cook reading "₹120 received" off a notification is guessing.
 *   · **Screenshots prove nothing.** There is nothing to show a cook, because no cook is asked.
 *
 * Costs nothing per transaction: UPI carries zero MDR by Indian regulation, so a gateway cannot
 * charge a percentage on it. What it costs is a merchant account and KYC.
 *
 * **No SDK.** Razorpay's REST API is Basic auth and JSON; adding a dependency to a money path to
 * save writing two fetch calls is a poor trade, and the same reasoning kept scrypt over argon2 in
 * `password.ts`.
 */

const API = 'https://api.razorpay.com/v1';

/** Long enough to survive a slow network, short enough not to hold a checkout open. */
const REQUEST_TIMEOUT_MS = 12_000;

interface QrCodeResponse {
  id: string;
  image_url: string;
  close_by?: number;
}

@Injectable()
export class RazorpayProvider implements PaymentProvider, OnModuleInit {
  readonly id = 'razorpay';
  readonly confirmation = 'AUTOMATIC' as const;

  private readonly logger = new Logger(RazorpayProvider.name);

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    if (!this.isAvailable()) {
      this.logger.warn(
        'Razorpay is selected but its credentials are incomplete — UPI is disabled and checkout ' +
          'will offer cash only. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and ' +
          'RAZORPAY_WEBHOOK_SECRET.',
      );
      return;
    }
    const live = this.config.payments.razorpayKeyId?.startsWith('rzp_live_') === true;
    this.logger.log(
      `UPI enabled via Razorpay (${live ? 'LIVE' : 'test'} keys) · confirmation is AUTOMATIC ` +
        'via signed webhook',
    );
  }

  /**
   * All three credentials, or nothing.
   *
   * The webhook secret is included deliberately: without it we could take money and never learn
   * that we had, which is worse than not offering UPI at all — the customer pays and the kitchen
   * never sees the order.
   */
  isAvailable(): boolean {
    const { razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret } = this.config.payments;
    return (
      razorpayKeyId !== undefined &&
      razorpayKeySecret !== undefined &&
      razorpayWebhookSecret !== undefined
    );
  }

  async createRequest(input: CreatePaymentInput): Promise<PaymentRequest> {
    const { razorpayKeyId, razorpayKeySecret } = this.config.payments;
    if (razorpayKeyId === undefined || razorpayKeySecret === undefined) {
      throw new Error('Razorpay is not configured.');
    }

    const expiresAt = input.expiresAt ?? new Date(Date.now() + PAYMENT_WINDOW_MS);

    const body = new URLSearchParams({
      type: 'upi_qr',
      name: `Juice Stop ${input.orderNumber}`,
      usage: 'single_use',
      // Locks the amount. A customer cannot underpay by editing the figure, which is the property
      // the direct-UPI QR relies on the payment app to enforce and this one enforces at source.
      fixed_amount: 'true',
      payment_amount: input.amountPaise.toString(),
      description: `Order ${input.orderNumber}`,
      // Razorpay speaks seconds since epoch. The QR closes itself, so an abandoned checkout cannot
      // be paid for an hour later against an order that has already lapsed on our side.
      close_by: String(Math.floor(expiresAt.getTime() / 1000)),
      // `notes` round-trip to the webhook untouched. This is how a credit names an order — without
      // it we would be back to matching on amount, which is the failure mode this adapter exists
      // to remove.
      'notes[orderId]': input.orderId,
      'notes[reference]': input.reference,
    });

    const response = await this.post<QrCodeResponse>('/payments/qr_codes', body, {
      razorpayKeyId,
      razorpayKeySecret,
    });

    return {
      reference: input.reference,
      // Razorpay hosts the image; there is no payable URI to hand back, because the VPA behind the
      // code is theirs and minted per request.
      upiUri: '',
      qrImageUrl: response.image_url,
      ...amountFields(input.amountPaise),
      expiresAt: expiresAt.toISOString(),
      confirmation: this.confirmation,
      providerRef: response.id,
    };
  }

  private async post<T>(
    path: string,
    body: URLSearchParams,
    creds: { razorpayKeyId: string; razorpayKeySecret: string },
  ): Promise<T> {
    const auth = Buffer.from(`${creds.razorpayKeyId}:${creds.razorpayKeySecret}`).toString('base64');

    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Deliberately not echoed to the customer. A gateway error message can name internal
      // configuration, and the checkout copy already says what to do instead.
      this.logger.error(`Razorpay ${path} failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
      throw new Error(`Razorpay request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }
}
