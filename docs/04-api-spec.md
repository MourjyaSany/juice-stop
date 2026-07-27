# 04 — API Specification

**Base:** `https://api.juicestop.in/api/v1` · **Auth:** Bearer access token + httpOnly refresh cookie
**Contracts:** every request/response schema lives in `packages/contracts` as Zod, generating both the
TypeScript types and the OpenAPI 3.1 document. **The spec is generated from code, never hand-written**
— a hand-maintained spec is wrong within two sprints.

---

## 1. Conventions

| Concern | Rule |
|---|---|
| Versioning | URL path `/api/v1`. Breaking changes mint `/v2`; `/v1` gets a 90-day sunset header |
| Auth | `Authorization: Bearer <access>` (10 min). Refresh via httpOnly cookie on `/auth/refresh` only |
| Idempotency | `Idempotency-Key: <ULID>` **required** on all money-moving and order-mutating POSTs |
| Concurrency | `If-Match: <version>` on order mutations → `409` on mismatch |
| Correlation | `X-Request-Id` echoed on every response; present in every log line |
| Pagination | Cursor-based: `?cursor=<ulid>&limit=20` → `{ data, nextCursor, hasMore }`. **Never offset** — offset paging over a table receiving inserts skips and duplicates rows |
| Filtering | `?status=PLACED,ACCEPTED&from=2026-07-27&to=2026-07-28` (dates are `business_date`) |
| Sorting | `?sort=-placedAt` (`-` = desc) |
| Money | Every monetary field is an integer in **paise**, suffixed `Paise`. `{"totalPaise": 17120}` |
| Timestamps | ISO-8601 UTC with `Z`. Clients render IST |
| Casing | `camelCase` JSON |
| Rate limits | `X-RateLimit-Limit`, `-Remaining`, `-Reset` on every response |
| Compression | brotli → gzip |
| Content type | `application/json`; errors as `application/problem+json` |

---

## 2. Error contract

RFC 9457 Problem Details. One shape, everywhere.

```jsonc
{
  "type": "https://juicestop.in/errors/out-of-stock",
  "title": "Item unavailable",
  "status": 409,
  "code": "ORDER_ITEM_OUT_OF_STOCK",   // stable machine key — clients switch on THIS
  "detail": "Chicken Zinger Burger is sold out for tonight.",
  "instance": "/api/v1/orders",
  "requestId": "01J...",
  "errors": [                          // field-level, for forms
    { "field": "items[2].productId", "code": "OUT_OF_STOCK", "message": "Sold out" }
  ],
  "meta": { "productId": "…", "availableQty": 0 }   // machine-actionable context
}
```

**Rule: `detail` is human copy and may change freely; `code` is a contract and never changes.**
Clients that string-match `detail` are broken by design.

### Canonical error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod rejection; see `errors[]` |
| 401 | `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` | Client should attempt refresh once |
| 401 | `AUTH_REFRESH_REUSED` | **Token theft detected — family revoked, force re-login** |
| 403 | `PERMISSION_DENIED` | Authenticated but lacks the permission |
| 403 | `STEP_UP_REQUIRED` | Sensitive action needs password + TOTP re-auth |
| 404 | `RESOURCE_NOT_FOUND` | |
| 409 | `ORDER_TRANSITION_INVALID` | Stale client; `meta.currentStatus` lets it self-heal |
| 409 | `ORDER_ITEM_OUT_OF_STOCK` | `meta` names the item |
| 409 | `MENU_VERSION_STALE` | Prices changed; `meta.priceDiff` drives the confirm dialog |
| 409 | `CAPACITY_EXHAUSTED` | `meta.retryAfterSeconds` |
| 409 | `VERSION_CONFLICT` | `If-Match` mismatch |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key, different body |
| 422 | `COUPON_INVALID` | `meta.reason` ∈ EXPIRED, MIN_ORDER, USER_LIMIT, TIME_WINDOW, ZONE, FIRST_ORDER_ONLY |
| 422 | `ADDRESS_OUT_OF_ZONE` | The midnight-kingdom response |
| 422 | `STORE_CLOSED` | `meta.opensAt`, `meta.reason` |
| 422 | `INSUFFICIENT_WALLET_BALANCE` | |
| 429 | `RATE_LIMITED` | `Retry-After` header set |
| 500 | `INTERNAL_ERROR` | Never leaks internals; `requestId` is the support handle |
| 503 | `PAYMENT_GATEWAY_UNAVAILABLE` | Client offers COD fallback |

