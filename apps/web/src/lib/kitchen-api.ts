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

/** Relative, for the same reason as `lib/api.ts` — the web server proxies to the API. */
const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api/v1';

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

export interface MenuCategoryOption {
  id: string;
  name: string;
  groupId: string;
  emoji: string;
}

/**
 * An item as the **owner** sees it, which is not the same as what a customer sees.
 *
 * `expired` and a past `availableUntil` are the whole point: a lapsed deal is invisible on the
 * storefront but must stay visible here, or the owner cannot tell the difference between an offer
 * that ended and one they never created.
 */
export interface ManageableItem {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  groupId: string;
  isVeg: boolean;
  inStock: boolean;
  stockRemaining: number | null;
  pricePaise: string;
  isDeal: boolean;
  availableUntil: string | null;
  expired: boolean;
}

export interface OwnerOverview {
  window: { from: string; to: string };
  revenuePaise: string;
  orderCount: number;
  averageOrderValuePaise: string;
  peakHour: { hourIst: number; orders: number } | null;
  inProgress: number;
  completed: number;
  cancelled: number;
  rejected: number;
  refundsPaise: string | null;
  repeatCustomers: { count: number; basis: 'PHONE_NUMBER'; estimated: true } | null;
  topProducts: Array<{ name: string; quantity: number; revenuePaise: string }>;
  categories: Array<{ categoryId: string; name: string; quantity: number; revenuePaise: string }>;
  revenueSeries: Array<{ businessDate: string; revenuePaise: string; orders: number }>;
  kitchen: { averagePrepMinutes: number | null; onTimeRate: number | null; sampleSize: number };
  hourly: Array<{ hourIst: number; orders: number; revenuePaise: string }>;
  fulfilmentSplit: Array<{ type: string; orders: number; revenuePaise: string }>;
  paymentMix: Array<{
    method: string;
    orders: number;
    revenuePaise: string;
    estimatedFeePaise: string;
  }>;
  lostOrders: Array<{ reason: string; count: number }>;
  cash: {
    prepaidPaise: string;
    collectedPaise: string;
    outstandingPaise: string;
    ordersOutstanding: number;
  };
  awaitingPayment: { count: number; valuePaise: string };
  comparison: {
    previousWindow: { from: string; to: string };
    revenuePaise: string;
    orderCount: number;
    revenueChangePct: number | null;
    orderChangePct: number | null;
  } | null;
  inventoryAlerts: Array<{ id: string; name: string; inStock: boolean; stockRemaining: number | null }>;
  generatedAt: string;
}

export interface StoreOverride {
  mode: 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED';
  expiresAt: string | null;
  reason: string | null;
  setBy: string | null;
  setAt: string | null;
}

export interface EffectiveStoreStatus {
  acceptingOrders: boolean;
  canBrowseMenu: boolean;
  scheduledOpen: boolean;
  override: StoreOverride;
  orderingBlockedReason: string | null;
  quotedEtaMinutes: number | null;
  secondsUntilOpen: number | null;
  secondsUntilClose: number | null;
  capacityLoad: number;
  localTime: string;
  serverTime: string;
}

export interface ActivityEvent {
  id: string;
  orderNumber: string;
  customerName: string | null;
  totalPaise: string;
  from: string | null;
  to: string;
  actor: string;
  reason: string | null;
  at: string;
}

export interface RealtimeEnvelope {
  type:
    | 'order.placed'
    | 'order.awaiting_payment'
    | 'order.status_changed'
    | 'inventory.changed'
    | 'ping';
  id: string;
  at: string;
  data: Record<string, unknown>;
}

/* ── Endpoints ──────────────────────────────────────────────────────────────────────────────── */

export const kitchen = {
  login: (username: string, password: string) =>
    request<{ token: string; session: { username: string; role: 'KITCHEN' | 'ADMIN'; expiresAt: string } }>(
      '/kitchen/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
    ),

  session: () =>
    request<{ session: { username: string; role: 'KITCHEN' | 'ADMIN'; expiresAt: string } }>(
      '/kitchen/auth/session',
    ),

  queue: () => request<{ orders: ApiOrder[]; serverTime: string }>('/kitchen/queue'),
  completed: () => request<{ orders: ApiOrder[]; serverTime: string }>('/kitchen/completed'),
  stats: () => request<KitchenStats>('/kitchen/stats'),

  /** Orders waiting on money. Not tickets — nothing here is cooked until it is confirmed. */
  awaitingPayment: () =>
    request<{ orders: ApiOrder[]; serverTime: string }>('/kitchen/awaiting-payment'),

  /**
   * Confirm that a UPI payment landed, releasing the order to the kitchen.
   *
   * `providerRef` is the bank's own reference (a UTR) when whoever is confirming has it to hand.
   * Optional by design: requiring it would stall the counter for the sake of a field that is
   * usually available later from the bank statement anyway.
   */
  confirmPayment: (id: string, providerRef?: string) =>
    request<ApiOrder>(`/kitchen/orders/${id}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify(providerRef !== undefined ? { providerRef } : {}),
    }),

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

/**
 * Owner dashboard.
 *
 * Same client, same token, same session storage as the kitchen — one identity, two applications.
 * The server enforces the role; this is only which endpoints the screen calls.
 */
export const admin = {
  overview: (from?: string, to?: string) =>
    request<OwnerOverview>(`/admin/overview${dateQuery(from, to)}`),
  activity: () => request<{ events: ActivityEvent[] }>('/admin/activity'),
  storeStatus: () => request<EffectiveStoreStatus>('/admin/store/override'),
  menuCategories: () => request<{ categories: MenuCategoryOption[] }>('/admin/menu/categories'),

  /** Everything manageable, including lapsed deals the storefront has already hidden. */
  menuItems: () =>
    request<{ items: ManageableItem[]; popularIds: string[]; maxPopular: number }>(
      '/admin/menu/items',
    ),

  createDeal: (input: {
    name: string;
    description?: string;
    rupees: number;
    isVeg: boolean;
    /** Null runs the offer open-ended until it is removed by hand. */
    durationHours: number | null;
  }) => request<ManageableItem>('/admin/menu/deals', { method: 'POST', body: JSON.stringify(input) }),

  removeMenuItem: (productId: string) =>
    request<{ id: string; removed: boolean }>(`/admin/menu/items/${productId}`, {
      method: 'DELETE',
    }),

  setPopular: (ids: string[]) =>
    request<{ popularIds: string[] }>('/admin/menu/popular', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
  createMenuItem: (input: {
    name: string;
    categoryId: string;
    rupees: number;
    isVeg: boolean;
    description?: string;
  }) => request<InventoryItem>('/admin/menu/items', { method: 'POST', body: JSON.stringify(input) }),
  setStoreOverride: (mode: 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED', minutes?: number) =>
    request<EffectiveStoreStatus>('/admin/store/override', {
      method: 'POST',
      body: JSON.stringify({ mode, ...(minutes !== undefined ? { minutes } : {}) }),
    }),
  /** Absolute, because the browser navigates to it rather than fetching it. */
  exportCsvUrl: (from?: string, to?: string): string => {
    const token = kitchenSession.get() ?? '';
    const sep = dateQuery(from, to) === '' ? '?' : '&';
    return `${BASE}/admin/export.csv${dateQuery(from, to)}${sep}token=${encodeURIComponent(token)}`;
  },
};

const dateQuery = (from?: string, to?: string): string =>
  from !== undefined && to !== undefined
    ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    : '';

export const toPaise = (value: string): Paise => Money.paise(BigInt(value));
