import { Injectable, Logger } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';

/**
 * In-process realtime fan-out.
 *
 * **Why SSE and not WebSockets.** Every event here travels server → client; nothing needs a
 * client → server channel, because the kitchen already mutates state through REST and REST stays
 * the source of truth (ADR-008). Server-Sent Events therefore give the same push semantics with
 * no new dependency, no handshake to proxy, no heartbeat protocol to write, and automatic
 * browser-side reconnection that a hand-rolled socket layer would have to reimplement badly.
 *
 * **Why one Subject and not Redis pub/sub.** A single API process serves one kitchen. Introducing
 * a broker for a fan-out with one publisher and a handful of subscribers would add an operational
 * dependency the deployment does not otherwise need — and Redis is already optional here
 * (`degraded mode`), so making realtime depend on it would make the kitchen dashboard *less*
 * reliable than the REST endpoints it sits on top of.
 *
 * The seam is the event shape, not the transport. When a second process appears, this class
 * publishes to Redis and subscribes back; every emitter and every consumer stays unchanged.
 */

export type RealtimeEventType =
  /** A real ticket. Drives the kitchen's new-order chime. */
  | 'order.placed'
  /**
   * An order exists but has not been paid for.
   *
   * Deliberately distinct from `order.placed`: unpaid orders are not on the queue and must not
   * ring the chime, or an abandoned checkout would sound identical to a sale in a busy kitchen.
   */
  | 'order.awaiting_payment'
  | 'order.status_changed'
  | 'inventory.changed'
  | 'store.changed';

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** Order id, product id — whatever the event is *about*. Lets clients filter cheaply. */
  id: string;
  at: string;
  data: Record<string, unknown>;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly stream$ = new Subject<RealtimeEvent>();

  /**
   * Publish an event to every listener.
   *
   * Deliberately synchronous and non-throwing: this is called from the tail of order transitions,
   * and a subscriber blowing up must never roll back or fail an order that has already been
   * committed. A dropped notification costs a few seconds of staleness — the dashboard reconciles
   * against REST on the next poll or reconnect either way.
   */
  publish(type: RealtimeEventType, id: string, data: Record<string, unknown> = {}): void {
    try {
      this.stream$.next({ type, id, at: new Date().toISOString(), data });
    } catch (error) {
      this.logger.warn(`Realtime publish failed for ${type}: ${String(error)}`);
    }
  }

  /** Every event, in order. Consumers filter. */
  asObservable(): Observable<RealtimeEvent> {
    return this.stream$.asObservable();
  }
}
