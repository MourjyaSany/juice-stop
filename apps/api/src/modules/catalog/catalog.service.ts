import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { RedisService } from '../../core/cache/redis.service.js';

/**
 * Menu read model.
 *
 * Money crosses the wire as a **decimal string of paise**, never a JSON number. `bigint` has no
 * JSON representation, and emitting a float would reintroduce exactly the precision loss that
 * ADR-003 exists to prevent. The client parses straight back to `bigint`.
 */

export interface MenuVariantDto {
  id: string;
  name: string;
  pricePaise: string;
}

export interface MenuAddOnDto {
  id: string;
  name: string;
  pricePaise?: string;
  priceByVariantId?: Record<string, string>;
}

export interface MenuItemDto {
  id: string;
  groupId: string;
  categoryId: string;
  name: string;
  description?: string;
  isVeg: boolean;
  prepTimeSeconds: number;
  tags: string[];
  inStock: boolean;
  /** A time-limited offer rather than a standing item. Drives the deal styling on the storefront. */
  isDeal: boolean;
  /** In a hidden category — a checkout add-on. Never listed in the browsable menu. */
  hidden: boolean;
  /** When the offer ends, so the customer can be shown a countdown rather than a silent removal. */
  availableUntil?: string;
  variants: MenuVariantDto[];
  addOns: MenuAddOnDto[];
}

export interface MenuCategoryDto {
  id: string;
  groupId: string;
  name: string;
  emoji: string;
  note?: string;
}

export interface MenuResponseDto {
  menuVersion: number;
  categories: MenuCategoryDto[];
  items: MenuItemDto[];
}

/** How long a cached menu stays warm. Publishing bumps the version and invalidates immediately. */
const MENU_CACHE_TTL_SECONDS = 300;
const MENU_CACHE_KEY = 'menu:v1';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * The whole menu in one payload.
   *
   * Deliberately not paginated: the entire catalogue is well under 60 KB, so shipping it whole
   * means changing category or searching costs the client zero network round trips
   * (01-system-architecture.md §12). `remember` falls through to the database if Redis is
   * unavailable, so a cache outage costs latency rather than availability.
   */
  async getMenu(): Promise<MenuResponseDto> {
    // The cache must never outlive the soonest deal.
    //
    // A five-minute TTL over a deal that ends in ninety seconds would keep selling it at the offer
    // price after it lapsed — and an offer the shop has to honour because the cache said so is a
    // real cost, not a display bug. Capping the TTL to the next expiry costs one indexed query on
    // a cache miss and makes the window exact.
    return this.redis.remember(MENU_CACHE_KEY, await this.cacheTtlSeconds(), () => this.loadMenu());
  }

  /** The standard TTL, or less when a deal ends sooner. */
  private async cacheTtlSeconds(): Promise<number> {
    const soonest = await this.prisma.product.findFirst({
      where: { deletedAt: null, availableUntil: { gt: new Date() } },
      orderBy: { availableUntil: 'asc' },
      select: { availableUntil: true },
    });
    if (soonest?.availableUntil == null) return MENU_CACHE_TTL_SECONDS;

    const secondsLeft = Math.ceil((soonest.availableUntil.getTime() - Date.now()) / 1000);
    // Floor of 5s so a deal in its final seconds cannot turn the cache off entirely and send every
    // request straight to the database.
    return Math.max(5, Math.min(MENU_CACHE_TTL_SECONDS, secondsLeft));
  }

  private async loadMenu(): Promise<MenuResponseDto> {
    const now = new Date();

    const [categories, products] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          // The offer window, enforced where the menu is read. Null on either side means unbounded,
          // which is every ordinary item — so this costs nothing for the other ~200 products.
          AND: [
            { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
            { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
          ],
        },
        // Deals first: an offer nobody scrolls to is an offer that does not sell.
        orderBy: [{ isDeal: 'desc' }, { categoryId: 'asc' }, { sortOrder: 'asc' }],
        include: {
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          addOns: { where: { isAvailable: true } },
        },
      }),
    ]);

    const groupByCategory = new Map(categories.map((c) => [c.id, c.groupId]));
    // Which categories never appear while browsing. Checkout add-ons live here, and the owner can
    // add items to them at runtime — so the flag has to travel rather than being a build constant.
    const hiddenCategories = new Set(categories.filter((c) => c.isHidden).map((c) => c.id));

    return {
      menuVersion: 1,
      categories: categories.map((c) => ({
        id: c.id,
        groupId: c.groupId,
        name: c.name,
        emoji: c.emoji,
        ...(c.note !== null ? { note: c.note } : {}),
      })),
      items: products.map((p) => ({
        id: p.id,
        groupId: groupByCategory.get(p.categoryId) ?? 'food',
        categoryId: p.categoryId,
        name: p.name,
        ...(p.description !== null ? { description: p.description } : {}),
        isVeg: p.isVeg,
        prepTimeSeconds: p.prepTimeSeconds,
        tags: safeJsonArray(p.tagsJson),
        inStock: p.inStock,
        isDeal: p.isDeal,
        hidden: hiddenCategories.has(p.categoryId),
        ...(p.availableUntil !== null ? { availableUntil: p.availableUntil.toISOString() } : {}),
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          pricePaise: v.pricePaise.toString(),
        })),
        addOns: p.addOns.map((a) => ({
          id: a.id,
          name: a.name,
          ...(a.pricePaise !== null ? { pricePaise: a.pricePaise.toString() } : {}),
          ...(a.priceByVariantJson !== null
            ? { priceByVariantId: safeJsonRecord(a.priceByVariantJson) }
            : {}),
        })),
      })),
    };
  }

  /** Drop the cached menu. Called after any catalogue write. */
  async invalidate(): Promise<void> {
    if (!this.redis.isAvailable) return;
    await this.redis.client.del(MENU_CACHE_KEY).catch(() => undefined);
  }
}

/**
 * SQLite has no array or JSON column type, so these are stored as text. A malformed row must not
 * take the whole menu down — an item with broken tags is a cosmetic problem; a 500 on `/menu`
 * closes the shop.
 */
function safeJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeJsonRecord(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
  } catch {
    return {};
  }
}
