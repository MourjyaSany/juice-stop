# 11 — Architecture Decision Log

Fifteen decisions, each with the alternatives I rejected and why. When someone asks in eight months
"why is it like this?", the answer lives here — and if the context changes, the reversal is informed
rather than accidental.

Format: **Status · Context · Decision · Rejected alternatives · Consequences.**

---

## ADR-001 · Modular monolith, not microservices

**Status:** Accepted

**Context.** The brief implies enterprise scale, and "enterprise" is routinely read as
"microservices". The actual system: one kitchen, one team, one deploy cadence, a hard throughput
ceiling of a few hundred orders a night. Critically, the core operation — place an order — spans
stock, coupons, wallet, capacity, orders and payments **in one atomic unit**.

**Decision.** A single NestJS application with strictly enforced internal module boundaries
(`eslint-plugin-boundaries`), deployed as three process roles (`api`, `realtime`, `worker`) from one
image.

**Rejected alternatives.**
- *Microservices per domain* — the order placement transaction would become a distributed saga with
  compensating actions across five services. We would be buying eventual consistency, a service mesh,
  distributed tracing complexity and five deploy pipelines to solve a scaling problem **we do not
  have**. The correctness cost is real; the scaling benefit is zero at one kitchen.
- *Serverless functions* — cold starts at 23:30 peak are unacceptable, and long-lived WebSocket
  connections fit the model badly.

**Consequences.** One deploy unit, real ACID transactions, trivial local development. In exchange we
must be disciplined about boundaries — hence CI enforcement. Extraction later is mechanical because
modules already communicate only through public service interfaces.

**Revisit when:** a second outlet with independent operations exists, or the team exceeds ~8 engineers.

---

## ADR-002 · Monorepo with four separate frontend apps

**Status:** Accepted

**Context.** Six surfaces: customer, kitchen, rider, admin, finance, analytics.

**Decision.** pnpm + Turborepo monorepo. **Four** frontends: `web` (customer), `kitchen`, `rider`,
`admin` — with finance, analytics and super-admin as RBAC-gated route groups *inside* `admin`.

**Rejected alternatives.**
- *One app with role-based routing* — the kitchen tablet would download admin chart libraries; an
  admin deploy at 23:00 would risk the kitchen. Unacceptable coupling for the one surface that cannot
  fail.
- *Six separate apps* — finance, analytics and super-admin share a device target (desk), a navigation
  shell and a deploy cadence. Splitting them duplicates the shell four times for nothing.
- *Polyrepo* — shared contracts would drift within weeks. The contracts package is precisely what
  makes the monorepo worth it.

**Consequences.** Each app gets a bundle budget matched to its device. Kitchen and rider ship
offline-first PWAs without penalising the customer bundle. Cost: monorepo tooling, mitigated by Turbo's
caching.

---

## ADR-003 · All money as `BIGINT` paise

**Status:** Accepted · **Non-negotiable**

**Context.** This system will process crores of rupees. IEEE-754 cannot represent `0.1` exactly.

**Decision.** Every monetary value is an integer count of paise, in `BIGINT` columns suffixed
`_paise` and `bigint` in TypeScript. Formatting to "₹359.10" happens **only** at the render boundary.

**Rejected alternatives.**
- *`DECIMAL(10,2)`* — correct in the database, but Prisma surfaces it as `Decimal`, and a single
  careless `Number(x)` in application code silently reintroduces float error. Integers cannot be
  wrong by accident.
- *Floats* — never, under any circumstances.

**Consequences.** A custom ESLint rule fails the build if any identifier matching `/paise/i` is typed
`number`. `bigint` needs explicit JSON serialisation (handled once in a global interceptor). Every
developer must internalise "the number is paise" — the naming convention makes that automatic.

---

## ADR-004 · Serviceability is decided on the verified delivery address, not the live device GPS

**Status:** ✅ **LOCKED** — approved 27 Jul 2026 · Deviates from the literal brief, flagged and accepted

**Context.** The brief states: *"Only users whose GPS location falls inside the configured delivery
polygon should be allowed to place orders."* The intent is right — no deliveries outside the zone.
The literal mechanism has two failure modes:

1. **False rejections.** Civilian GPS is ±30–150 m inside concrete hostel buildings. A student in
   their own room in Tower C gets rejected because their phone thinks they're across the road. This
   rejects real, paying customers at the worst possible moment.
2. **It gates the wrong thing.** A student in the library at 23:00 ordering to their hostel room is
   completely normal and high-value. Their device position is irrelevant — **the rider goes to the
   address, not to the phone.**

