import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_METHODS, paymentReferenceFor, type PaymentMethod, type Paise } from '@juice-stop/core';
import {
  PAYMENT_PROVIDER,
  type ConfirmationMode,
  type PaymentProvider,
  type PaymentRequest,
} from './payment-provider.js';

/**
 * What the shop can take money with, and how a payment request is minted.
 *
 * Deliberately knows nothing about orders. It builds a payment request and answers which methods
 * are live; persisting the result and moving the order is `OrderingService`'s job, because the
 * order state machine is the only thing allowed to write `orders.status`. Splitting it this way
 * also breaks what would otherwise be a dependency cycle — ordering needs to create payments, and
 * confirming a payment needs to move an order.
 */

export interface PaymentMethodOption {
  id: PaymentMethod;
  available: boolean;
  /** Present only when unavailable — the UI shows the reason rather than an inert greyed button. */
  unavailableReason?: string;
  confirmation: ConfirmationMode | null;
}

@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  get confirmation(): ConfirmationMode {
    return this.provider.confirmation;
  }

  get providerId(): string {
    return this.provider.id;
  }

  /** Is UPI actually configured and able to take money right now? */
  get upiAvailable(): boolean {
    return this.provider.isAvailable();
  }

  /**
   * The methods checkout may show.
   *
   * Cash is always available; there is nothing to configure and nothing to fail. UPI depends on a
   * payee being set, and when it is not the reason travels with the answer so the customer is told
   * "UPI is unavailable tonight" rather than being shown a button that errors on tap.
   */
  methods(): PaymentMethodOption[] {
    return PAYMENT_METHODS.map((id) =>
      id === 'UPI'
        ? {
            id,
            available: this.upiAvailable,
            ...(this.upiAvailable ? {} : { unavailableReason: 'UPI is not set up for this shop yet.' }),
            confirmation: this.provider.confirmation,
          }
        : { id, available: true, confirmation: null },
    );
  }

  /**
   * Mint a payment request for an order that has just been priced.
   *
   * Pass `expiresAt` when re-serving an existing request — the payment screen refetches on every
   * mount, and without the stored deadline each reload would quietly restart the clock.
   */
  async createRequest(input: {
    orderId: string;
    orderNumber: string;
    amountPaise: Paise;
    expiresAt?: Date | undefined;
  }): Promise<PaymentRequest> {
    return this.provider.createRequest({
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      amountPaise: input.amountPaise,
      reference: paymentReferenceFor(input.orderNumber),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    });
  }
}
