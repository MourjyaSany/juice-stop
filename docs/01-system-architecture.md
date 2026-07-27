# 01 — System Architecture

**Codename:** AfterDark · **Region:** ap-south-1 (Mumbai) · **Timezone:** Asia/Kolkata (UTC+05:30, no DST)

---

## 1. Architectural style

**A modular monolith with enforced internal boundaries, deployed as three process types.**

```
                          ONE CODEBASE  ·  ONE IMAGE  ·  THREE PROCESS ROLES

   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
   │  role=api        │    │  role=realtime   │    │  role=worker     │
   │  HTTP / REST     │    │  Socket.IO       │    │  BullMQ consumer │
   │  stateless, N×   │    │  sticky, N×      │    │  + cron, 1–2×    │
   └──────────────────┘    └──────────────────┘    └──────────────────┘
            └────────────────────┬───────────────────────┘
                                 │  same NestJS app, ROLE env var
                                 │  selects which modules bootstrap
```

Why not microservices — the full argument with rejected alternatives is in **ADR-001**. The short
version: one kitchen, one deploy cadence, one team, and a domain where cross-entity transactions
(order + payment + stock + wallet + coupon) are the *normal* case, not the exception. Distributed
transactions here would buy us nothing and cost us correctness. Module boundaries are enforced by
`eslint-plugin-boundaries` so that extraction later is mechanical rather than archaeological.

---

## 2. Runtime topology

```
                                  ┌─────────────────────┐
                                  │     Cloudflare      │
                                  │  DNS · WAF · CDN    │
                                  │  DDoS · Bot mgmt    │
                                  └──────────┬──────────┘
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
          ┌─────────▼─────────┐    ┌─────────▼─────────┐   ┌──────────▼─────────┐
          │ juicestop.in      │    │ kitchen.juicestop │   │ admin.juicestop.in │
          │ apps/web          │    │ apps/kitchen      │   │ apps/admin         │
          │ Next.js 15 RSC    │    │ Next.js PWA       │   │ Next.js            │
          │ (+ rider.…)       │    │ offline-first     │   │ (RBAC route groups)│
          └─────────┬─────────┘    └─────────┬─────────┘   └──────────┬─────────┘
                    └────────────────────────┼────────────────────────┘
                                             │  HTTPS + WSS
                                  ┌──────────▼──────────┐
                                  │       NGINX         │
                                  │  TLS · gzip/br      │
                                  │  ip_hash for /ws    │
                                  │  rate-limit zone L1 │
                                  └──────────┬──────────┘
                    ┌────────────────────────┼────────────────────────┐
          ┌─────────▼─────────┐    ┌─────────▼─────────┐   ┌──────────▼─────────┐
          │  NestJS  role=api │    │ role=realtime     │   │ role=worker        │
          │  2 replicas       │    │ 2 replicas        │   │ 1 replica          │
          │  /api/v1/*        │    │ /ws  (Socket.IO)  │   │ BullMQ + cron      │
          └─────────┬─────────┘    └─────────┬─────────┘   └──────────┬─────────┘
                    └────────────────────────┼────────────────────────┘
            ┌────────────────┬───────────────┴────────┬──────────────────┐
   ┌────────▼────────┐ ┌─────▼──────┐ ┌───────────────▼──┐ ┌─────────────▼────────┐
   │  PostgreSQL 16  │ │  Redis 7   │ │  S3 / Cloudinary │ │  External services   │
   │  + PostGIS      │ │  cache     │ │  invoices, KYC   │ │  Razorpay · MSG91    │
   │  Multi-AZ, PITR │ │  BullMQ    │ │  menu images     │ │  Resend · Google Maps│
   │  (source of     │ │  SIO adptr │ │                  │ │  Web Push (VAPID)    │
   │   truth)        │ │  rate-lim  │ │                  │ │                      │
   └─────────────────┘ └────────────┘ └──────────────────┘ └──────────────────────┘
```

**Observability sidecars:** Pino → Loki · OpenTelemetry → Tempo · Prometheus → Grafana · Sentry.