**Decision.** Three layers: PostGIS polygons are authoritative; a curated building catalog with
operator-verified coordinates is the UX; **serviceability is evaluated against the chosen delivery
address**.

GPS has exactly three jobs, all assistive, none gating:

1. **Suggest the nearest saved address** when the customer opens checkout.
2. **Detect that the user is far from the delivery address** — raises a soft fraud flag for review at
   > 3 km. It records; it never blocks.
3. **Help add a new address accurately** — pre-selects the nearest building and pre-fills the map pin.

A `strictGpsGating` feature flag implements the literal brief behaviour. It is **implemented, tested,
and disabled by default.**

**Rejected alternatives.**
- *Literal device-GPS gating* — rejects legitimate customers, is trivially spoofed by anyone
  motivated, and blocks nothing a determined bad actor would do.
- *Free-text addresses with no catalog* — riders get lost, delivery times blow out, and zone
  assignment becomes guesswork.

**Consequences.** Zone integrity is preserved (we still only deliver inside the polygon) while
false rejections are eliminated. Requires an operational investment: someone must curate and verify
the building catalog. That work also produces gate instructions and per-building ETA adjustments,
which measurably improve delivery times — so it pays for itself.

**If you want the literal behaviour, flip the flag** — the code path is built and tested. I recommend
against it, and this ADR is where that recommendation is recorded.

---

## ADR-005 · The payment webhook is the only source of payment truth

**Status:** Accepted · **Non-negotiable**

**Context.** Razorpay signals success twice: a browser-side callback and a server-side webhook. The
callback is attacker-controllable and unreliable (the user closes the tab, the network dies).

**Decision.** The client callback advances the **UI optimistically and nothing else**. Order and
payment state change only on a signature-verified webhook. A reconciliation job polls Razorpay every
2 minutes for 30 minutes to cover missed webhooks.

**Rejected alternatives.**
- *Trust the client callback* — a forged callback is free food. This is the most common serious
  vulnerability in Indian e-commerce integrations.
- *Poll only* — adds latency to the kitchen and hammers the gateway API.

**Consequences.** Occasionally a 1–3 s "Confirming payment…" state. Handled with an honest live
indicator rather than a fake success. Webhook handlers must verify on the **raw** body before
parsing, respond `200` immediately, and process asynchronously.

---

## ADR-006 · Transactional outbox for all side effects

**Status:** Accepted

**Context.** Emitting a socket event or enqueuing a job inside a database transaction that later
rolls back puts a **ghost order on the kitchen screen** — a ticket for an order that does not exist.
The kitchen cooks it. We eat the cost, and trust in the board is gone.

**Decision.** Domain transactions write to `outbox_events` in the same commit. A relay in the worker
process polls every 250 ms (`FOR UPDATE SKIP LOCKED`, batches of 100) and dispatches to Socket.IO,
BullMQ and analytics. At-least-once delivery; consumers are idempotent on `event.id`.

**Rejected alternatives.**
- *Emit directly from the service* — the ghost-order problem above; also loses events on a crash
  between commit and emit.
- *Postgres `LISTEN/NOTIFY`* — no durability, no replay, payload size limits, lost on disconnect.
- *Kafka / a real event bus* — enormous operational weight for one kitchen.

**Consequences.** ~250 ms added latency to fan-out (well inside our 1.5 s kitchen budget) in exchange
for guaranteed delivery. Outbox backlog is a monitored health signal.

---

## ADR-007 · `READ COMMITTED` with explicit row locks, not `SERIALIZABLE`

**Status:** Accepted

**Context.** Order placement mutates stock, coupon counters, capacity slots and wallet balances
concurrently. At 23:30 peak, many orders land within the same few seconds.

**Decision.** `READ COMMITTED` plus explicit `SELECT ... FOR UPDATE`, with rows always locked in a
deterministic order (ascending `product_id`) to prevent deadlocks. Correctness is additionally
guaranteed by database constraints — `CHECK (available_qty >= 0)`, unique redemption constraints —
so even a logic bug cannot oversell.

**Rejected alternatives.**
- *`SERIALIZABLE`* — Postgres would abort conflicting transactions with serialisation failures
  exactly at peak, producing retry storms precisely when we can least afford them. The retry logic
  would be harder to reason about than the explicit locks.
- *Optimistic concurrency alone* — high contention on hot items (the bestseller everyone orders)
  causes excessive retries.
- *Redis-based locking* — Redis is a cache. Placing correctness of money and stock behind a
  non-durable store is how you lose both.

**Consequences.** Predictable lock behaviour we can reason about and test. Requires discipline about
lock ordering — documented at the transaction and covered by a concurrency integration test that
fires simultaneous orders for the last unit and asserts exactly one wins.

