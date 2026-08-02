import { Module } from '@nestjs/common';
import { StoreService } from './store.service.js';
import { StoreAdminController, StoreStatusController } from './store.controller.js';
import { SettingsModule } from '../../core/settings/settings.module.js';
import { KitchenAuthModule } from '../kitchen-auth/kitchen-auth.module.js';

@Module({
  imports: [SettingsModule, KitchenAuthModule],
  controllers: [StoreStatusController, StoreAdminController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