---

## 3. Backend module map

Modules are vertical slices. Each owns its tables and exposes a service interface; **no module
reaches into another module's repositories.** Cross-module reads go through the owning module's
service; cross-module writes go through domain events.

```
src/
├── core/                     # cross-cutting, no domain knowledge
│   ├── config              env schema (zod), typed config service
│   ├── database            PrismaService, transaction manager, tenancy guard
│   ├── cache               Redis client, namespaced key builder, tag invalidation
│   ├── queue               BullMQ registration, retry/backoff policy
│   ├── outbox              transactional outbox writer + relay
│   ├── idempotency         Idempotency-Key interceptor + store
│   ├── audit               audit interceptor, append-only writer
│   ├── logging             Pino, request-id, PII redaction
│   ├── telemetry           OTel, metrics registry
│   ├── errors              AppError hierarchy → HTTP problem+json
│   └── security            helmet, CORS, CSRF, throttler, sanitizer
│
├── identity/                 # OWNS users, sessions, roles, permissions, otp
│   ├── auth                 phone-OTP · google · email · guest · staff
│   ├── tokens               access/refresh issuance, rotation, reuse detection
│   ├── rbac                 permission registry, guards, decorators
│   └── sessions             device sessions, revocation
│
├── catalog/                  # OWNS categories, products, variants, modifiers, menu_versions
│   ├── menu                 read model, publish/version, cache tags
│   ├── availability         per-item enable/disable, time-window availability
│   └── search               debounced search, synonyms, zero-result logging
│
├── inventory/                # OWNS product_stock, stock_movements
│   └── atomic reservation, release, auto-disable-at-zero
│
├── geo/                      # OWNS service_zones, buildings, addresses
│   ├── zones                PostGIS polygon ops, serviceability
│   └── addresses            catalog-first address book, verification
│
├── ordering/                 # OWNS carts, orders, order_items, order_status_events
│   ├── cart                 pricing engine entry point
│   ├── pricing              subtotal → discount → fees → tax → total (pure, tested to the paisa)
│   ├── placement            the transaction: reserve stock, take payment intent, create order
│   ├── state-machine        the ONLY writer of orders.status
│   ├── capacity             slot booking, honest ETA computation
│   └── scheduling           future-dated orders
│
├── kitchen/                  # OWNS kitchen_tickets, stations, prep timers
│   └── queue, accept/reject, rush mode, station routing, print
│
├── delivery/                 # OWNS trips, deliveries, riders, shifts, location_pings
│   └── assignment, batching, OTP proof, failure handling, distance
│
├── payments/                 # OWNS payments, refunds, webhook_events, settlements
│   ├── gateway              PaymentGateway PORT
│   ├── razorpay             adapter (primary)
│   ├── stripe               adapter (dormant, contract-tested)
│   ├── cash                 COD adapter + drawer sessions
│   └── reconciliation       settlement ingest, three-way match
│
├── wallet/                   # OWNS wallets, wallet_ledger_entries
│   └── append-only ledger, hold/capture/release
│
├── promotions/               # OWNS coupons, coupon_redemptions, referrals
│   └── rule evaluation, per-user caps, fraud velocity checks
│
├── reviews/                  # OWNS reviews, product_rating_aggregates
├── notifications/            # OWNS notifications, push_subscriptions, templates
├── finance/                  # OWNS invoices, expenses, cash_drawer_sessions  (read-heavy on others)
├── analytics/                # OWNS analytics_* rollups   (read-only elsewhere)
├── cms/                      # OWNS banners, cms_blocks
├── admin/                    # thin orchestration over other modules; no tables of its own
└── platform/                 # OWNS settings, feature_flags, store_hours, outbox, health
```

**Dependency rule (CI-enforced):** `core` ← every module. Domain modules may depend on `core` and on
*other modules' public service interfaces only*. `admin`/`analytics`/`finance` may read broadly.
Nothing may import from `admin`.

---

## 4. The order lifecycle — two state machines, not one