---

## ADR-008 · Sockets are hints; REST is truth

**Status:** Accepted · **The decision that makes the product survive its environment**

**Context.** SRM hostel Wi-Fi and campus 4G drop connections constantly. A realtime design that
assumes delivery produces the worst failure mode available: a kitchen screen that silently stops
updating while looking perfectly healthy.

**Decision.** Every socket event carries a monotonic `aggregateVersion`. Clients apply an event only
if it is exactly `known + 1`; a gap triggers a REST refetch of that aggregate. Every socket-delivered
view has a REST endpoint that can rebuild it from scratch. Offline for more than 15 s → automatic
REST polling. Reconnect → `?since=<lastEventId>` for the delta.

**Rejected alternatives.**
- *Trust socket delivery* — silent divergence, the failure that is invisible until it's expensive.
- *Polling only* — 2–5 s latency to the kitchen is operationally poor and wastes battery.
- *Server-Sent Events* — unidirectional; the kitchen needs to send heartbeats and acks.

**Consequences.** Slightly more client logic, implemented **once** in `packages/realtime` and shared
by all four apps. In return, an entire category of realtime bugs simply cannot occur.

---

## ADR-009 · UUIDv7 primary keys

**Status:** Accepted

**Context.** Need globally unique, non-enumerable identifiers that don't leak order volume to
competitors (sequential integers announce exactly how many orders you did last night).

**Decision.** UUIDv7 — random-looking but **time-ordered**.

**Rejected alternatives.**
- *`BIGSERIAL`* — leaks volume; awkward for offline-generated ids in the kitchen and rider apps.
- *UUIDv4* — random inserts scatter across the B-tree, causing page splits and index bloat that
  degrade write throughput measurably as tables grow.
- *ULID as a string* — 26 bytes vs 16, and loses native `uuid` type support.

**Consequences.** Sequential insert locality with UUID opacity. Human-facing identifiers are separate
and friendly: `JS-270726-0417`.

---

## ADR-010 · `business_date` as a generated stored column

**Status:** Accepted

**Context.** Service runs 19:00 → 04:00, crossing midnight. `created_at::date` splits every night's
takings across two calendar dates. Finance, analytics and every "today" query would be wrong from day
one — and wrong in a way nobody notices for months.

**Decision.** A generated stored column:
`((created_at AT TIME ZONE 'Asia/Kolkata') - INTERVAL '5 hours')::date`, on every financial and
operational table, indexed.

**Rejected alternatives.**
- *Compute in application code* — every query author must remember. One who forgets produces a
  plausible-looking wrong number.
- *A nullable column set on insert* — drifts on backfills and admin-created orders.
- *A view* — cannot be indexed usefully for the query patterns we need.

**Consequences.** Impossible to get wrong. The 5-hour offset places the cutover at 05:00 IST, one
hour past close. If closing time ever moves past 05:00, this constant must change — noted in the
migration header.

---

## ADR-011 · Price snapshots on order items + immutable menu versions

**Status:** Accepted

**Context.** The menu changes during service — price updates, items 86'd. An order placed at 23:40
must not be affected by a 23:45 price change.

**Decision.** `order_items` stores `name_snapshot`, `unit_price_paise`, `modifiers_snapshot` and
`gst_rate_bps` at placement. Orders reference an immutable `menu_versions` row. A checkout carrying a
stale `menuVersion` returns `409 MENU_VERSION_STALE` with an explicit price diff requiring
re-confirmation.

**Rejected alternatives.**
- *Join to the live product at read time* — historical orders and invoices would silently change when
  prices change. That is a GST compliance failure, not just a bug.
- *Soft-delete products and never update prices* — unusable for a real menu.

**Consequences.** Storage duplication (negligible). Invoices are permanently reproducible. A customer
is never charged a price they weren't shown.

---

## ADR-012 · Append-only wallet ledger; balance is a projection

**Status:** Accepted

**Context.** The wallet holds real customer money from refunds and referrals. A mutable balance column
has no audit trail, and a lost update silently destroys or creates money.

**Decision.** `wallet_ledger_entries` is append-only (trigger-enforced), each row recording direction,
amount, reason, reference and `balance_after_paise`. `wallets.balance_paise` is a cached projection.
A nightly job asserts `SUM(credits) − SUM(debits) === balance` for every wallet; **any drift is a P0**.

**Rejected alternatives.**
- *Mutable balance only* — unauditable, and any bug is unrecoverable because there's no history to
  replay.
