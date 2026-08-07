/**
 * API client.
 *
 * Money arrives as **decimal strings of paise** and is parsed straight to `bigint` — never via
 * `number`, which would reintroduce the precision loss ADR-003 exists to prevent.
 */

import { Money, type Paise } from '@juice-stop/core';

/**
 * Relative by default.
 *
 * The web server proxies `/api/v1/*` to the API (see next.config.ts), so the browser never needs
 * to know where the API lives. That is what lets the same build work on a laptop, a phone over the
 * LAN, a tunnel and a real deployment — an absolute `localhost` here means "the device holding the
 * screen", which is wrong everywhere except the developer's own machine.
 */
const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

  if (!response.ok) {
    // The API speaks problem+json (04-api-spec.md §2): `code` is the stable contract, `detail`
    // is human copy that may change. Never string-match `detail`.
    const problem = (await response.json().catch(() => null)) as
      | { code?: string; detail?: string; meta?: Record<string, unknown> }
      | null;
    throw new ApiError(
      response.status,
      problem?.code ?? 'UNKNOWN',
      problem?.detail ?? `Request failed (${response.status})`,
      problem?.meta,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

/** Paise string → branded money. */
export const toPaise = (value: string): Paise => Money.paise(BigInt(value));

/* ── Wire types ─────────────────────────────────────────────────────────────────────────────── */

export interface ApiOrderItem {
  name: string;
  variantName: string;
  addOnNames: string[];
  unitPricePaise: string;
  quantity: number;
  lineTotalPaise: string;
  note: string;
}

export interface ApiOrder {
  id: string;
  orderNumber: string;
  businessDate: string;
  status: string;
  fulfilmentType: string;
  /** Null for takeaway — there is nowhere to deliver, and an empty object would read as a
      failed load rather than an absence. */
  address: Record<string, string> | null;
  pickupToken: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotalPaise: string;
  deliveryFeePaise: string;
  handlingFeePaise: string;
  taxPaise: string;
  totalPaise: string;
  paymentMethod: string;
  paymentStatus: string;
  /** Quoted back to the shop if a payment needs chasing. Null for cash orders. */
  paymentReference: string | null;
  paymentExpiresAt: string | null;
  paidAt: string | null;
  placedAt: string;
  /** When the kitchen last moved it. Drives the phase countdown on both dashboards. */
  statusChangedAt?: string;
  editableUntil: string;
  promisedAt: string;
  prepSeconds: number;
  editCount: number;
  customerNote: string | null;
  items: ApiOrderItem[];
}

/**
 * A live UPI payment request.
 *
 * `confirmation` is the honest bit and drives the copy on the payment screen. AUTOMATIC means a
 * provider webhook will confirm within seconds; MANUAL means the shop confirms by hand once they
 * see the money — which on a busy counter is also seconds, but is a person and not a guarantee.
 * Telling a customer "confirming automatically" when a cook has to notice is how a wait becomes a
 * complaint.
 */
export interface PaymentRequestDto {
  reference: string;
  /** Empty when the provider hosts its own QR — see `qrImageUrl`. */
  upiUri: string;
  /** A QR the gateway renders and hosts. Null on the direct-UPI path, where we draw it ourselves. */
  qrImageUrl: string | null;
  amountRupees: string;
  amountPaise: string;
  expiresAt: string;
  confirmation: 'AUTOMATIC' | 'MANUAL';
  providerRef: string | null;
}

export interface PaymentMethodOption {
  id: 'UPI' | 'COD';
  available: boolean;
  unavailableReason?: string;
  confirmation: 'AUTOMATIC' | 'MANUAL' | null;
}

export const storefrontApi = {
  /**
   * Which methods the shop can actually take tonight.
   *
   * Fetched rather than hardcoded, because UPI depends on a payee being configured. Hardcoding the
   * list is how a customer chooses UPI at a shop with no UPI ID and finds out after tapping pay.
   */
  paymentMethods: () =>
    api.get<{ methods: PaymentMethodOption[]; upiConfirmation: 'AUTOMATIC' | 'MANUAL' | null }>(
      '/storefront/payment-methods',
    ),

  paymentFor: (orderId: string, accessToken: string | undefined) =>
    api.get<{ order: ApiOrder; payment: PaymentRequestDto }>(
      `/orders/${orderId}/payment`,
      orderHeaders(accessToken),
    ),

  /**
   * The checkout add-on buttons and what is inside each.
   *
   * Fetched rather than bundled, because the owner manages these from `/admin/menu` and a new
   * drink has to appear behind the Beverage button without a rebuild.
   */
  extras: () => api.get<{ groups: ExtraGroupDto[] }>('/storefront/extras'),
};

export interface ExtraItemDto {
  id: string;
  name: string;
  variantId: string;
  pricePaise: string;
  isVeg: boolean;
}

export interface ExtraGroupDto {
  categoryId: string;
  label: string;
  emoji: string;
  /** `single` adds on tap; `dropdown` opens a picker. Decided by the server, not by item count. */
  mode: 'single' | 'dropdown';
  items: ExtraItemDto[];
}

/**
 * The per-order capability, as a request header.
 *
 * Every read or write of one specific order now carries this. Without it the API answers 404 —
 * deliberately not 403, because a 403 would confirm the order exists and hand back the enumeration
 * oracle the token exists to remove.
 *
 * Undefined for orders placed before tokens existed. Those requests fail, and the storefront falls
 * back to its own local record rather than showing an error: losing live status on a stale order is
 * a much smaller problem than the leak this replaced.
 */
export const orderHeaders = (accessToken: string | undefined): RequestInit =>
  accessToken !== undefined ? { headers: { 'x-order-token': accessToken } } : {};

export const orderApi = {
  get: (orderId: string, accessToken: string | undefined) =>
    api.get<ApiOrder>(`/orders/${orderId}`, orderHeaders(accessToken)),

  confirmNow: (orderId: string, accessToken: string | undefined) =>
    request<ApiOrder>(`/orders/${orderId}/confirm-now`, {
      method: 'POST',
      ...orderHeaders(accessToken),
    }),

  edit: (orderId: string, accessToken: string | undefined, lines: unknown[]) =>
    request<ApiOrder>(`/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ lines }),
      ...orderHeaders(accessToken),
    }),
};

export const kitchenApi = {
  queue: () => api.get<{ orders: ApiOrder[]; serverTime: string }>('/kitchen/queue'),
  accept: (id: string) => api.post<ApiOrder>(`/kitchen/orders/${id}/accept`),
  start: (id: string) => api.post<ApiOrder>(`/kitchen/orders/${id}/start`),
  ready: (id: string) => api.post<ApiOrder>(`/kitchen/orders/${id}/ready`),
  reject: (id: string, reason: string) =>
    api.post<ApiOrder>(`/kitchen/orders/${id}/reject`, { reason }),
  dispatch: (id: string) => api.post<ApiOrder>(`/kitchen/orders/${id}/out-for-delivery`),
  delivered: (id: string) => api.post<ApiOrder>(`/kitchen/orders/${id}/delivered`),
};
