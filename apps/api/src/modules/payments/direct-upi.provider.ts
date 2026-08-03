import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PAYMENT_WINDOW_MS, buildUpiUri, isValidVpa } from '@juice-stop/core';
import { AppConfigService } from '../../core/config/config.service.js';
import {
  amountFields,
  type CreatePaymentInput,
  type PaymentProvider,
  type PaymentRequest,
} from './payment-provider.js';

/**
 * UPI straight to the shop's own account. No gateway, no account, no fees.
 *
 * The QR carries the exact amount, so the customer cannot underpay by editing the figure, and it
 * carries our reference so a human can match a bank credit to an order. That is the whole of what
 * this adapter can do — **it cannot tell you the money arrived**, because UPI deep links have no
 * callback. Confirmation is therefore `MANUAL`, and the kitchen gets a button.
 *
 * This is genuinely how a large number of Indian counter businesses operate: the shop's phone
 * announces "₹359.10 received" the instant it lands, and someone taps. During service that is a
 * few seconds — often faster than a customer can put their phone away. Outside service, or with
 * nobody watching the phone, it is not, and the customer-facing copy says so rather than promising
 * an automation that does not exist.
 *
 * Upgrading to real automatic confirmation is a sibling file implementing the same interface plus
 * a webhook controller. Nothing else in the codebase changes.
 */
@Injectable()
export class DirectUpiProvider implements PaymentProvider, OnModuleInit {
  readonly id = 'direct-upi';
  readonly confirmation = 'MANUAL' as const;

  private readonly logger = new Logger(DirectUpiProvider.name);

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    if (!this.isAvailable()) {
      // Not fatal outside production — the shop simply takes cash only, which is a truthful
      // degradation rather than a broken checkout. Production refuses to boot; see env.schema.
      this.logger.warn(
        'UPI_PAYEE_VPA is not set or is malformed — UPI is disabled and checkout will offer cash ' +
          'on delivery only. Set the shop UPI ID to accept UPI.',
      );
      return;
    }
    this.logger.log(
      `UPI enabled · paying ${this.config.payments.upiPayeeName} at ${this.maskedVpa()} · ` +
        'confirmation is MANUAL (a staff member confirms receipt)',
    );
  }

  isAvailable(): boolean {
    const vpa = this.config.payments.upiPayeeVpa;
    return vpa !== undefined && isValidVpa(vpa);
  }

  async createRequest(input: CreatePaymentInput): Promise<PaymentRequest> {
    const vpa = this.config.payments.upiPayeeVpa;
    if (vpa === undefined || !isValidVpa(vpa)) {
      // Reachable only if configuration changed after boot. Throwing beats generating a QR that
      // points nowhere — an unpayable QR looks like a working one until the customer tries.
      throw new Error('UPI is not configured — UPI_PAYEE_VPA is missing or malformed.');
    }

    // Honour the order's recorded deadline when re-serving; only a brand-new request opens a fresh
    // window. Otherwise a customer could hold stock indefinitely by reloading the payment screen.
    const expiresAt = input.expiresAt ?? new Date(Date.now() + PAYMENT_WINDOW_MS);

    return {
      reference: input.reference,
      upiUri: buildUpiUri({
        payeeVpa: vpa,
        payeeName: this.config.payments.upiPayeeName,
        amountPaise: input.amountPaise,
        transactionRef: input.reference,
        // The order number, so it appears on the customer's payment screen and in their app's
        // history. When they ring up about a payment, this is what they will read out.
        note: `Juice Stop ${input.orderNumber}`,
      }),
      ...amountFields(input.amountPaise),
      expiresAt: expiresAt.toISOString(),
      confirmation: this.confirmation,
      providerRef: null,
    };
  }

  /** `jui***@okhdfcbank` — enough to verify the right account is configured, not enough to log an ID. */
  private maskedVpa(): string {
    const vpa = this.config.payments.upiPayeeVpa ?? '';
    const [name = '', handle = ''] = vpa.split('@');
    return `${name.slice(0, 3)}***@${handle}`;
  }
}
