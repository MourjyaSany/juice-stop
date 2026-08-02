import { Injectable } from '@nestjs/common';
import { getStoreStatus, toBusinessDate } from '@juice-stop/core';
import { PrismaService } from '../../core/database/prisma.service.js';

export interface KitchenStatsDto {
  waiting: number;
  preparing: number;
  ready: number;
  completedToday: number;
  /** Mean minutes from ACCEPTED to READY tonight. Null until something has actually been cooked. */
  averagePrepMinutes: number | null;
  acceptingOrders: boolean;
  /** ISO instant the current service window opened, or null when closed. */
  openSince: string | null;
  businessDate: string;
  serverTime: string;
}

/**
 * Header metrics for the kitchen dashboard.
 *
 * Everything is scoped to the **business date**, not the calendar date. An order at 02:30 belongs
 * to the night that began at 19:00 the day before (ADR-010); keying on `created_at::date` would
 * reset the counters at midnight, mid-shift, which is the one moment a kitchen is busiest.
 */
@Injectable()
export class KitchenStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<KitchenStatsDto> {
    const now = new Date();
    const businessDate = toBusinessDate(now);
    const store = getStoreStatus(now);

    const [byStatus, prepped] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { businessDate },
        _count: { _all: true },
      }),
      // Average prep time is measured from the audit trail rather than from a column on the order,
      // because the trail is what actually happened. A denormalised duration would be one more
      // thing to keep truthful across cancellations and re-opens.
      this.prisma.orderStatusEvent.findMany({
        where: {
          order: { businessDate },
          toStatus: { in: ['ACCEPTED', 'READY'] },
        },
        select: { orderId: true, toStatus: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const count = (status: string): number =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      waiting: count('PLACED') + count('ACCEPTED'),
      preparing: count('PREPARING'),
      ready: count('READY'),
      completedToday: count('DELIVERED'),
      averagePrepMinutes: averagePrepMinutes(prepped),
      acceptingOrders: store.acceptingOrders,
      openSince: store.acceptingOrders ? openedAt(now).toISOString() : null,
      businessDate,
      serverTime: now.toISOString(),
    };
  }
}

/** Pair each order's ACCEPTED with its READY and mean the gaps. */
function averagePrepMinutes(
  events: Array<{ orderId: string; toStatus: string; createdAt: Date }>,
): number | null {
  const acceptedAt = new Map<string, number>();
  const durations: number[] = [];

  for (const event of events) {
    if (event.toStatus === 'ACCEPTED') {
      acceptedAt.set(event.orderId, event.createdAt.getTime());
      continue;
    }
    const started = acceptedAt.get(event.orderId);
    // An order that reached READY without a recorded ACCEPTED (seeded, or migrated) is skipped
    // rather than counted as zero — a fake 0-minute prep would drag the average down and make the
    // kitchen look faster than it is.
    if (started === undefined) continue;
    durations.push((event.createdAt.getTime() - started) / 60_000);
    acceptedAt.delete(event.orderId);
  }

  if (durations.length === 0) return null;
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  return Math.round(mean * 10) / 10;
}

/**
 * The instant tonight's service window opened, in real time.
 *
 * The window crosses midnight, so "19:00 today" is wrong for any moment after it: at 02:00 the
 * shift began at 19:00 *yesterday*. Business date already encodes which night we are in, so the
 * open time is derived from it rather than from the wall clock.
 */
function openedAt(now: Date): Date {
  const businessDate = toBusinessDate(now);
  const [year, month, day] = businessDate.split('-').map(Number);
  // Store hours are IST; the server runs UTC. 19:00 IST is 13:30 UTC on the same date.
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 13, 30, 0));
}
