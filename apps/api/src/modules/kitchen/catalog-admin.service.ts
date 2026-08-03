import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { RealtimeService } from '../../core/events/realtime.service.js';
import { SettingsService } from '../../core/settings/settings.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { ConflictError, ErrorCode, NotFoundError, ValidationError } from '../../core/errors/app-error.js';

/** Owner-curated "Popular tonight" line-up. Empty means fall back to the catalogue's own tags. */
export const POPULAR_IDS_KEY = 'storefront.popular_ids';

/** More than this and the landing rail stops being a recommendation and becomes a second menu. */
export const MAX_POPULAR = 8;

/** Category deals live in. Created on demand — the seed predates the concept. */
const DEALS_CATEGORY_ID = 'deals';

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

export interface CreateDealInput {
  name: string;
  description?: string | undefined;
  pricePaise: bigint;
  isVeg: boolean;
  /** How long the offer runs, from now. Null means open-ended until the owner removes it. */
  durationHours: number | null;
  prepTimeSeconds?: number | undefined;
}

@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
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
   * Create a time-limited deal.
   *
   * A deal is a Product with a window, not a new kind of thing — so it prices, snapshots onto an
   * order, reaches the kitchen ticket and lands in analytics through exactly the same code as
   * everything else. The only difference the rest of the system sees is a flag and two dates.
   */
  async createDeal(input: CreateDealInput) {
    const category = await this.ensureDealsCategory();

    const now = new Date();
    const availableUntil =
      input.durationHours === null
        ? null
        : new Date(now.getTime() + input.durationHours * 3_600_000);

    const id = await this.mintId(`deal ${input.name}`);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          id,
          outletId: category.outletId,
          categoryId: category.id,
          name: input.name,
          description: input.description ?? null,
          isVeg: input.isVeg,
          prepTimeSeconds: input.prepTimeSeconds ?? 420,
          tagsJson: JSON.stringify(['DEAL']),
          inStock: true,
          isDeal: true,
          availableFrom: now,
          availableUntil,
          // Ahead of ordinary items within the category — an offer nobody scrolls to is an offer
          // that does not sell.
          sortOrder: 0,
        },
      });

      await tx.productVariant.create({
        data: {
          id: `${id}-v0`,
          productId: created.id,
          name: 'Deal',
          pricePaise: input.pricePaise,
          sortOrder: 0,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          action: 'menu.deal_created',
          entityType: 'product',
          entityId: created.id,
          after: JSON.stringify({
            name: input.name,
            pricePaise: input.pricePaise.toString(),
            availableUntil: availableUntil?.toISOString() ?? null,
          }),
        },
      });

      return created;
    });

    await this.publishMenuChange(product.id, product.name, { created: true });
    return this.toDto(product.id);
  }

  /**
   * Remove an item or deal from the menu.
   *
   * A **soft** delete. Orders already placed snapshot their own prices and names (ADR-011), but
   * `OrderItem.productId` still points here, and a hard delete would sever the link that lets
   * analytics attribute last night's sales to a category. The customer stops seeing it either way;
   * the history stays intact.
   */
  async removeItem(productId: string, actor: { username?: string }) {
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, name: true, isDeal: true },
    });
    if (existing === null) throw new NotFoundError('That item is not on the menu.');

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        // Availability is switched off alongside the delete. Anything holding a cached menu sees a
        // sold-out item rather than an orderable one that no longer exists.
        data: { deletedAt: new Date(), inStock: false },
      });

      await tx.auditLog.create({
        data: {
          actorRole: 'ADMIN',
          actorUserId: actor.username ?? null,
          action: existing.isDeal ? 'menu.deal_removed' : 'menu.item_removed',
          entityType: 'product',
          entityId: productId,
          before: JSON.stringify({ name: existing.name }),
        },
      });
    });

    // A removed item must not keep occupying a slot on the landing rail.
    const popular = await this.popularIds();
    if (popular.includes(productId)) {
      await this.setPopular(
        popular.filter((id) => id !== productId),
        actor,
      );
    }

    await this.publishMenuChange(productId, existing.name, { removed: true });
    return { id: productId, removed: true };
  }

  /**
   * Everything the owner can manage, including items that are hidden from customers.
   *
   * Deliberately separate from `GET /menu`: that answers "what can be ordered right now" and hides
   * lapsed deals, which is exactly what an owner needs to *see* in order to bring one back.
   */
  async manageableItems() {
    const [products, popular] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: [{ isDeal: 'desc' }, { categoryId: 'asc' }, { sortOrder: 'asc' }],
        include: {
          category: { select: { name: true, groupId: true } },
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      }),
      this.popularIds(),
    ]);

    const now = Date.now();
    return {
      popularIds: popular,
      maxPopular: MAX_POPULAR,
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        groupId: p.category.groupId,
        isVeg: p.isVeg,
        inStock: p.inStock,
        stockRemaining: p.stockRemaining,
        pricePaise: (p.variants[0]?.pricePaise ?? 0n).toString(),
        isDeal: p.isDeal,
        availableUntil: p.availableUntil?.toISOString() ?? null,
        // Computed here rather than in the browser: an owner deciding whether to extend an offer
        // should not be reading a date and doing the arithmetic themselves.
        expired: p.availableUntil !== null && p.availableUntil.getTime() <= now,
      })),
    };
  }

  /** The owner's chosen line-up for the landing rail. Empty means "use the catalogue's tags". */
  async popularIds(): Promise<string[]> {
    const stored = await this.settings.get<string[]>(POPULAR_IDS_KEY, []);
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  }

  /**
   * Set the Popular tonight line-up.
   *
   * Validated against the live catalogue rather than trusted: a stale admin tab could otherwise
   * pin an item that has since been removed, and the storefront would render a card that 404s on
   * tap. Order is preserved because the owner's first pick should be the first card.
   */
  async setPopular(ids: string[], actor: { username?: string }) {
    const unique = [...new Set(ids)];
    if (unique.length > MAX_POPULAR) {
      throw new ValidationError(`Pick at most ${MAX_POPULAR} items for Popular tonight.`);
    }

    const live = await this.prisma.product.findMany({
      where: { id: { in: unique }, deletedAt: null },
      select: { id: true },
    });
    const liveIds = new Set(live.map((p) => p.id));
    const missing = unique.filter((id) => !liveIds.has(id));
    if (missing.length > 0) {
      throw new ValidationError('Some of those items are no longer on the menu.', {
        fieldErrors: missing.map((id) => ({
          field: 'ids',
          code: 'NOT_ON_MENU',
          message: `${id} is not on the menu.`,
        })),
      });
    }

    await this.settings.set(
      POPULAR_IDS_KEY,
      unique,
      { role: 'ADMIN', ...(actor.username !== undefined ? { username: actor.username } : {}) },
      'Owner-curated "Popular tonight" line-up.',
    );

    // Customers with the landing page open see the new line-up without refreshing.
    this.realtime.publish('menu.changed', 'popular', { popularIds: unique });
    return { popularIds: unique };
  }

  /** Deals need a home category, and the seed predates the concept. Created once, on demand. */
  private async ensureDealsCategory() {
    const existing = await this.prisma.category.findUnique({ where: { id: DEALS_CATEGORY_ID } });
    if (existing !== null) return existing;

    const outlet = await this.prisma.outlet.findFirst({ select: { id: true } });
    if (outlet === null) throw new ConflictError(ErrorCode.VALIDATION_FAILED, 'No outlet exists.');

    return this.prisma.category.create({
      data: {
        id: DEALS_CATEGORY_ID,
        outletId: outlet.id,
        // Sits in the combos tab: a deal is a bundle in the customer's head, and inventing a fifth
        // top-level group for something that may hold nothing most nights would leave an empty tab.
        groupId: 'combos',
        name: 'Tonight’s deals',
        emoji: '🔥',
        note: 'Limited time',
        sortOrder: -1,
      },
    });
  }

  private async publishMenuChange(
    productId: string,
    name: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.catalog.invalidate();
    // Reuses the availability channel every storefront already listens on, rather than inventing a
    // second "menu changed" stream that half the consumers would forget to subscribe to.
    this.realtime.publish('inventory.changed', productId, {
      productId,
      name,
      inStock: extra['removed'] !== true,
      stockRemaining: null,
      ...extra,
    });
  }

  private async toDto(productId: string) {
    const p = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: {
        category: { select: { name: true, groupId: true } },
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      categoryName: p.category.name,
      groupId: p.category.groupId,
      isVeg: p.isVeg,
      inStock: p.inStock,
      stockRemaining: p.stockRemaining,
      pricePaise: (p.variants[0]?.pricePaise ?? 0n).toString(),
      isDeal: p.isDeal,
      availableUntil: p.availableUntil?.toISOString() ?? null,
      expired: false,
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
