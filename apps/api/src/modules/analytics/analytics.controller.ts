import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service.js';
import { KitchenAuthGuard, RequireRole } from '../kitchen-auth/kitchen-auth.guard.js';

/**
 * Owner dashboard API.
 *
 * `@RequireRole('ADMIN')` sits on the controller rather than each handler, so a new endpoint added
 * here is restricted by default. Revenue on a wall-mounted kitchen tablet that anyone in the shop
 * can reach is not a hypothetical leak.
 */
@Controller('admin')
@UseGuards(KitchenAuthGuard)
@RequireRole('ADMIN')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  async overview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.overview(this.analytics.resolveWindow(from, to));
  }

  @Get('activity')
  async activity() {
    return this.analytics.activity();
  }

  /**
   * `GET /admin/export.csv` — orders in the window as a downloadable file.
   *
   * Streamed with a `Content-Disposition` filename carrying the date range, so an owner who
   * exports three nights running does not end up with `export (2).csv` three times.
   */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Res({ passthrough: true }) response: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<string> {
    const window = this.analytics.resolveWindow(from, to);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="juice-stop-${window.from}_to_${window.to}.csv"`,
    );
    // UTF-8 BOM. Without it Excel on Windows reads the file as the local codepage and mangles the
    // rupee sign and any non-ASCII customer name.
    return `﻿${await this.analytics.exportCsv(window)}`;
  }
}