---

## 3. Rate limits

Enforced in Redis (sliding window), keyed per-identity **and** per-IP, whichever is stricter.

| Endpoint group | Limit | Rationale |
|---|---|---|
| `POST /auth/otp/request` | 3 / phone / hour · 10 / IP / hour · 30 / IP / day | SMS costs real money; this is the #1 abuse target |
| `POST /auth/otp/verify` | 5 / phone / 15 min, then 15-min lockout | Brute-force defence on a 6-digit code |
| `POST /auth/login` | 5 / email / 15 min | |
| `POST /orders` | 5 / user / 5 min | Humans don't order 6× in 5 minutes |
| `POST /payments/*` | 10 / user / 5 min | |
| `GET /menu` | 120 / IP / min | Cached; generous |
| Search | 60 / user / min | Client-side search means this is rarely hit |
| Admin mutations | 100 / user / min | |
| Webhooks | unlimited, **signature-gated** | Razorpay retries aggressively; never throttle it |
| Global per-IP | 300 / min | Cloudflare handles volumetric layers above this |

---

## 4. Public / customer API

### 4.1 Auth

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/otp/request` | — | `{ phone }` → `{ requestId, expiresIn, channel }`. **Never reveals whether the account exists** |
| `POST` | `/auth/otp/verify` | — | `{ requestId, code, deviceId }` → tokens + `isNewUser` |
| `POST` | `/auth/google` | — | `{ idToken }` → verified against Google JWKS server-side |
| `POST` | `/auth/email/login` | — | `{ email, password }`. Argon2id, constant-time |
| `POST` | `/auth/email/register` | — | Requires email verification before ordering |
| `POST` | `/auth/guest` | — | `{ phone, otp }` → shadow user. Phone verification is mandatory |
| `POST` | `/auth/refresh` | cookie | **Rotates.** Reuse → revoke entire family + `401 AUTH_REFRESH_REUSED` |
| `POST` | `/auth/logout` | Bearer | Revokes this session |
| `POST` | `/auth/logout-all` | Bearer | Revokes every session — the "I lost my phone" button |
| `GET` | `/auth/sessions` | Bearer | Device list with IP, UA, last-used |
| `DELETE` | `/auth/sessions/:id` | Bearer | Remote revoke |

### 4.2 Catalog

| Method | Path | Notes |
|---|---|---|
| `GET` | `/menu` | **The single most important endpoint.** Whole menu + `menuVersion`, edge-cached, < 60 KB. `ETag` + `304` |
| `GET` | `/menu/products/:slug` | Detail incl. modifier groups, rating, nutrition |
| `GET` | `/menu/collections` | `bestSellers`, `trendingTonight`, `lateNightDeals`, `newDrops` |
| `GET` | `/menu/search?q=` | Server-side fallback; logs zero-result queries |
| `GET` | `/menu/stock` | Lightweight stock deltas for polling fallback |

`GET /menu` response shape:

```jsonc
{
  "menuVersion": 42,
  "outlet": { "id": "…", "name": "Juice Stop" },
  "store": {
    "isOpen": true, "opensAt": "2026-07-27T13:30:00Z", "closesAt": "2026-07-27T22:30:00Z",
    "acceptingOrders": true, "capacityLoad": 0.34,
    "quotedEtaMinutes": 28, "rushMode": false, "message": null
  },
  "categories": [ { "id": "…", "name": "Burgers", "slug": "burgers", "sortOrder": 1 } ],
  "products": [{
    "id": "…", "slug": "chicken-zinger", "name": "Chicken Zinger",
    "categoryId": "…", "basePricePaise": 18900, "compareAtPricePaise": 22900,
    "imageUrl": "…", "blurhash": "L6Pj0^…", "isVeg": false, "spiceLevel": 2,
    "prepTimeSeconds": 420, "tags": ["BESTSELLER","LATE_NIGHT_DEAL"],
    "rating": { "avg": 4.6, "count": 231 },
    "stock": { "available": true, "lowStock": false },
    "variants": [ { "id": "…", "name": "Double Patty", "priceDeltaPaise": 6000, "isDefault": false } ],
    "modifierGroups": [{
      "id": "…", "name": "Add-ons", "minSelect": 0, "maxSelect": 4, "selectType": "MULTI",
      "modifiers": [ { "id": "…", "name": "Extra Cheese", "priceDeltaPaise": 2000, "maxQty": 2, "isAvailable": true } ]
    }]
  }]
}
```

### 4.3 Cart & pricing

| Method | Path | Notes |
|---|---|---|
| `GET` | `/cart` | Guest carts via `X-Guest-Token` |
| `PUT` | `/cart/items` | Full replace — idempotent by construction, no add/update/delete race |
| `POST` | `/cart/coupon` | Validate + apply; returns the precise failure reason |
| `DELETE` | `/cart/coupon` | |
| `POST` | `/cart/quote` | **The pricing preview.** Same pure function the placement transaction uses — the quoted total and the charged total cannot diverge |

`POST /cart/quote` returns the full breakdown plus `serviceability`, `etaMinutes`, `capacityWarning`,
and `menuVersion`. The client renders exactly what the server computed; it never does its own maths.

### 4.4 Addresses & serviceability

| Method | Path | Notes |
|---|---|---|
| `GET` | `/addresses` | |
| `POST` | `/addresses` | Resolves + stores `zoneId` at write time |
| `PATCH`/`DELETE` | `/addresses/:id` | Soft delete |
| `GET` | `/geo/buildings?lat=&lng=&q=` | Ranked building catalog — the primary address UX |
| `POST` | `/geo/serviceability` | `{ lat, lng }` → `{ serviceable, zone, deliveryFeePaise, minOrderPaise, etaBaselineMinutes }` |
| `POST` | `/geo/out-of-zone-request` | Demand capture for expansion planning |

### 4.5 Orders

| Method | Path | Idem | Notes |
|---|---|---|---|
| `POST` | `/orders` | ✅ | The placement transaction. Returns order + `paymentIntent` |
| `GET` | `/orders` | | Cursor-paginated history |
| `GET` | `/orders/:id` | | Full detail + timeline + live ETA |
| `GET` | `/orders/:id/track` | | Lean polling payload — the socket fallback |
| `POST` | `/orders/:id/cancel` | ✅ | Allowed only while `PLACED`; after `ACCEPTED` it routes to support |
| `POST` | `/orders/:id/reorder` | | Rebuilds a cart, flags unavailable items and price changes |
| `GET` | `/orders/:id/invoice` | | Signed S3 URL, 15-min TTL |
| `POST` | `/orders/:id/partial-decision` | ✅ | Customer's answer when an item goes unavailable |
| `GET` | `/orders/:id/otp` | | Delivery OTP, only while `OUT_FOR_DELIVERY` |

`POST /orders` request:

```jsonc
{
  "addressId": "…",
  "menuVersion": 42,                    // stale → 409 MENU_VERSION_STALE
  "items": [ { "productId":"…", "variantId":"…", "quantity":1,
               "modifiers":[{"modifierId":"…","quantity":2}], "note":"no onions" } ],
  "couponCode": "MIDNIGHT50",
  "walletApplyPaise": 5000,
  "paymentMode": "UPI",
  "type": "INSTANT",                    // or SCHEDULED + scheduledFor
  "tipPaise": 0,
  "customerNote": "Call when you reach the gate",
  "clientLocation": { "lat": 12.82, "lng": 80.04, "accuracyM": 25 }  // fraud signal only
}
```

### 4.6 Payments, wallet, promotions, engagement

| Method | Path | Idem | Notes |
|---|---|---|---|
| `POST` | `/payments/intent` | ✅ | Creates a gateway order for an existing order |
| `POST` | `/payments/verify` | ✅ | Client callback → **optimistic UI only**; DB truth comes from the webhook |
| `GET` | `/payments/methods` | | Enabled methods; COD gated by zone + user risk + admin toggle |
| `GET` | `/wallet` | | Balance + expiring-soon credits |
| `GET` | `/wallet/ledger` | | Paginated, immutable history |
| `GET` | `/referrals` | | Code, share links, earnings, status of each referee |
| `GET` | `/coupons/available` | | Only coupons this user can actually use right now |
| `POST` | `/reviews` | ✅ | One per order, only after `DELIVERED` |
| `GET`/`POST`/`DELETE` | `/favorites` | | |
| `GET`/`PATCH` | `/me` | | Profile + preferences |
| `POST` | `/me/push-subscription` | | Web Push (VAPID) |
| `DELETE` | `/me/account` | | DPDP erasure with a 7-day reversible grace period |
| `GET` | `/me/notifications` | | |

---

## 5. Kitchen API — `kitchen:*` permissions

| Method | Path | Notes |
|---|---|---|
| `GET` | `/kitchen/queue?since=<eventId>` | Active tickets; `since` returns the delta on reconnect |
| `POST` | `/kitchen/orders/:id/accept` | `If-Match` required |
| `POST` | `/kitchen/orders/:id/reject` | Reason enum mandatory; triggers auto-refund |
| `POST` | `/kitchen/orders/:id/start` | → `PREPARING` |
| `POST` | `/kitchen/orders/:id/ready` | → `READY` |
| `PATCH` | `/kitchen/orders/:id/items/:itemId` | Per-item status / mark unavailable |
| `POST` | `/kitchen/orders/:id/print` | Re-print; tolerates an offline printer |
| `POST` | `/kitchen/stock/:productId/disable` | 86 an item — live on the storefront in < 2 s |
| `POST` | `/kitchen/stock/:productId/restock` | `{ qty }` |
| `POST` | `/kitchen/rush-mode` | `{ enabled }` — tightens capacity, extends ETAs |
| `POST` | `/kitchen/heartbeat` | Every 20 s. **Silence drives the escalation ladder** |
| `GET` | `/kitchen/analytics/tonight` | Prep-time p50/p95, accept latency, reject rate |

## 6. Rider API — `delivery:*` permissions

| Method | Path | Idem | Notes |
|---|---|---|---|
| `POST` | `/rider/shift/start` · `/shift/end` | ✅ | Cash drawer opens/closes |
| `GET` | `/rider/tasks` | | Assigned deliveries + optimised stop sequence |
| `POST` | `/rider/deliveries/:id/accept` · `/decline` | ✅ | 45 s window |
| `POST` | `/rider/deliveries/:id/at-kitchen` · `/pickup` | ✅ | |
| `POST` | `/rider/deliveries/:id/complete` | ✅ | `{ otp, lat, lng, codCollectedPaise }` — OTP verified against a pre-fetched hash, works offline |
| `POST` | `/rider/deliveries/:id/fail` | ✅ | Reason enum + photo proof required |
| `POST` | `/rider/location` | | Batched pings, ≤ 1 per 15 s, dropped when stationary |
| `POST` | `/rider/call/:orderId` | | **Masked call** — neither party sees the other's number |
| `GET` | `/rider/earnings` · `/history` | | |

## 7. Admin / Finance / Analytics / Super-admin API

Every endpoint is permission-gated; the table lists the required permission key.

| Method | Path | Permission |
|---|---|---|
| `GET`/`POST`/`PATCH`/`DELETE` | `/admin/products`, `/categories`, `/variants`, `/modifiers` | `menu:read` / `menu:write` |
| `POST` | `/admin/menu/publish` | `menu:publish` |
| `GET`/`POST`/`PATCH` | `/admin/coupons`, `/banners`, `/cms` | `promo:*`, `cms:*` |
| `GET` | `/admin/orders` (rich filters, CSV export) | `orders:read` |
| `POST` | `/admin/orders/:id/cancel` · `/refund` | `orders:cancel` · `orders:refund` + **step-up** |
| `POST` | `/admin/orders/:id/assign-rider` | `delivery:assign` |
| `GET`/`PATCH` | `/admin/users`, `/riders`, `/staff` | `users:*` |
| `POST` | `/admin/users/:id/roles` | `roles:grant` (cannot grant above your own rank) |
| `GET`/`PUT` | `/admin/settings` | `settings:write` |
| `POST` | `/admin/store/pause` · `/holiday` · `/hours` | `store:control` |
| `GET`/`POST` | `/admin/zones`, `/buildings` | `geo:write` |
| `GET` | `/admin/out-of-zone-requests` (expansion heatmap) | `geo:read` |
| `GET` | `/finance/summary?from=&to=` (by `business_date`) | `finance:read` |
| `GET` | `/finance/reconciliation` | `finance:reconcile` |
| `GET` | `/finance/invoices` · `/expenses` · `/cash-drawers` | `finance:read` |
| `POST` | `/finance/expenses` | `finance:write` |
| `GET` | `/finance/export?format=csv\|xlsx` | `finance:export` + audited |
| `GET` | `/analytics/overview` · `/products` · `/customers` · `/funnel` · `/heatmap` · `/retention` · `/cohorts` | `analytics:read` |
| `GET`/`PATCH` | `/superadmin/feature-flags` | `platform:flags` |
| `GET` | `/superadmin/health` · `/queues` · `/redis` · `/logs` · `/errors` | `platform:monitor` |
| `POST` | `/superadmin/backup` | `platform:backup` |
| `POST` | `/superadmin/impersonate/:userId` | `users:impersonate` + **step-up** + reason |
| `GET` | `/superadmin/audit-logs` | `audit:read` |

---

## 8. Webhooks (inbound)

| Path | Source | Verification |
|---|---|---|
| `POST /webhooks/razorpay` | Razorpay | `X-Razorpay-Signature`, HMAC-SHA256, **constant-time compare**, raw body |
| `POST /webhooks/msg91` | SMS | Shared secret + IP allowlist |
| `POST /webhooks/resend` | Email | Svix signature |

**Handler contract — this is money-critical:**

1. Verify signature on the **raw** body *before* JSON parsing. A parsed-then-verified body is not verified.
2. `INSERT payment_webhook_events` with `gateway_event_id` UNIQUE → duplicate = `200 OK`, no-op.
3. **Return `200` immediately.** Process asynchronously via BullMQ. Razorpay retries on slow responses and you get duplicate processing.
4. Idempotent processing keyed on `gateway_event_id`.
5. Failures land in a DLQ with alerting. A payment event must never be silently dropped.

Events consumed: `payment.captured`, `payment.failed`, `payment.authorized`, `refund.processed`,
`refund.failed`, `order.paid`, `settlement.processed`.

**Unknown event types are stored and acknowledged, never rejected** — Razorpay adds events, and a
`400` on an unrecognised type produces an infinite retry loop against our API.

---

## 9. WebSocket API

**Connect:** `wss://api.juicestop.in/ws?ticket=<single-use, 60s>`
Ticket from `POST /realtime/ticket`. **A JWT is never placed in a query string** — it would be written
to NGINX access logs and Cloudflare analytics in plaintext.