A single linear status is the classic mistake here: a rider can be pre-assigned *before* food is
ready, and one rider can carry three orders. Conflating those into one enum produces impossible
states within a month.

### 4.1 `Order.status` — what the customer sees

```
                    ┌──────────┐
                    │  DRAFT   │  (cart converted, not yet paid)
                    └────┬─────┘
                         │ checkout
                    ┌────▼─────────────┐
              ┌─────┤ AWAITING_PAYMENT │──── timeout 10m ──▶ ┌─────────────────┐
              │     └────┬─────────────┘                     │ EXPIRED         │
              │          │ webhook: captured                 └─────────────────┘
    gateway   │     ┌────▼─────┐
    failed    └────▶│  PLACED  │◀──── COD confirmed ────┐
    ┌─────────────┐ └────┬─────┘                        │
    │PAYMENT_FAILED│     │ kitchen accepts              │
    └─────────────┘ ┌────▼──────┐                       │
                    │ ACCEPTED  │──┐                    │
                    └────┬──────┘  │ kitchen rejects    │
                         │         ▼                    │
                    ┌────▼──────┐ ┌──────────┐          │
                    │ PREPARING │ │ REJECTED │──┐       │
                    └────┬──────┘ └──────────┘  │       │
                         │                      │       │
                    ┌────▼──────┐               │  ┌────▼─────────────┐
                    │  READY    │               ├─▶│ REFUND_PENDING   │
                    └────┬──────┘               │  └────┬─────────────┘
                         │ delivery picked up   │       │
                    ┌────▼──────────────┐       │  ┌────▼──────┐
                    │ OUT_FOR_DELIVERY  │       │  │ REFUNDED  │
                    └────┬──────────────┘       │  └───────────┘
                         │ OTP verified         │
                    ┌────▼──────┐               │
                    │ DELIVERED │               │
                    └────┬──────┘               │
                         │ +30 min or review    │
                    ┌────▼──────┐               │
                    │ COMPLETED │               │
                    └───────────┘               │
                                                │
    CANCELLED_BY_CUSTOMER (only while PLACED) ──┤
    CANCELLED_BY_ADMIN    (any pre-DELIVERED) ──┤
    DELIVERY_FAILED       (from OUT_FOR_DELIVERY)┘
```

### 4.2 `Delivery.status` — what the rider sees (independent axis)

```
UNASSIGNED ──▶ ASSIGNED ──▶ ACCEPTED_BY_RIDER ──▶ AT_KITCHEN ──▶ PICKED_UP
                   │                                                  │
                   │ rider declines / times out                       ▼
                   └──────────▶ UNASSIGNED                    EN_ROUTE ──▶ DELIVERED
                                                                  │
                                                                  ├─▶ FAILED_NO_ANSWER
                                                                  ├─▶ FAILED_WRONG_ADDRESS
                                                                  └─▶ FAILED_REFUSED
```

A `Trip` groups 1–N deliveries for batching. `Order.status = OUT_FOR_DELIVERY` is derived from its
delivery reaching `PICKED_UP` — the mapping lives in one place, `OrderStateMachine.syncFromDelivery()`.

### 4.3 Transition enforcement

```ts
// ordering/state-machine/transitions.ts  — the single source of legality
type Transition = {
  from: OrderStatus; to: OrderStatus;
  actors: ActorRole[];              // who may perform it
  guard?: (o: Order, ctx: Ctx) => Result<void>;  // domain preconditions
  effects: DomainEvent[];           // written to outbox in the SAME transaction
};
```

Every transition:
1. Loads the order `FOR UPDATE` (row lock, prevents concurrent kitchen+admin action).
2. Checks `optimistic version` matches the caller's expectation.
3. Validates actor role + permission.
4. Runs the guard.
5. Writes `orders.status`, `orders.version + 1`, an `order_status_events` row, and outbox events —
   **one transaction**.

Illegal transitions return `409 ORDER_TRANSITION_INVALID` with the current status, so a stale kitchen
tablet gets a precise, self-healing error rather than silently corrupting state.

---

## 5. Realtime architecture

### 5.1 The core principle

