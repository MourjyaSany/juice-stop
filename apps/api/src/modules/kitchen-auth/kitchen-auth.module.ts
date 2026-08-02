import { Module } from '@nestjs/common';
import { KitchenAuthService } from './kitchen-auth.service.js';
import { KitchenAuthController } from './kitchen-auth.controller.js';
import { KitchenAuthGuard } from './kitchen-auth.guard.js';

/**
 * ⚠️  Development authentication. See `kitchen-auth.service.ts`.
 *
 * Exported so kitchen controllers can apply the guard. When real identity lands, this module is
 * deleted and its replacement exports a guard with the same name — nothing else moves.
 */
@Module({
  controllers: [KitchenAuthController],
  providers: [KitchenAuthService, KitchenAuthGuard],
  exports: [KitchenAuthService, KitchenAuthGuard],
})
export class KitchenAuthModule {}