### 9.1 Envelope

```jsonc
{ "id":"01J…", "type":"order.status_changed", "v":1,
  "aggregateId":"<orderId>", "aggregateVersion":7,
  "at":"2026-07-27T18:12:03.114Z", "payload":{ … } }
```

### 9.2 Event catalog

| Event | Room | Payload |
|---|---|---|
| `order.placed` | `kitchen:*`, `ops:*` | Full ticket |
| `order.status_changed` | `order:*`, `kitchen:*`, `ops:*` | `{ status, previousStatus, at, actorRole }` |
| `order.eta_updated` | `order:*` | `{ promisedAt, reason }` |
| `order.item_unavailable` | `order:*` | `{ itemId, name, refundPaise, decisionDeadline }` |
| `order.cancelled` | all | `{ reason, refund }` |
| `kitchen.rush_toggled` | `kitchen:*`, `ops:*` | `{ enabled }` |
| `kitchen.heartbeat_lost` | `ops:*` | `{ lastSeenAt, escalationLevel }` |
| `stock.changed` | `kitchen:*`, broadcast | `{ productId, available, qty }` |
| `menu.updated` | broadcast | `{ menuVersion }` → clients hot-swap |
| `delivery.assigned` | `rider:*`, `order:*` | `{ riderName, riderPhotoUrl, vehicle }` |
| `delivery.location` | `order:*` | `{ lat, lng, etaSeconds }` (throttled 15 s; M11, post-launch) |
| `delivery.completed` | `order:*`, `ops:*` | |
| `wallet.credited` | `user:*` | `{ amountPaise, reason, balancePaise }` |
| `notification.new` | `user:*` | |
| `ops.metrics` | `ops:*` | 5 s tick: live orders, revenue, capacity, riders online |