> **Sockets deliver *hints*. REST delivers *truth*. Every client must be able to reconstruct its
> entire view from REST alone.**

This is the difference between a demo and a product. On SRM hostel Wi-Fi, sockets will drop
mid-service, repeatedly. A design that trusts socket delivery produces the worst possible failure:
a kitchen screen that silently stops showing new orders while looking perfectly healthy.

### 5.2 Event envelope

```ts
type RealtimeEvent<T> = {
  id: string;              // ULID, for dedupe
  type: string;            // 'order.status_changed'
  v: 1;                    // event schema version
  aggregateId: string;     // order id
  aggregateVersion: number;// monotonic per aggregate
  at: string;              // ISO8601
  payload: T;
};
```

Client reducer logic, identical across all four apps (`packages/realtime`):

```
on(event):
  known = store.version(event.aggregateId)
  if event.aggregateVersion <= known        -> drop (duplicate / out of order)
  else if event.aggregateVersion == known+1 -> apply payload optimistically
  else                                      -> GAP DETECTED: refetch the aggregate over REST
```

Gaps are *expected*, not exceptional. This single rule removes an entire class of bugs.

### 5.3 Connection & safety nets

| Mechanism | Purpose |
|---|---|
| Short-lived WS ticket (`POST /realtime/ticket`, 60 s TTL, single-use) | Never put a JWT in a query string — it lands in NGINX access logs |
| Redis Streams adapter (`@socket.io/redis-streams-adapter`) | Multi-replica fan-out **with replay**, so a reconnecting client recovers missed events |
| Heartbeat 20 s / timeout 45 s | Detect dead hostel Wi-Fi fast |
| Client polling fallback | If socket down > 15 s, kitchen and rider apps poll REST every 5 s. Degraded, never dead |
| `since` cursor on reconnect | `GET /kitchen/queue?since=<lastEventId>` returns the delta |
| Presence heartbeat from kitchen | If no kitchen client has pinged in 90 s during service → escalate (see §5.5) |

### 5.4 Rooms

| Room | Members | Events |
|---|---|---|
| `order:{orderId}` | the customer, admins | `order.status_changed`, `order.eta_updated`, `delivery.location` |
| `kitchen:{outletId}` | kitchen devices, admins | `order.placed`, `order.cancelled`, `kitchen.rush_toggled`, `stock.changed` |
| `rider:{riderId}` | one rider | `delivery.assigned`, `delivery.reassigned`, `trip.updated` |
| `dispatch:{outletId}` | admins, dispatchers | everything delivery-related |
| `ops:{outletId}` | admins | live metrics tick, alerts |
| `user:{userId}` | that user, all devices | `wallet.credited`, `notification.new` |

Room membership is authorised **server-side on join** against RBAC. A client never names its own room.

### 5.5 Kitchen liveness escalation — the business-critical path

```
no kitchen heartbeat for 90s during service window
   └─▶ L1: bright banner on admin dashboard + ops room alert
no heartbeat for 180s
   └─▶ L2: push + SMS to on-duty manager
no heartbeat for 300s  OR  an order sits in PLACED for > 6 min unaccepted
   └─▶ L3: WhatsApp + phone-call trigger to owner,
           AND auto-enable "high load" mode (extends quoted ETAs, throttles intake)
```

This runs in the worker process, independent of the API. It is the difference between "we lost 20
minutes of orders" and "we lost the night."

---

## 6. Consistency & correctness mechanisms

### 6.1 Order placement transaction

The most important 200 lines in the system.