- *Full double-entry accounting* — correct, but heavier than a single-outlet store wallet needs.
  The ledger above gives us the audit trail and reconstruction ability that actually matter, and
  upgrading to full double-entry later is additive.

**Consequences.** Every balance is reconstructible from history. Disputes are answerable with facts.
The nightly assertion catches money bugs on the night they appear, not at the annual audit.

---

## ADR-013 · Explicit kitchen capacity model with intake pause

**Status:** ✅ **LOCKED** — approved 27 Jul 2026 **with amendments** (thresholds tightened, admin override added)

**Context.** A kitchen has a hard throughput ceiling. Accepting unlimited orders at 23:30 doesn't
increase capacity; it converts a queue into a pile of angry, cold-food customers.

**Decision.** 10-minute `capacity_slots` with `max_orders` and `max_items`. ETAs derive from live
queue depth. Four graduated bands:

| Load | Behaviour |
|---|---|
| **< 80%** | Normal. Quoted ETA from live queue depth |
| **≥ 80%** | **Warn.** Storefront banner + an explicit wait estimate shown **before** checkout, never after payment |
| **80–100%** | **Queue with progressively increasing ETAs.** Orders still accepted; each successive order carries a longer, honest promise |
| **100%** | **Intake pauses** — *"Kitchen's at capacity. Back in ~15 min 🔥"* — until load drops |

**Admin manual override:** an admin may force intake open during a pause in exceptional situations.
Every override is **audit-logged** with actor, reason, timestamp and the load level at the moment of
override, and auto-expires after 30 minutes so it cannot be left on and forgotten.

The customer is always told the estimated wait *before* they pay. That is the invariant this ADR
exists to protect.

**Rejected alternatives.**
- *Accept everything, let ETAs stretch* — the standard approach, and the reason late-night delivery
  has such poor retention. A 70-minute wait after a 25-minute promise loses the customer forever.
- *Manual pause only* — depends on a chef noticing while cooking. They won't.

**Consequences.** We will visibly turn away orders on the busiest nights. That is the point: refusing
an order costs one order; delivering it 45 minutes late costs the customer, their floor, and the
Instagram story. The 80–100% queueing band softens this considerably — we only hard-stop at true
saturation. Capacity numbers are seeded conservatively in M2 and tuned against real kitchen
throughput during the launch rollout.

---

## ADR-014 · Razorpay primary behind a gateway port/adapter

**Status:** Accepted

**Context.** The brief asks for a "Stripe-ready payment abstraction" and Razorpay integration. Indian
students pay by UPI; Stripe does not serve Indian UPI well.

**Decision.** A `PaymentGateway` port in the domain, with `RazorpayAdapter` (live), `CashAdapter`
(COD) and `StripeAdapter` (implemented against the port, contract-tested, dormant).

**Rejected alternatives.**
- *Razorpay SDK calls scattered through services* — a gateway change becomes a rewrite, and the
  domain becomes untestable without network mocks.
- *Building Stripe live now* — carrying cost for a capability with no user. The port makes it a
  ~2-day activation when a reason appears.

**Consequences.** The domain never imports a vendor SDK. Gateway swap is an adapter, not a migration.
Note the commercial reality recorded in `09-deployment.md §4`: **UPI carries zero MDR by regulation in
India while cards cost ~2%** — the checkout defaults to UPI, and that single choice is worth more to
the bottom line than most engineering optimisations in this document.

---

## ADR-015 · No production deploys during service hours

**Status:** Accepted

**Context.** The business runs 19:00 → 04:00. A bad deploy at 23:30 doesn't cost a rollback — it costs
the night.

**Decision.** CI refuses production deploys outside **04:30 – 18:00 IST**. Override requires an
`emergency-deploy` label, a written incident reference, and two approvals. Emergency response order:
**feature-flag kill switch → config change → code deploy**, and if a deploy during service is truly
unavoidable, `PAUSE ORDERS` goes on first.

**Rejected alternatives.**
- *Deploy anytime with blue/green* — blue/green protects against a failed boot, not against a logic
  bug that mis-prices an order or breaks the kitchen queue. Those only appear under real traffic,
  which is exactly what we'd be risking.
- *No restriction* — someone ships "a small fix" at midnight. It is always a small fix.

**Consequences.** Requires planning and a real feature-flag system (shipped in M5, before launch) so
behaviour can change without shipping code. That constraint is a feature: it forces genuinely safe
release practice.

---

## ADR-016 · Optimise for a one-person engineering team

**Status:** ✅ **LOCKED** — approved 27 Jul 2026

**Context.** One developer with AI assistance builds and operates this. Every architectural choice
now has a second axis beyond correctness: **how much of this will I have to hold in my head, debug at
2 AM, and operate alone?**

