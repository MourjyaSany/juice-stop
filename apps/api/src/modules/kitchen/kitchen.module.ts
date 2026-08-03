import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { CatalogAdminService } from './catalog-admin.service.js';
import { KitchenStatsService } from './kitchen-stats.service.js';
import {
  AvailabilityController,
  CatalogAdminController,
  InventoryController,
} from './inventory.controller.js';
import { KitchenStatsController } from './kitchen-stats.controller.js';
import {
  KitchenStreamController,
  StorefrontStreamController,
} from './kitchen-stream.controller.js';
import { KitchenAuthModule } from '../kitchen-auth/kitchen-auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';

/**
 * Kitchen operations: inventory, header metrics and the realtime stream.
 *
 * Order lifecycle deliberately stays in `OrderingModule` — the state machine is the only writer
 * of `orders.status`, and giving the kitchen its own transition path would be exactly the
 * duplication that invariant exists to prevent. The kitchen's order endpoints live beside it.
 */
@Module({
  imports: [KitchenAuthModule, CatalogModule],
  controllers: [
    InventoryController,
    AvailabilityController,
    CatalogAdminController,
    KitchenStatsController,
    KitchenStreamController,
    StorefrontStreamController,
  ],
  providers: [InventoryService, KitchenStatsService, CatalogAdminService],
  exports: [InventoryService],
})
export class KitchenModule {}