```
BEGIN;
  1. Re-validate cart against CURRENT menu_version   -- prices may have changed since page load
  2. Re-check store open + zone serviceable + capacity slot available
  3. SELECT product_stock FOR UPDATE  (ordered by product_id — deadlock avoidance)
     UPDATE ... SET available_qty = available_qty - :qty
        WHERE available_qty >= :qty            -- CHECK (available_qty >= 0) as belt+braces
     -> 0 rows affected = OUT_OF_STOCK, roll back with the offending item named
  4. Evaluate + lock coupon (INSERT coupon_redemptions, UNIQUE (coupon_id, user_id, order_id)
     and a per-user counter check inside the tx)
  5. Debit wallet if applied  (INSERT wallet_ledger_entries; balance projection updated)
  6. Book capacity slot (UPDATE capacity_slots SET booked = booked + 1 WHERE booked < max)
  7. INSERT orders (status = AWAITING_PAYMENT | PLACED for COD) + order_items with SNAPSHOTS
  8. INSERT outbox_events ['order.created']
COMMIT;
-- outside the transaction:
  9. Create gateway order (Razorpay) — if this fails, order auto-expires in 10 min and releases stock
```

Isolation: `READ COMMITTED` + explicit row locks. `SERIALIZABLE` was considered and rejected —
retry storms at 23:30 peak are worse than the explicit locking we can reason about (ADR-007).

**Compensation:** a worker job `orders.expire-unpaid` runs every 60 s, and for any order in
`AWAITING_PAYMENT` past its 10-minute deadline: releases stock, releases the capacity slot, reverses
the wallet debit, releases the coupon redemption, sets `EXPIRED`. Every release is itself idempotent.

### 6.2 Transactional outbox

```
 domain tx ──writes──▶ outbox_events (unpublished)
                              │
              relay (worker, every 250ms, SKIP LOCKED batch of 100)
                              │
              ┌───────────────┼───────────────┬──────────────────┐
              ▼               ▼               ▼                  ▼
        Socket.IO       BullMQ jobs      Analytics buffer     Audit trail
       (kitchen etc)  (notifications)     (Redis counters)
```

At-least-once delivery; all consumers are idempotent on `event.id`.

### 6.3 Idempotency

`Idempotency-Key` (client-generated ULID) required on: order placement, payment capture, refund,
wallet credit, coupon redemption, rider delivery confirmation, staff bulk actions.

Stored as `(key, user_id, endpoint, request_hash) → response_snapshot`. Replay with the **same** body
returns the original response verbatim; replay with a **different** body returns
`422 IDEMPOTENCY_KEY_REUSED`. TTL 24 h.

### 6.4 Caching layers

| Layer | Content | Invalidation |
|---|---|---|
| Cloudflare edge | static assets, images, `/menu` HTML | on deploy hash + tag purge on publish |
| Next.js RSC cache | menu page, category pages | `revalidateTag('menu:v{n}')` on publish |
| Redis (API) | menu snapshot JSON, zone polygons, settings, feature flags | version bump key on write; never TTL-only |
| Redis (counters) | live stock, live order counts, rate-limit buckets | natural |
| React Query | client state | `staleTime` per resource + socket-driven invalidation |

**Menu versioning:** the menu is published as an immutable `menu_versions` row with a full JSONB
snapshot. Clients hold `menuVersion`; a mismatch at checkout triggers a re-price and an explicit
"prices changed" confirmation rather than a silent charge difference.

---

## 7. Capacity & honest ETA — the retention engine

Naive systems quote a fixed "30–40 min." Then 40 orders land at 23:15 and everyone gets a lie.

```
promisedAt = now
           + queueDrainTime(currentLoad, stationThroughput)   -- from kitchen module
           + itemPrepTime(order.items, parallelism)           -- max, not sum, within a station
           + packagingBuffer
           + riderAssignmentWait(onlineRiders, pendingPickups)
           + travelTime(zone.eta_baseline OR Maps Distance Matrix, cached per building)
           + confidenceBuffer(p80 of last 200 comparable orders)
```

Backed by `capacity_slots`: each 10-minute slot has `max_orders` and `max_items` (admin-tunable, and
auto-tightened when the kitchen enables **Rush Mode**). When slots saturate:

1. **< 80%** — normal, ETAs track live queue depth.
2. **≥ 80%** — storefront warns (*"Kitchen's slammed — 45+ min tonight"*) with an explicit wait
   estimate shown **before** checkout, never after payment.
3. **80–100%** — orders still accepted, but **queued with progressively increasing ETAs**. Each
   successive order carries a longer, honest promise.