### 9.3 Client → server

| Event | Purpose |
|---|---|
| `subscribe` | `{ room }` — **authorised server-side**; a client never names a room it can't access |
| `unsubscribe` | |
| `heartbeat` | Kitchen liveness; drives the escalation ladder |
| `ack` | `{ eventId }` — kitchen acknowledges, silencing the chime |

### 9.4 The reconnection contract

```
disconnect → exponential backoff (1s, 2s, 4s, 8s, max 15s) + jitter
           → after 15s offline: START REST POLLING (5s interval)
reconnect  → new ticket → resubscribe → GET /<resource>?since=<lastEventId>
           → reconcile by aggregateVersion → stop polling
```

Gaps in `aggregateVersion` trigger a REST refetch of that aggregate. **This is the single rule that
makes the system survive hostel Wi-Fi**, and it is implemented once in `packages/realtime` and shared
by all four apps rather than reimplemented per screen.

---

## 10. Health & operations

| Path | Auth | Purpose |
|---|---|---|
| `GET /health/live` | — | Process alive. Never touches the DB — a DB blip must not trigger a pod restart storm |
| `GET /health/ready` | — | DB + Redis + queue reachable. Gates load-balancer traffic |
| `GET /health/deep` | `platform:monitor` | Gateway reachability, queue depth, replication lag, outbox backlog |
| `GET /metrics` | internal only | Prometheus |
| `GET /docs` | staging only | Scalar/Swagger UI from the generated OpenAPI |

---

## 11. Testing contract

| Layer | Tool | Gate |
|---|---|---|
| Schema | Zod, shared FE/BE | Type errors = build failure |
| Unit | Vitest | Pricing engine tested to the exact paisa, incl. rounding edges |
| Integration | Vitest + **Testcontainers** (real Postgres + Redis) | Every endpoint, real DB, no mocks on the money paths |
| Contract | Pact-style adapter tests | Razorpay adapter verified against recorded fixtures |
| E2E | Playwright | F-01, F-02, F-03, F-04 minimum, on every PR |
| Load | k6 | 100 orders in 60 s; p95 placement < 800 ms |
| Security | `pnpm audit`, Semgrep, ZAP baseline | CI blocking on high severity |

**Non-negotiable:** an endpoint that moves money merges only with an integration test proving
idempotency — issue the same request twice, assert one order, one charge, one ledger entry.
