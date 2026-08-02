import { Controller, Get, UseGuards } from '@nestjs/common';
import { KitchenStatsService } from './kitchen-stats.service.js';
import { KitchenAuthGuard } from '../kitchen-auth/kitchen-auth.guard.js';

@Controller('kitchen/stats')
@UseGuards(KitchenAuthGuard)
export class KitchenStatsController {
  constructor(private readonly stats: KitchenStatsService) {}

  @Get()
  async get() {
    return this.stats.stats();
  }
}
