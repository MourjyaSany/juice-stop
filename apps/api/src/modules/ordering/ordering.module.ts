import { Module } from '@nestjs/common';
import { OrderingController } from './ordering.controller.js';
import { KitchenController } from './kitchen.controller.js';
import { OrderingService } from './ordering.service.js';

@Module({
  controllers: [OrderingController, KitchenController],
  providers: [OrderingService],
  exports: [OrderingService],
})
export class OrderingModule {}