**Decision.** Bias every decision toward reducing operational surface and cognitive load, without
lowering production quality:

- **Managed over self-hosted** wherever the price is defensible. There is no DBA.
- **One deploy unit** (ADR-001). One `docker compose up` reproduces production locally.
- **Boring, well-documented technology.** No component whose failure mode I'd have to learn during
  an incident.
- **Constraints enforced by tooling, not discipline** — boundary lint, the `paise`/`bigint` rule, the
  migration linter, `CHECK` constraints, the DB-level total-arithmetic invariant. A solo developer
  has no reviewer; the machine is the reviewer.
- **Contracts as the single source of truth** (`packages/contracts`) so frontend and backend cannot
  drift while one person context-switches between them.
- **Runbooks written before they're needed**, because the on-call rotation is one deep.
- **Milestones ≤ 3 weeks, always ending on a green `main`.** No long-lived branches — there is nobody
  to merge for you.

**On AI-assisted code specifically:** generated code is reviewed as if it came from an unknown
contractor. On money paths, the test is written first and the implementation is read line by line.
Speed of generation is not evidence of correctness, and the failure mode of AI-assisted work is
*plausible* code, which is exactly the kind that survives a casual review and fails in production.

**Rejected alternatives.**
- *Build as if a team existed* — microservices, elaborate CI matrices, heavy process. All overhead
  paid by one person for coordination benefits that do not apply.
- *Cut quality to move faster* — the money paths are unforgiving, and a solo developer has the least
  capacity to absorb a production incident. Rigour where it matters is what makes solo viable, not
  what slows it down.

**Consequences.** Some deliberate "over-engineering" (outbox, idempotency, audit, boundary
enforcement) is justified precisely *because* the team is small — these are the mechanisms that let
one person safely change a system they wrote four months ago and no longer remember.

---

## ADR-017 · Staged infrastructure spend

**Status:** ✅ **LOCKED** — approved 27 Jul 2026

**Context.** The mature lean topology costs ~₹17,600/month. Paying that during a five-month build,
before a single rupee of revenue, is capital burned on capacity nobody is using.

**Decision.** Spend is staged against risk (detail in `09-deployment.md §4b`):

| Phase | Cost/month | Rationale |
|---|---|---|
| **Build** (M0–M5) | **₹0** — Oracle Cloud Always Free + free-tier Postgres + Cloudflare Free | Nothing is at risk yet |
| **Pilot** (M6+) | **≈ ₹4,000** — managed Postgres with PITR + SMS/OTP | Buys durability and phone verification, nothing else |
| **Scale** (300+/night) | ≈ ₹17,600 — full Option A | Paid from revenue |

Three constraints make this safe rather than reckless:
1. **Vercel Hobby is a licence violation for a commercial product.** Next.js is self-hosted during
   the build; Vercel Pro is bought at launch if the DX earns it.
2. **No free tier that scales to zero may host the API.** Cold starts of 30–50 s at 22:30 are
   disqualifying. Oracle Always Free does not spin down.
3. **Managed Postgres with real PITR is the first money spent.** Free-tier backup guarantees are
   too thin for a system holding money — R-01 and R-11 are not survivable on best-effort backups.

**Rejected alternatives.**
- *Pay for the mature stack from day one* — ~₹70,000 burned across the build phase for zero benefit.
- *Stay entirely free through launch* — accepts an unacceptable data-loss risk the moment real orders
  and real money exist.

**Consequences.** Zero infrastructure cost during the build. Portability is a hard requirement, not
an aspiration: multi-arch containers, vanilla Postgres + PostGIS with no vendor extensions, standard
Redis, media behind an upload port, payments behind the `PaymentGateway` port. **No provider SDK is
imported outside an adapter**, enforced by the module boundary rules. Provider moves change
orchestration and environment variables only.

---

## Decisions deliberately deferred

| Question | Deferred because | Revisit at |
|---|---|---|
| Read replica for analytics | Nightly rollups make it unnecessary at this volume | 800+ orders/night |
| Native iOS/Android apps | PWA covers the need; two review cycles at launch is a tax we can't afford | Post-launch, if iOS push proves inadequate |
| Ingredient-level inventory (BOM) | Requires disciplined data entry a 3-person night crew won't sustain | After ops stabilises |
| Multi-outlet routing | Schema is ready (`outlet_id` everywhere); UI is not | When outlet #2 is real |
| Kafka / real event bus | The outbox covers our delivery guarantees | If we ever split into services |
| Rider live location on the customer map | A good countdown satisfies most of the anxiety at a fraction of the cost | M11, measured against support volume |
