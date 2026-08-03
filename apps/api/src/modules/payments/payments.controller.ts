import { Controller, Get } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

/**
 * What the storefront may offer at checkout.
 *
 * Public and unauthenticated, and it exposes nothing sensitive — only which of two methods the
 * shop can take tonight and how a payment will be confirmed. The alternative was hardcoding the
 * method list in the bundle, which is exactly how a customer ends up choosing UPI at a shop that
 * has no UPI ID configured and discovering it after they tap pay.
 */
@Controller('storefront/payment-methods')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  methods() {
    return {
      methods: this.payments.methods(),
      /**
       * How UPI confirmation arrives, hoisted so the checkout copy can be honest without digging
       * through the method list. MANUAL means a person confirms; the customer is told to expect
       * that rather than promised an instant automation.
       */
      upiConfirmation: this.payments.upiAvailable ? this.payments.confirmation : null,
    };
  }
}
