import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { KitchenAuthModule } from '../kitchen-auth/kitchen-auth.module.js';

/**
 * Read-only business intelligence.
 *
 * Deliberately owns no writes. Every number here is derived from orders and the status audit
 * trail, so the dashboard can never become a second source of truth about what happened.
 */
@Module({
  imports: [KitchenAuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
