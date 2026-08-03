import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { CatalogAdminService } from './catalog-admin.service.js';
import { KitchenAuthGuard, RequireRole } from '../kitchen-auth/kitchen-auth.guard.js';
import { ValidationError } from '../../core/errors/app-error.js';

const CreateItemSchema = z.object({
  name: z.string().trim().min(2).max(60),
  categoryId: z.string().min(1),
  // Rupees, with up to two decimals — what an owner actually types.
  rupees: z.number().positive().max(100_000),
  isVeg: z.boolean(),
  description: z.string().trim().max(160).optional(),
  prepTimeSeconds: z.number().int().min(60).max(3600).optional(),
});

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

/**
 * Menu composition — owner only.
 *
 * Deliberately a separate controller from the inventory one above. Stock toggles are a cook's
 * tool used dozens of times a shift; adding a product to the menu is an owner decision made rarely.
 * `@RequireRole('ADMIN')` keeps that boundary enforced rather than implied.
 */
@Controller('admin/menu')
@UseGuards(KitchenAuthGuard)
@RequireRole('ADMIN')
export class CatalogAdminController {
  constructor(private readonly catalogAdmin: CatalogAdminService) {}

  @Get('categories')
  async categories() {
    return this.catalogAdmin.categories();
  }

  @Post('items')
  async createItem(@Body() body: unknown) {
    const parsed = CreateItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the item details.');
    }
    const { rupees, ...rest } = parsed.data;
    return this.catalogAdmin.createItem({
      ...rest,
      // Rupees on the wire because that is what an owner types; paise in the database, because
      // money is never a float here (ADR-003). One conversion, at the boundary.
      pricePaise: BigInt(Math.round(rupees * 100)),
    });
  }
}
