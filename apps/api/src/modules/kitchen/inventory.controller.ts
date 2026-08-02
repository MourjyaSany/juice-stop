import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { KitchenAuthGuard } from '../kitchen-auth/kitchen-auth.guard.js';
import { ValidationError } from '../../core/errors/app-error.js';

const UpdateSchema = z
  .object({
    inStock: z.boolean().optional(),
    preset: z.enum(['UNLIMITED', 'TEN', 'FIVE', 'OUT']).optional(),
  })
  .refine((v) => v.inStock !== undefined || v.preset !== undefined, {
    message: 'Send either inStock or preset.',
  });

@Controller('kitchen/inventory')
@UseGuards(KitchenAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  async list() {
    return this.inventory.list();
  }

  @Patch(':productId')
  async update(@Param('productId') productId: string, @Body() body: unknown) {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid availability update.');
    }

    // A preset carries an availability decision of its own, so it wins when both are sent rather
    // than applying two writes whose order would decide the outcome.
    if (parsed.data.preset !== undefined) {
      return this.inventory.setStockPreset(productId, parsed.data.preset);
    }
    return this.inventory.setAvailability(productId, parsed.data.inStock === true);
  }
}

/**
 * The storefront's read-only view of the same data.
 *
 * Public and unauthenticated, because the customer app needs it to grey out sold-out items — and
 * it exposes nothing a customer cannot already infer by trying to order.
 */
@Controller('storefront/availability')
export class AvailabilityController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  async availability() {
    return this.inventory.availability();
  }
}
