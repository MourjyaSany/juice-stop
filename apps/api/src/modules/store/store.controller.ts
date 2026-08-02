import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { StoreService } from './store.service.js';
import {
  KitchenAuthGuard,
  RequireRole,
  type RequestWithKitchenSession,
} from '../kitchen-auth/kitchen-auth.guard.js';
import { ValidationError } from '../../core/errors/app-error.js';

const OverrideSchema = z.object({
  mode: z.enum(['AUTO', 'FORCE_OPEN', 'FORCE_CLOSED']),
  minutes: z.number().int().min(5).max(720).optional(),
  reason: z.string().max(120).optional(),
});

/**
 * Public store status.
 *
 * The storefront used to decide this in the browser from the local clock, which meant a customer
 * with a wrong device time saw a different shop than the kitchen did — and the server never
 * checked at all. This is now the single answer both sides read.
 */
@Controller('storefront/store-status')
export class StoreStatusController {
  constructor(private readonly store: StoreService) {}

  @Get()
  async status() {
    return this.store.status();
  }
}

/** Owner-only control of the same thing. */
@Controller('admin/store')
@UseGuards(KitchenAuthGuard)
@RequireRole('ADMIN')
export class StoreAdminController {
  constructor(private readonly store: StoreService) {}

  @Get('override')
  async current() {
    return this.store.status();
  }

  @Post('override')
  async setOverride(@Body() body: unknown, @Req() request: RequestWithKitchenSession) {
    const parsed = OverrideSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid override.');
    }
    const session = request.kitchenSession;
    return this.store.setOverride(
      {
        mode: parsed.data.mode,
        ...(parsed.data.minutes !== undefined ? { minutes: parsed.data.minutes } : {}),
        ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      },
      {
        role: session?.role ?? 'ADMIN',
        ...(session?.username !== undefined ? { username: session.username } : {}),
      },
    );
  }
}
