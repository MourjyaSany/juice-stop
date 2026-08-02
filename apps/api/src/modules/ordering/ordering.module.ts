import { Module } from '@nestjs/common';
import { OrderingController } from './ordering.controller.js';
import { KitchenController } from './kitchen.controller.js';
import { OrderingService } from './ordering.service.js';
import { KitchenModule } from '../kitchen/kitchen.module.js';
import { KitchenAuthModule } from '../kitchen-auth/kitchen-auth.module.js';
import { StoreModule } from '../store/store.module.js';

@Module({
  imports: [KitchenModule, KitchenAuthModule, StoreModule],
  controllers: [OrderingController, KitchenController],
  providers: [OrderingService],
  exports: [OrderingService],
})
export class OrderingModule {}
