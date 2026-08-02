'use client';

import { useEffect, useRef, useState } from 'react';
import { kitchen, type RealtimeEnvelope } from '@/lib/kitchen-api';

export type StreamState = 'connecting' | 'live' | 'offline';

/**
 * Live kitchen events, with polling as the floor rather than the ceiling.
 *
 * SSE is the fast path; a slow interval runs regardless. That is not belt-and-braces nervousness
 * — it is the difference between a dashboard that is *usually* right and one that is *always*
 * eventually right. Events can be missed while a tablet's radio sleeps or a proxy reaps an idle
 * connection, and a kitchen board silently missing an order is the single worst failure this
 * screen has. Reconciling against REST on a timer makes any missed event cost seconds, not the
 * order.
 *
 * `onEvent` is held in a ref so a caller passing an inline closure does not tear down and rebuild
 * the EventSource on every render — which would turn the fast path into a reconnect loop.
 */
export function useKitchenStream(onEvent: (event: RealtimeEnvelope) => void): StreamState {
  const [state, setState] = useState<StreamState>('connecting');
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const url = kitchen.streamUrl();
    if (url === null) {
      setState('offline');
      return;
    }

    const source = new EventSource(url);

    const receive = (event: MessageEvent<string>) => {
      setState('live');
      try {
        handler.current(JSON.parse(event.data) as RealtimeEnvelope);
      } catch {
        // A malformed frame is not worth killing the connection over — the next poll reconciles.
      }
    };

    // Named events, because the server labels each frame with its type. `onmessage` alone would
    // only catch unnamed frames and silently receive nothing.
    for (const name of ['order.placed', 'order.status_changed', 'inventory.changed'] as const) {
      source.addEventListener(name, receive as EventListener);
    }
    source.addEventListener('ping', () => setState('live'));
    source.onopen = () => setState('live');
    source.onerror = () => {
      // EventSource reconnects on its own. Reporting 'offline' here is about telling the cook the
      // board may be stale, not about taking recovery action.
      setState('offline');
    };

    return () => source.close();
  }, []);

  return state;
}

/**
 * A steady tick for elapsed timers.
 *
 * One interval shared by every card. Twenty order cards each running their own `setInterval` is
 * twenty timers waking the main thread out of phase, which is how a kitchen board starts dropping
 * frames on the cheap tablet it actually runs on.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
