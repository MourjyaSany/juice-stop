import { Injectable } from '@nestjs/common';
import { Money, toBusinessDate } from '@juice-stop/core';
import { PrismaService } from '../../core/database/prisma.service.js';

/**
 * Business intelligence for the owner dashboard.
 *
 * Everything here is scoped to **business dates**, never calendar dates. An order at 02:30 belongs
 * to the night that opened at 19:00 the day before (ADR-010), so keying on `created_at::date`
 * would split every night's takings across two rows and make "yesterday's revenue" a number the
 * owner could never reconcile against the till.
 *
 * Money stays `bigint` paise all the way to the wire, where it becomes a decimal string. Averages
 * are the one place integer division is unavoidable — `Money.allocate` cannot help with a mean —
 * so AOV is computed in paise and rounded once, at the end.
 */

export interface DateWindow {
  /** Inclusive business dates, `YYYY-MM-DD`. */
  from: string;
  to: string;
}

export interface OwnerOverview {
  window: DateWindow;
  revenuePaise: string;
  orderCount: number;
  averageOrderValuePaise: string;
  peakHour: { hourIst: number; orders: number } | null;
  inProgress: number;
  completed: number;
  cancelled: number;
  rejected: number;
  /** Null, not zero — no refund process exists yet, and a zero would read as "none happened". */
  refundsPaise: string | null;
  repeatCustomers: { count: number; basis: 'PHONE_NUMBER'; estimated: true } | null;
  topProducts: Array<{ name: string; quantity: number; revenuePaise: string }>;
  categories: Array<{ categoryId: string; name: string; quantity: number; revenuePaise: string }>;
  revenueSeries: Array<{ businessDate: string; revenuePaise: string; orders: number }>;
  kitchen: { averagePrepMinutes: number | null; onTimeRate: number | null; sampleSize: number };
  inventoryAlerts: Array<{ id: string; name: string; inStock: boolean; stockRemaining: number | null }>;
  generatedAt: string;
}

