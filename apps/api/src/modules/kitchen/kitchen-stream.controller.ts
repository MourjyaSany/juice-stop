import { Controller, Sse, UseGuards } from '@nestjs/common';
import { filter, interval, map, merge, type Observable } from 'rxjs';
import { RealtimeService } from '../../core/events/realtime.service.js';
import { KitchenAuthGuard } from '../kitchen-auth/kitchen-auth.guard.js';

interface SseMessage {
  type: string;
  data: string;
}

/**
 * Live event stream.
 *
 * Two consumers, one stream: the kitchen dashboard (orders + inventory) and the customer app
 * (inventory, so a sold-out item greys out without a refresh). Both filter client-side; the
 * volume is a handful of events a minute, so splitting into per-audience channels would be
 * machinery without a payoff.
 *
 * The heartbeat is not decoration. Idle SSE connections are silently reaped by proxies and by
 * some mobile radios, and the client cannot tell "no orders yet" from "socket died ten minutes
 * ago". A comment frame every 20 seconds keeps the connection warm and lets the dashboard show a
 * truthful connection indicator.
 */
@Controller('kitchen')
@UseGuards(KitchenAuthGuard)
export class KitchenStreamController {
  constructor(private readonly realtime: RealtimeService) {}

  @Sse('stream')
  stream(): Observable<SseMessage> {
    const events = this.realtime.asObservable().pipe(
      map((event) => ({ type: event.type, data: JSON.stringify(event) })),
    );

    const heartbeat = interval(20_000).pipe(
      map(() => ({ type: 'ping', data: JSON.stringify({ at: new Date().toISOString() }) })),
    );

    return merge(events, heartbeat);
  }
}

/**
 * The customer app's half of the same stream.
 *
 * Unauthenticated and deliberately narrower: it carries availability changes only. The kitchen
 * stream also announces order placements and status transitions, which include customer names and
 * addresses — putting those on a public channel to save one controller would be a data leak in
 * exchange for nothing.
 */
@Controller('storefront')
export class StorefrontStreamController {
  constructor(private readonly realtime: RealtimeService) {}

  @Sse('stream')
  stream(): Observable<SseMessage> {
    const events = this.realtime.asObservable().pipe(
      // Availability, menu shape and store status only. Order events carry names, addresses and
      // phone numbers, and this channel is public.
      filter(
        (event) =>
          event.type === 'inventory.changed' ||
          event.type === 'menu.changed' ||
          event.type === 'store.changed',
      ),
      map((event) => ({ type: event.type, data: JSON.stringify(event) })),
    );

    const heartbeat = interval(20_000).pipe(
      map(() => ({ type: 'ping', data: JSON.stringify({ at: new Date().toISOString() }) })),
    );

    return merge(events, heartbeat);
  }
}
