import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { RealtimeService } from '../../core/events/realtime.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ConflictError, ErrorCode, NotFoundError } from '../../core/errors/app-error.js';

/**
 * Adding and editing menu items from the owner dashboard.
 *
 * Separate from `InventoryService` on purpose. That service answers "how much of this is left
 * tonight" and is touched constantly during service; this one answers "what does the shop sell",
 * which changes rarely and deliberately. Merging them would put a destructive write next to a
 * control cooks tap forty times a shift.
 *
 * New items go straight into the same tables the seed populates, so an owner-created item is
 * indistinguishable from a catalogue one everywhere downstream — pricing, kitchen tickets,
 * analytics and stock all work with no special case.
 */

export interface CreateItemInput {
  name: string;
  categoryId: string;
  pricePaise: bigint;
  isVeg: boolean;
  description?: string | undefined;
  prepTimeSeconds?: number | undefined;
}

@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly catalog: CatalogService,
  ) {}

  async categories() {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ groupId: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, groupId: true, emoji: true },
    });
    return { categories: rows };
  }

  async createItem(input: CreateItemInput) {
    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (category === null) throw new NotFoundError('That category does not exist.');

    const id = await this.mintId(input.name);

    // Product and its variant in one transaction. A product with no variant has no price, and the
    // storefront would render an item nobody can buy — half-created is worse than not created.
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          id,
          outletId: category.outletId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description ?? null,
          isVeg: input.isVeg,
          prepTimeSeconds: input.prepTimeSeconds ?? 420,
          tagsJson: JSON.stringify(['NEW']),
          inStock: true,
          // Sorted last within its category, so a new item never silently displaces the
          // arrangement someone chose for the existing menu.
          sortOrder: 9_000,
        },
      });

      await tx.productVariant.create({
        data: {
          id: `${id}-v0`,
          productId: created.id,
          name: 'Regular',
          pricePaise: input.pricePaise,
          sortOrder: 0,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          action: 'menu.item_created',
          entityType: 'product',
          entityId: created.id,
          after: JSON.stringify({ name: input.name, pricePaise: input.pricePaise.toString() }),
        },
      });

      return created;
    });

    await this.catalog.invalidate();
    // Reuses the inventory event rather than inventing a second "menu changed" channel: every
    // consumer already refetches availability on it, and a new item is an availability change.
    this.realtime.publish('inventory.changed', product.id, {
      productId: product.id,
      name: product.name,
      inStock: true,
      stockRemaining: null,
      created: true,
    });

    return {
      id: product.id,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: category.name,
      groupId: category.groupId,
      isVeg: product.isVeg,
      inStock: product.inStock,
      stockRemaining: product.stockRemaining,
      pricePaise: input.pricePaise.toString(),
    };
  }

  /**
   * A readable, stable id derived from the name.
   *
   * Readable because these ids show up in logs, exports and the kitchen's own URLs, and
   * `custom-paneer-roll` is answerable where a cuid is not. Collisions get a numeric suffix rather
   * than failing the request — an owner adding a second "Special" should not have to invent a
   * different name to satisfy a database constraint.
   */
  private async mintId(name: string): Promise<string> {
    const base =
      `x-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)}` || 'x-item';

    const existing = await this.prisma.product.findMany({
      where: { id: { startsWith: base } },
      select: { id: true },
    });
    if (!existing.some((p) => p.id === base)) return base;

    for (let n = 2; n < 200; n++) {
      const candidate = `${base}-${n}`;
      if (!existing.some((p) => p.id === candidate)) return candidate;
    }
    throw new ConflictError(ErrorCode.VALIDATION_FAILED, 'Too many items with that name.');
  }
}