4. **100%** — **intake pauses** with `"Kitchen's at capacity. Back in ~15 min 🔥"` rather than
   accepting orders we cannot cook.

An admin may **manually override** a pause in exceptional situations. Every override is audit-logged
with actor, reason and load level, and auto-expires after 30 minutes.

Refusing an order we can't serve is cheaper than a 70-minute delivery. Locked as ADR-013.

---

## 8. Geofencing & serviceability

Three-layer model. The full rationale, including where I deviate from the brief's literal wording,
is in **ADR-004**.

```
Layer 1 — SERVICE ZONE (authoritative)
  PostGIS geography(Polygon,4326) per zone. ST_Contains decides serviceability.
  Zones carry: delivery_fee, min_order, eta_baseline, cod_enabled, priority.

Layer 2 — BUILDING CATALOG (the UX layer)
  Curated, pre-verified: Abode Valley towers, SRM hostel blocks, named apartments, registered PGs.
  Each has an operator-verified lat/lng and a zone_id. The customer picks their building, then
  room/flat + floor + landmark. This is how Swiggy and Zomato actually do it.

Layer 3 — GPS (assistive + anti-fraud, NOT the gate)
  On address creation: GPS pre-selects the nearest building and pre-fills the map pin.
  At checkout: if device GPS is > 3 km from the chosen address, we RECORD a soft flag for fraud
  review — we do NOT block. A student ordering from the library for their hostel room is a
  completely normal, high-value behaviour.
```

**Serviceability is decided on the delivery address's verified coordinates**, because that is where
the rider actually goes. A `strictGpsGating` feature flag exists to enable literal device-GPS gating
if you want it; it defaults **off**, and I'd recommend leaving it off.

Out-of-zone response, with the brief's copy:

```
🌙  "You're a little outside our midnight kingdom"
    We only deliver around Abode Valley & nearby SRM hostels right now.
    [ Notify me when you're covered ]   ← captures demand + maps expansion
```

That capture list is how we decide zone #2 with data instead of guesswork.

---

## 9. Store hours & the business day

Service window **19:00 → 04:00 IST**, crossing midnight. This breaks every naive date query.

```
business_date = (created_at AT TIME ZONE 'Asia/Kolkata' - INTERVAL '5 hours')::date
```

An order at 02:30 on 28 Jul belongs to business date **27 Jul**. The 5-hour offset puts the cutover
at 05:00 IST — one hour of slack past the 04:00 close. It is a Postgres **generated stored column**
so it can never drift from application logic, and it is indexed on every financial table.

Open/closed resolution order:
1. `settings.force_closed` (panic switch — instant, one click, reason shown to customers)
2. `store_overrides` for today's business date (holiday, private event, "Diwali — closed")
3. `store_hours` weekly template
4. Capacity gate (§7)
5. Kitchen presence (§5.5) — no live kitchen device during service means **no new orders**

Pre-open behaviour is a product opportunity, not an error state: show the countdown
(*"Doors open in 2h 14m"*), let customers browse, build a cart, and **schedule** an order for 19:05.
Those pre-orders are free revenue and let the kitchen prep before the rush.

---

## 10. Security architecture

Full controls in `09-deployment.md §7`; the architecture-level shape:

**Two authentication realms, deliberately separate.**

| | Customer realm | Staff realm |
|---|---|---|
| Methods | Phone OTP (primary), Google, Email+password, Guest (phone-verified) | Email + password + **mandatory TOTP** for admin/finance/super-admin |
| Access token | 10 min, in-memory only, never localStorage | 10 min |
| Refresh token | 30 d, httpOnly · Secure · SameSite=Lax cookie, **rotated on every use** | 12 h, plus absolute 24 h cap |
| Session binding | device id + UA fingerprint | + IP range for admin, + device pinning for kitchen kiosks |
| Reuse detection | A replayed refresh token revokes the **entire token family** and alerts | same |
| Step-up | — | Re-auth required for refunds, payouts, role grants, impersonation |

