/**
 * Kitchen API client and session.
 *
 * ⚠️  The session half of this file pairs with `apps/api/src/modules/kitchen-auth`, which is
 * **development authentication**. Everything below treats the token as opaque — it is minted,
 * stored and sent, never inspected — so replacing the backend module with real identity changes
 * nothing here beyond the login response shape.
 */

import { Money, type Paise } from '@juice-stop/core';
import { ApiError, type ApiOrder } from './api';

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

/**
 * sessionStorage, not localStorage.
 *
 * A kitchen tablet is a shared device. Scoping the session to the tab means closing it ends the
 * shift, rather than leaving the next person signed in as whoever used it last.
 */
const TOKEN_KEY = 'js.kitchen.token';

export const kitchenSession = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
    window.sessionStorage.removeItem(TOKEN_KEY);
  },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = kitchenSession.get();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as
      | { code?: string; detail?: string; meta?: Record<string, unknown> }
      | null;
    // A dead token must not leave the dashboard rendering an empty kitchen as though the night
    // were quiet. Clearing it here means the next render bounces to the login screen.
    if (response.status === 401) kitchenSession.clear();
    throw new ApiError(
      response.status,
      problem?.code ?? 'UNKNOWN',
      problem?.detail ?? `Request failed (${response.status})`,
      problem?.meta,
    );
  }

  return response.json() as Promise<T>;
}

/* ── Wire types ─────────────────────────────────────────────────────────────────────────────── */

export interface KitchenStats {
  waiting: number;
  preparing: number;
  ready: number;
  completedToday: number;
  averagePrepMinutes: number | null;
  acceptingOrders: boolean;
  openSince: string | null;
  businessDate: string;
  serverTime: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  groupId: string;
  isVeg: boolean;
  inStock: boolean;
  stockRemaining: number | null;
  pricePaise: string;
}

export type StockPreset = 'UNLIMITED' | 'TEN' | 'FIVE' | 'OUT';

export interface RealtimeEnvelope {
  type: 'order.placed' | 'order.status_changed' | 'inventory.changed' | 'ping';
  id: string;
  at: string;
  data: Record<string, unknown>;
}

/* ── Endpoints ──────────────────────────────────────────────────────────────────────────────── */

export const kitchen = {
  login: (username: string, password: string) =>
    request<{ token: string; session: { username: string; expiresAt: string } }>('/kitchen/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  session: () => request<{ session: { username: string; expiresAt: string } }>('/kitchen/auth/session'),

  queue: () => request<{ orders: ApiOrder[]; serverTime: string }>('/kitchen/queue'),
  completed: () => request<{ orders: ApiOrder[]; serverTime: string }>('/kitchen/completed'),
  stats: () => request<KitchenStats>('/kitchen/stats'),

  accept: (id: string) => request<ApiOrder>(`/kitchen/orders/${id}/accept`, { method: 'POST' }),
  start: (id: string) => request<ApiOrder>(`/kitchen/orders/${id}/start`, { method: 'POST' }),
  ready: (id: string) => request<ApiOrder>(`/kitchen/orders/${id}/ready`, { method: 'POST' }),
  dispatch: (id: string) =>
    request<ApiOrder>(`/kitchen/orders/${id}/out-for-delivery`, { method: 'POST' }),
  delivered: (id: string, otp: string) =>
    request<ApiOrder>(`/kitchen/orders/${id}/delivered`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
  undo: (id: string) => request<ApiOrder>(`/kitchen/orders/${id}/undo`, { method: 'POST' }),
  reject: (id: string, reason: string) =>
    request<ApiOrder>(`/kitchen/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  inventory: () => request<{ items: InventoryItem[] }>('/kitchen/inventory'),
  setPreset: (productId: string, preset: StockPreset) =>
    request<InventoryItem>(`/kitchen/inventory/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ preset }),
    }),
  setAvailability: (productId: string, inStock: boolean) =>
    request<InventoryItem>(`/kitchen/inventory/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ inStock }),
    }),

  /**
   * SSE endpoint URL.
   *
   * `EventSource` cannot send headers, so the token rides in the query string. That is the one
   * place it is allowed to — see the guard's comment on why it is not the default everywhere.
   */
  streamUrl: (): string | null => {
    const token = kitchenSession.get();
    return token === null ? null : `${BASE}/kitchen/stream?token=${encodeURIComponent(token)}`;
  },
};

export const toPaise = (value: string): Paise => Money.paise(BigInt(value));