/** Statuses that represent money actually taken. */
const REVENUE_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Default window: tonight only. */
  defaultWindow(now = new Date()): DateWindow {
    const today = toBusinessDate(now);
    return { from: today, to: today };
  }

  async overview(window: DateWindow): Promise<OwnerOverview> {
    const dateFilter = { businessDate: { gte: window.from, lte: window.to } };

    const [orders, items, products] = await Promise.all([
      this.prisma.order.findMany({
        where: dateFilter,
        select: {
          id: true,
          businessDate: true,
          status: true,
          totalPaise: true,
          placedAt: true,
          customerPhone: true,
        },
      }),
      this.prisma.orderItem.findMany({
        where: { order: dateFilter },
        select: {
          nameSnapshot: true,
          quantity: true,
          lineTotalPaise: true,
          productId: true,
          order: { select: { status: true } },
        },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null, OR: [{ inStock: false }, { stockRemaining: { not: null } }] },
        select: { id: true, name: true, inStock: true, stockRemaining: true, categoryId: true },
      }),
    ]);

    const earning = orders.filter((o) => REVENUE_STATUSES.includes(o.status));
    const revenuePaise = Money.sum(earning.map((o) => Money.paise(o.totalPaise)));

    // Integer division, deliberately. A mean is not a split, so `Money.allocate` does not apply —
    // and a float here would reintroduce exactly the drift ADR-003 exists to prevent.
    const averageOrderValuePaise =
      earning.length === 0 ? Money.ZERO : Money.paise(revenuePaise / BigInt(earning.length));

    return {
      window,
      revenuePaise: revenuePaise.toString(),
      orderCount: earning.length,
      averageOrderValuePaise: averageOrderValuePaise.toString(),
      peakHour: peakHour(earning.map((o) => o.placedAt)),
      inProgress: orders.filter((o) =>
        ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status),
      ).length,
      completed: orders.filter((o) => o.status === 'DELIVERED').length,
      cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
      rejected: orders.filter((o) => o.status === 'REJECTED').length,
      refundsPaise: null,
      repeatCustomers: repeatCustomers(earning),
      topProducts: topProducts(items),
      categories: await this.categoryBreakdown(items),
      revenueSeries: revenueSeries(earning),
      kitchen: await this.kitchenPerformance(window),
      inventoryAlerts: products
        .sort((a, b) => Number(a.inStock) - Number(b.inStock))
        .slice(0, 20)
        .map((p) => ({
          id: p.id,
          name: p.name,
          inStock: p.inStock,
          stockRemaining: p.stockRemaining,
        })),
      generatedAt: new Date().toISOString(),
    };
  }

  private async categoryBreakdown(
    items: Array<{
      productId: string | null;
      quantity: number;
      lineTotalPaise: bigint;
      order: { status: string };
    }>,
  ) {
    const sold = items.filter((i) => REVENUE_STATUSES.includes(i.order.status));
    if (sold.length === 0) return [];

    const productIds = [...new Set(sold.map((i) => i.productId).filter((id): id is string => id !== null))];
    if (productIds.length === 0) return [];

    const categories = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, categoryId: true, category: { select: { name: true } } },
    });
    const categoryOf = new Map(
      categories.map((p) => [p.id, { id: p.categoryId, name: p.category.name }]),
    );

    const totals = new Map<string, { name: string; quantity: number; revenue: bigint }>();
    for (const item of sold) {
      // An item whose product was deleted keeps its price snapshot but loses its category. It
      // still counted as revenue above; it just cannot be attributed to a category here.
      if (item.productId === null) continue;
      const category = categoryOf.get(item.productId);
      if (category === undefined) continue;
      const row = totals.get(category.id) ?? { name: category.name, quantity: 0, revenue: 0n };
      row.quantity += item.quantity;
      row.revenue += item.lineTotalPaise;
      totals.set(category.id, row);
    }

    return [...totals.entries()]
      .map(([categoryId, row]) => ({
        categoryId,
        name: row.name,
        quantity: row.quantity,
        revenuePaise: row.revenue.toString(),
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }

  /**
   * Kitchen performance from the audit trail rather than a denormalised column.
   *
   * The trail is what actually happened, and it survives undos honestly — a ticket taken back to
   * PREPARING and re-readied shows both, which is exactly what a shift review needs to see.
   */
  private async kitchenPerformance(window: DateWindow) {
    const events = await this.prisma.orderStatusEvent.findMany({
      where: {
        order: { businessDate: { gte: window.from, lte: window.to } },
        toStatus: { in: ['ACCEPTED', 'READY'] },
      },
      select: { orderId: true, toStatus: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const acceptedAt = new Map<string, number>();
    const durations: number[] = [];
    for (const event of events) {
      if (event.toStatus === 'ACCEPTED') {
        acceptedAt.set(event.orderId, event.createdAt.getTime());
        continue;
      }
      const started = acceptedAt.get(event.orderId);
      // A READY with no recorded ACCEPTED is skipped rather than counted as zero — a fake
      // 0-minute prep would drag the average down and flatter the kitchen.
      if (started === undefined) continue;
      durations.push((event.createdAt.getTime() - started) / 60_000);
      acceptedAt.delete(event.orderId);
    }

    if (durations.length === 0) {
      return { averagePrepMinutes: null, onTimeRate: null, sampleSize: 0 };
    }

    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    // "On time" is measured against the 40-minute PREPARING allowance the customer is shown, so
    // the owner grades the kitchen by the same promise the customer was given.
    const onTime = durations.filter((d) => d <= 40).length;

    return {
      averagePrepMinutes: Math.round(mean * 10) / 10,
      onTimeRate: Math.round((onTime / durations.length) * 1000) / 10,
      sampleSize: durations.length,
    };
  }

  /** Recent lifecycle events, newest first — the live activity feed. */
  async activity(limit = 30) {
    const events = await this.prisma.orderStatusEvent.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        actorRole: true,
        reason: true,
        createdAt: true,
        order: { select: { orderNumber: true, customerName: true, totalPaise: true } },
      },
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        orderNumber: e.order.orderNumber,
        customerName: e.order.customerName,
        totalPaise: e.order.totalPaise.toString(),
        from: e.fromStatus,
        to: e.toStatus,
        actor: e.actorRole,
        reason: e.reason,
        at: e.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Order-level export.
   *
   * CSV rather than a spreadsheet binary: every tool the owner might use opens it, it is diffable,
   * and generating real `.xlsx` would mean a dependency and a binary blob for data that is a flat
   * table. Excel opens this directly.
   */
  async exportCsv(window: DateWindow): Promise<string> {
    const orders = await this.prisma.order.findMany({
      where: { businessDate: { gte: window.from, lte: window.to } },
      orderBy: { placedAt: 'asc' },
      include: { items: true },
    });

    const header = [
      'business_date',
      'order_number',
      'placed_at_ist',
      'status',
      'fulfilment',
      'customer',
      'phone',
      'payment_method',
      'payment_status',
      'items',
      'subtotal_inr',
      'total_inr',
    ];

    const rows = orders.map((o) => [
      o.businessDate,
      o.orderNumber,
      o.placedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      o.status,
      o.fulfilmentType,
      o.customerName ?? '',
      o.customerPhone ?? '',
      o.paymentMethod,
      o.paymentStatus,
      o.items.map((i) => `${i.quantity}x ${i.nameSnapshot}`).join('; '),
      // Rupees with two decimals for the accountant; paise stay exact in the database.
      formatRupees(o.subtotalPaise),
      formatRupees(o.totalPaise),
    ]);

    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  }

  /** Validate and normalise a requested window, defaulting to tonight. */
  resolveWindow(from?: string, to?: string, now = new Date()): DateWindow {
    const isDate = (v: string | undefined): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '');
    if (!isDate(from) || !isDate(to)) return this.defaultWindow(now);
    // Swap rather than reject — a reversed range is a slip, not an attack, and the owner should
    // get their data instead of an error.
    return from <= to ? { from, to } : { from: to, to: from };
  }
}

/* ── Helpers ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Busiest hour, in IST.
 *
 * Reported in the timezone the owner thinks in. The server runs UTC, so "peak at 21:00" computed
 * naively would name an hour nobody in the shop recognises.
 */
function peakHour(placedAt: Date[]): { hourIst: number; orders: number } | null {
  if (placedAt.length === 0) return null;
  const byHour = new Map<number, number>();
  for (const at of placedAt) {
    const hour = Number(
      at.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }),
    );
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  const [hourIst, orders] = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return { hourIst, orders };
}

/**
 * Customers who ordered more than once.
 *
 * Grouped by phone number because there is no customer identity yet (audit A3), and the number is
 * unverified — two people sharing a phone count as one, and one person using two numbers counts as
 * two. Flagged `estimated` all the way to the UI rather than presented as fact.
 */
function repeatCustomers(
  orders: Array<{ customerPhone: string | null }>,
): { count: number; basis: 'PHONE_NUMBER'; estimated: true } | null {
  const withPhone = orders.filter((o) => o.customerPhone !== null && o.customerPhone.length > 0);
  if (withPhone.length === 0) return null;

  const counts = new Map<string, number>();
  for (const order of withPhone) {
    counts.set(order.customerPhone!, (counts.get(order.customerPhone!) ?? 0) + 1);
  }
  return {
    count: [...counts.values()].filter((n) => n > 1).length,
    basis: 'PHONE_NUMBER',
    estimated: true,
  };
}

function topProducts(
  items: Array<{ nameSnapshot: string; quantity: number; lineTotalPaise: bigint; order: { status: string } }>,
) {
  const totals = new Map<string, { quantity: number; revenue: bigint }>();
  for (const item of items) {
    if (!REVENUE_STATUSES.includes(item.order.status)) continue;
    const row = totals.get(item.nameSnapshot) ?? { quantity: 0, revenue: 0n };
    row.quantity += item.quantity;
    row.revenue += item.lineTotalPaise;
    totals.set(item.nameSnapshot, row);
  }
  return [...totals.entries()]
    .map(([name, row]) => ({
      name,
      quantity: row.quantity,
      revenuePaise: row.revenue.toString(),
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);
}

function revenueSeries(orders: Array<{ businessDate: string; totalPaise: bigint }>) {
  const byDate = new Map<string, { revenue: bigint; orders: number }>();
  for (const order of orders) {
    const row = byDate.get(order.businessDate) ?? { revenue: 0n, orders: 0 };
    row.revenue += order.totalPaise;
    row.orders += 1;
    byDate.set(order.businessDate, row);
  }
  return [...byDate.entries()]
    .map(([businessDate, row]) => ({
      businessDate,
      revenuePaise: row.revenue.toString(),
      orders: row.orders,
    }))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));
}

const formatRupees = (paise: bigint): string => {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

/**
 * Quote a CSV cell, and defuse formula injection.
 *
 * A cell beginning `=`, `+`, `-` or `@` is executed as a formula when the file is opened in Excel
 * or Sheets. Customer names and notes reach this export, so a name like `=HYPERLINK(...)` would
 * run on the owner's machine. Prefixing with an apostrophe keeps the text readable and inert.
 */
function csvCell(value: string): string {
  const risky = /^[=+\-@\t\r]/.test(value);
  const escaped = (risky ? `'${value}` : value).replace(/"/g, '""');
  return `"${escaped}"`;
}