**RBAC:** roles are bundles of granular permissions (`orders:refund`, `menu:publish`,
`finance:export`, `users:impersonate`). Guards check *permissions*, never role names — so a new role
never requires a code change.

Seed roles: `CUSTOMER`, `KITCHEN_STAFF`, `KITCHEN_LEAD`, `RIDER`, `DISPATCHER`, `SUPPORT`,
`FINANCE`, `ADMIN`, `SUPER_ADMIN`.

**Impersonation** (super-admin only): time-boxed to 30 min, produces a distinct token with
`act_as` + `impersonator_id` claims, **blocks all financial mutations and password/2FA changes**,
renders a permanent red banner, and writes an audit row on start, on every action, and on end.

---

## 11. Observability & SLOs

| SLI | Target | Alert |
|---|---|---|
| Order placement p95 latency | < 800 ms | > 1.5 s for 5 min |
| Kitchen event delivery p95 (commit → tablet render) | < 1.5 s | > 4 s for 2 min |
| Payment webhook processing p99 | < 3 s | any DLQ entry |
| API availability during service window | 99.9 % | 2 consecutive health-check failures |
| Unaccepted orders older than 6 min | 0 | any, immediately |
| Razorpay ↔ DB settlement mismatch | ₹0 | any non-zero at the 05:30 reconcile |
| Wallet ledger vs. balance projection drift | ₹0 | any, immediately (this means a bug in money) |

Structured logs carry `request_id`, `user_id`, `order_id`, `business_date`. PII (phone, email, address,
OTP, tokens) is redacted at the Pino serialiser — redaction is unit-tested, because a log leak is a
breach.

---

## 12. Performance strategy

| Concern | Approach |
|---|---|
| Menu render | RSC + edge cache; the entire menu is < 60 KB JSON — ship it whole, filter client-side. Zero API calls to change category |
| Images | Cloudinary `f_auto,q_auto,dpr_auto` + Next `<Image>`, AVIF/WebP, blurhash placeholders |
| Bundle | Route-level code splitting; Framer Motion imported via `LazyMotion` + `domAnimation` (~4.6 KB vs 34 KB) |
| Kitchen queue | Virtualised; only active orders in memory; completed orders drop out of the store |
| Search | 250 ms debounce, client-side over the cached menu — **no network round trip at all** |
| Order tracking | One socket + a local countdown timer; no polling in the happy path |
| DB | Explicit indexes (`02-data-model.md §7`); every service-hours query proven index-only via `EXPLAIN` in CI |
| Analytics | Rollups at 05:30 post-close; live tiles from Redis counters. Never aggregate over `orders` during service |
| Cold start | Long-lived containers, not serverless, for the API — a 2 s cold start at 23:30 is unacceptable |

---

## 13. Failure modes designed for

| Failure | Behaviour |
|---|---|
| Razorpay down | Auto-switch to COD-only with a banner; queue payment retries; never lose the cart |
| Redis down | API stays up: cache misses fall through to Postgres; sockets degrade to polling; rate-limiting falls back to in-memory per-instance |
| Postgres primary failover | 60–90 s of `503` with a friendly retry screen; in-flight orders recover from the WAL; no client-side data loss because the cart is also local |
| Kitchen offline | Orders keep accepting for 90 s, then escalation ladder (§5.5) and intake pause |
| Rider app offline | Deliveries queue locally; OTP verification works offline against a pre-fetched hash; syncs on reconnect |
| Google Maps quota exceeded | Fall back to per-zone static ETA baselines; distances from cached building-pair matrix |
| SMS provider down | Fall back to WhatsApp → then email → then in-app only; OTP login degrades to Google/email |
| Customer loses connection mid-checkout | Idempotency key means the retry joins the same order rather than creating a second |

---

## 14. What "done" means architecturally

A milestone is architecturally complete when:
- every new table has an owning module and no cross-module repository access,
- every mutation is idempotent or provably safe to retry,
- every money path has a test asserting exact paise,
- every new socket event has a REST equivalent that can rebuild the same state,
- every privileged action writes an audit row,
- and `EXPLAIN` on every new service-hours query shows an index.
