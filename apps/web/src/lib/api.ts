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
  placedAt: string;
  editableUntil: string;
  promisedAt: string;
  prepSeconds: number;
  editCount: number;
  customerNote: string | null;
  items: ApiOrderItem[];
}

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
