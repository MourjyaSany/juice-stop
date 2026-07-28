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
    return this.redis.remember(MENU_CACHE_KEY, MENU_CACHE_TTL_SECONDS, () => this.loadMenu());
  }

  private async loadMenu(): Promise<MenuResponseDto> {
    const [categories, products] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
        include: {
          variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          addOns: { where: { isAvailable: true } },
        },
      }),
    ]);

    const groupByCategory = new Map(categories.map((c) => [c.id, c.groupId]));

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
