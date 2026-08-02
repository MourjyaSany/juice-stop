import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { RealtimeService } from '../../core/events/realtime.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { NotFoundError, ValidationError } from '../../core/errors/app-error.js';

/**
 * Availability and stock, owned by the kitchen.
 *
 * `inStock` (a switch) and `stockRemaining` (a count) are two facts that can contradict each
 * other — "available, 0 left" is not a state the customer app can render sensibly. Every write
 * goes through `applyStock` below, which reconciles them, so the contradiction is unrepresentable
 * rather than merely discouraged.
 */

/** What the Inventory page's quick controls map to. */
export type StockPreset = 'UNLIMITED' | 'TEN' | 'FIVE' | 'OUT';

export interface InventoryItemDto {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  groupId: string;
  isVeg: boolean;
  inStock: boolean;
  /** null = unlimited. */
  stockRemaining: number | null;
  pricePaise: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly catalog: CatalogService,
  ) {}

  async list(): Promise<{ items: InventoryItemDto[] }> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      include: {
        category: true,
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });

    return {
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        groupId: p.category.groupId,
        isVeg: p.isVeg,
        inStock: p.inStock,
        stockRemaining: p.stockRemaining,
        pricePaise: (p.variants[0]?.pricePaise ?? 0n).toString(),
      })),
    };
  }

  /**
   * Availability snapshot for the storefront.
   *
   * Deliberately tiny and separate from `GET /menu`: the customer app polls or streams this
   * constantly, and it must not drag the whole 60 KB catalogue along to answer "is anything sold
   * out?". Only the exceptions travel — the overwhelming majority of items are available and
   * unlimited, so sending a row for each would be sending mostly nothing.
   */
  async availability(): Promise<{
    soldOut: string[];
    lowStock: Record<string, number>;
    at: string;
  }> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, OR: [{ inStock: false }, { stockRemaining: { not: null } }] },
      select: { id: true, inStock: true, stockRemaining: true },
    });

    const soldOut: string[] = [];
    const lowStock: Record<string, number> = {};

    for (const p of products) {
      if (!p.inStock) soldOut.push(p.id);
      else if (p.stockRemaining !== null) lowStock[p.id] = p.stockRemaining;
    }

    return { soldOut, lowStock, at: new Date().toISOString() };
  }

  async setAvailability(productId: string, inStock: boolean): Promise<InventoryItemDto> {
    // Turning an item back on with a stale count of 0 would immediately read as sold out again.
    // Re-enabling means "I have more of these", so the count is cleared rather than preserved.
    return this.applyStock(productId, { inStock, stockRemaining: inStock ? null : 0 });
  }

  async setStockPreset(productId: string, preset: StockPreset): Promise<InventoryItemDto> {
    switch (preset) {
      case 'UNLIMITED':
        return this.applyStock(productId, { inStock: true, stockRemaining: null });
      case 'TEN':
        return this.applyStock(productId, { inStock: true, stockRemaining: 10 });
      case 'FIVE':
        return this.applyStock(productId, { inStock: true, stockRemaining: 5 });
      case 'OUT':
        return this.applyStock(productId, { inStock: false, stockRemaining: 0 });
      default:
        throw new ValidationError('Unknown stock preset.');
    }
  }

  /**
   * The single writer of availability.
   *
   * Reconciles the switch and the count — a count of 0 forces the switch off — then invalidates
   * the menu cache and announces the change. Doing all three here is why a customer can never see
   * an item the kitchen has just disabled: there is no path that updates one and forgets another.
   */
  private async applyStock(
    productId: string,
    input: { inStock: boolean; stockRemaining: number | null },
  ): Promise<InventoryItemDto> {
    const stockRemaining =
      input.stockRemaining === null ? null : Math.max(0, Math.trunc(input.stockRemaining));
    const inStock = stockRemaining === 0 ? false : input.inStock;

    const existing = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (existing === null) throw new NotFoundError('That item is not on the menu.');

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { inStock, stockRemaining },
      include: {
        category: true,
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });

    // Cache first, then broadcast. The other order would push clients to refetch a menu that is
    // still cached stale, and they would render the change only to have it vanish.
    await this.catalog.invalidate();

    this.realtime.publish('inventory.changed', updated.id, {
      productId: updated.id,
      name: updated.name,
      inStock: updated.inStock,
      stockRemaining: updated.stockRemaining,
    });

    return {
      id: updated.id,
      name: updated.name,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      groupId: updated.category.groupId,
      isVeg: updated.isVeg,
      inStock: updated.inStock,
      stockRemaining: updated.stockRemaining,
      pricePaise: (updated.variants[0]?.pricePaise ?? 0n).toString(),
    };
  }

  /**
   * Draw down counted stock when an order is placed.
   *
   * Only touches items that actually track a count — unlimited items are the overwhelming
   * majority and must not take a write per order. Hitting zero flips availability off, which is
   * what makes "5 left" mean something rather than being decoration.
   */
  async consume(productQuantities: Array<{ productId: string; quantity: number }>): Promise<void> {
    const counted = await this.prisma.product.findMany({
      where: {
        id: { in: productQuantities.map((p) => p.productId) },
        stockRemaining: { not: null },
      },
      select: { id: true, stockRemaining: true },
    });
    if (counted.length === 0) return;

    const byId = new Map(productQuantities.map((p) => [p.productId, p.quantity]));

    for (const product of counted) {
      const taken = byId.get(product.id) ?? 0;
      const left = Math.max(0, (product.stockRemaining ?? 0) - taken);
      await this.prisma.product.update({
        where: { id: product.id },
        data: { stockRemaining: left, ...(left === 0 ? { inStock: false } : {}) },
      });
      this.realtime.publish('inventory.changed', product.id, {
        productId: product.id,
        inStock: left > 0,
        stockRemaining: left,
      });
    }

    await this.catalog.invalidate();
  }
}
