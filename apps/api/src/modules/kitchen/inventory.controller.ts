import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { CatalogAdminService, MAX_POPULAR } from './catalog-admin.service.js';
import {
  KitchenAuthGuard,
  RequireRole,
  type RequestWithKitchenSession,
} from '../kitchen-auth/kitchen-auth.guard.js';
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

const CreateDealSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  rupees: z.number().positive().max(100_000),
  isVeg: z.boolean(),
  /**
   * How long the offer runs. Null is open-ended.
   *
   * Capped at 30 days: a "deal" nobody has revisited in a month is just a menu price, and an offer
   * that quietly runs forever is exactly the kind of thing that gets discovered in an audit rather
   * than decided by an owner. Same reasoning as the store override's expiry.
   */
  durationHours: z.number().int().min(1).max(24 * 30).nullable(),
  prepTimeSeconds: z.number().int().min(60).max(3600).optional(),
});

const PopularSchema = z.object({
  ids: z.array(z.string().min(1)).max(MAX_POPULAR),
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

  /** Everything the owner can manage, lapsed deals included so they can be seen and cleared. */
  @Get('items')
  async items() {
    return this.catalogAdmin.manageableItems();
  }

  @Post('deals')
  async createDeal(@Body() body: unknown) {
    const parsed = CreateDealSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the deal details.');
    }
    const { rupees, ...rest } = parsed.data;
    return this.catalogAdmin.createDeal({
      ...rest,
      pricePaise: BigInt(Math.round(rupees * 100)),
    });
  }

  /**
   * Take an item or deal off the menu.
   *
   * A soft delete — placed orders keep their link to it, so last night's sales stay attributable.
   */
  @Delete('items/:productId')
  async removeItem(
    @Param('productId') productId: string,
    @Req() request: RequestWithKitchenSession,
  ) {
    const username = request.kitchenSession?.username;
    return this.catalogAdmin.removeItem(
      productId,
      username !== undefined ? { username } : {},
    );
  }

  @Put('popular')
  async setPopular(@Body() body: unknown, @Req() request: RequestWithKitchenSession) {
    const parsed = PopularSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? `Pick at most ${MAX_POPULAR} items.`,
      );
    }
    const username = request.kitchenSession?.username;
    return this.catalogAdmin.setPopular(
      parsed.data.ids,
      username !== undefined ? { username } : {},
    );
  }
}

/**
 * The storefront's read of the owner's Popular tonight line-up.
 *
 * Public, and it exposes nothing a customer cannot see by opening the menu. Separate from
 * `GET /menu` because the landing page needs only a handful of ids and should not pull the whole
 * catalogue to render one rail.
 */
@Controller('storefront/popular')
export class PopularController {
  constructor(private readonly catalogAdmin: CatalogAdminService) {}

  @Get()
  async popular() {
    return { popularIds: await this.catalogAdmin.popularIds() };
  }
}
