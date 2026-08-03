import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../core/config/config.module.js';
import { AppConfigService } from '../../core/config/config.service.js';
import { DirectUpiProvider } from './direct-upi.provider.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

/**
 * Payments.
 *
 * One provider is selected at boot from `PAYMENT_PROVIDER` and bound to a token, so every consumer
 * depends on the interface and none on the adapter. Adding Razorpay is a class in this folder, a
 * webhook controller, and one more branch in the factory below.
 *
 * The factory throws rather than silently falling back when an unknown provider is configured. A
 * typo in the environment that quietly degrades the shop to cash-only is the kind of thing nobody
 * notices until the takings look wrong.
 */
@Module({
  imports: [AppConfigModule],
  controllers: [PaymentsController],
  providers: [
    DirectUpiProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService, DirectUpiProvider],
      useFactory: (config: AppConfigService, directUpi: DirectUpiProvider): PaymentProvider => {
        switch (config.payments.provider) {
          case 'direct-upi':
            return directUpi;
          case 'razorpay':
            throw new Error(
              'PAYMENT_PROVIDER=razorpay is configured but the Razorpay adapter is not built yet. ' +
                'Implement PaymentProvider in modules/payments/razorpay.provider.ts, or set ' +
                'PAYMENT_PROVIDER=direct-upi.',
            );
          default:
            throw new Error(`Unknown PAYMENT_PROVIDER: ${String(config.payments.provider)}`);
        }
      },
    },
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
