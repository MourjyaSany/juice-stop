# 13 — Operational Excellence: repository audit

**Date:** 2 August 2026
**Scope:** whole repository, before any Operational Excellence work begins.
**Method:** static inspection plus a full test and build run. Every claim below cites a file, a
command output, or both. Where I could not verify something, it says so.

---

## 1. What exists today

**16,919 lines** of first-party TypeScript.

| Area | Files | Lines | State |
|---|---:|---:|---|
| `apps/web/src` | 62 | 11,304 | Customer storefront + kitchen dashboard |
| `apps/api/src` | 36 | 3,318 | NestJS — catalog, ordering, kitchen, auth, realtime |
| `packages/core/src` | 10 | 1,355 | Money, business date, store hours, pricing |
| `packages/menu/src` | 1 | 536 | The catalogue — 197 items, 26 categories |
| `packages/db` | 6 | 288 | Prisma schema, 4 migrations, seed |

### Completed milestones

- **M0 — foundations.** Monorepo, strict TS, env validation with production guards, RFC 9457
  errors, health endpoints.
- **M1 — catalogue.** `GET /menu`, Redis-cached with DB fallback, single-source menu package.
- **M2 — ordering.** Server-side pricing, 10-minute edit window, takeaway, four payment methods,
  order state machine as sole writer of `orders.status`.
- **M3 — kitchen operations.** Four-column dashboard, inventory with stock counts, SSE realtime,
  dev authentication, OTP-gated delivery, undo, phase countdowns.
- **Frontend redesign.** Landing, menu, cart, checkout, tracking, profile — plus the
  scroll-assembled hero.

### Route and endpoint surface

10 customer/kitchen pages; 10 controllers exposing ~22 endpoints, including two SSE streams
(`/kitchen/stream`, `/storefront/stream`).

---

## 2. Findings

Ordered by what would hurt a real restaurant first.

### 🔴 A1 — The transactional outbox is written but never drained

`ordering.service.ts:265` and `:546` write `OutboxEvent` rows inside the order transaction, exactly
as ADR-006 requires. **Nothing ever reads them.** There is no publisher, no worker, no relay.

```
$ grep -rn "outboxEvent" apps/api/src
modules/ordering/ordering.service.ts:265:      await tx.outboxEvent.create({
modules/ordering/ordering.service.ts:546:      await tx.outboxEvent.create({
```

Realtime is delivered by a **separate, in-process** `RealtimeService.publish()` call made *after*
the transaction commits. So the guarantee ADR-006 exists to provide — that a committed order always
produces its event — is not actually in force. If the API dies between commit and publish, the
event is lost and nothing replays it. The kitchen's 15-second REST reconcile is what really saves
us, not the outbox.

Two honest options: build the relay, or drop the outbox writes and document that reconcile is the
delivery guarantee. Writing rows nobody reads is worse than either, because it looks like a
guarantee that is not one. The table also grows unbounded.

### 🔴 A2 — `GET /orders/:id` is unauthenticated

`ordering.controller.ts` exposes order reads with no guard. The response includes customer name,
phone, and full delivery address. IDs are cuids so they are not trivially enumerable, but that is
obscurity, not access control. Already flagged; still open; blocks any real deployment.

### 🔴 A3 — No customer identity at all

The customer profile lives in `localStorage`. `User` and `Address` tables exist and are seeded but
the API never reads them (`prisma.user` appears only in the seed). Consequences that matter for
this phase:

- **Loyalty cannot work.** Points must attach to a person, and there is no person.
- **Repeat-customer metrics cannot work.** The dashboard asks for "Repeat Customers"; with no
  identity, orders cannot be grouped by customer. Phone number is the only available proxy and it
  is unverified.
- **Group ordering has no way to identify participants.**

### 🟠 A4 — Domain types are duplicated across the web/API boundary

Five concepts are defined twice, in full, with no shared source:

| Concept | API | Web |
|---|---|---|
| Order statuses | `order-state-machine.ts:9` | `store/orders.ts:33` |
| `PaymentMethod` | `ordering.service.ts:39` | `store/orders.ts:71` |
| `FulfilmentType` | `ordering.service.ts:41` | `store/orders.ts:65` |
| Pickup-token minting | `ordering.service.ts` | `store/orders.ts` |
| Order-number format | `ordering.service.ts` | `store/orders.ts` |

`packages/core` is the obvious home and already exports money, dates, store hours and pricing.
These five belong there. Right now adding a status means editing two files in two apps and hoping.

### 🟠 A5 — Test coverage stops at the boundary of the risky code

103 tests pass. **All of them are in `packages/core` plus the env schema.**

```
packages/core  93 tests   money, business-date, store-hours, pricing-config
apps/api       10 tests   env schema only
```

Zero tests for: the order state machine, pricing from the database, the edit-window gate, stock
reconciliation, OTP verification, kitchen auth, or any React component. The two things the README
calls invariants — *the state machine is the only writer of status*, and *the server prices orders*
— are both untested. `canTransition` is pure and would take twenty minutes to cover properly.

### 🟠 A6 — `pnpm verify` cannot pass

ESLint is not installed anywhere in the workspace, yet three packages declare `"lint": "eslint src"`.

```
$ ls node_modules/.bin | grep eslint
  (nothing)
```

So the documented merge gate fails at the first step. Either install and configure ESLint or stop
claiming a gate that does not run.

### 🟡 A7 — Two of three process roles are unimplemented

`main.ts:19` documents "one image, three process roles (ADR-001)" and `env.schema.ts:24` accepts
`api | realtime | worker`. Only `api` does anything; `realtime` merely selects a different port.
There is no worker. This is directly relevant: the outbox relay (A1), scheduled reports, and
notification delivery all belong in `worker`.

### 🟡 A8 — `Setting` and `AuditLog` are dead tables

`Setting` is seeded and never read. `AuditLog` is never touched at all. The schema comments promise
"typed accessors live in the platform module" — that module does not exist. This matters now
because **Promotions requires exactly this**: admin-configurable behaviour with no code change. The
table is there; the accessor layer is not.

`IdempotencyKey` is likewise unused, so a retried checkout on a flaky campus connection can create
two orders. Not observed in testing, but nothing prevents it.

### 🟡 A9 — A superseded status simulator is still live

`store/orders.ts:346-380` still contains the original client-side timeline that *infers* status
from elapsed time. It only runs for orders with no `serverStatus` — i.e. records saved to
`localStorage` before the storefront talked to the API. It is unreachable for new orders but will
quietly produce fictional statuses for anyone with an old order in their browser. It needs a
deliberate decision: keep with a comment, or delete and show those orders as historical.

### 🟡 A10 — Accessibility is uneven

61 `aria-*` attributes and 8 dialogs with `aria-modal`, which is a decent base. But:

- **2 focus-visible declarations in the entire app.** Keyboard focus is effectively invisible.
- No skip link.
- Modals do not trap focus (verified by reading `item-sheet.tsx` and `cart-drawer.tsx` — both
  handle Escape and body-scroll lock, neither traps Tab).
- Reduced motion is honoured in 13 files, which is genuinely good.

### 🟢 A11 — Minor

- `cinematic-still.tsx` is unused (0 references) since the burger hero landed.
- Payments are simulated; `paymentStatus` is hardcoded `PAID` at `ordering.service.ts`.
- The storefront renders the menu from `packages/menu` at build time; only availability is live.
  Prices therefore need a redeploy to change — acceptable today, wrong once an owner can edit them.
- No `progress.md` existed before this phase.

---

## 3. Architectural risks for this phase

| Risk | Why it bites now |
|---|---|
| **No identity** | Loyalty, repeat customers and group ordering all assume a customer exists. This is the single largest blocker in the new feature list. |
| **No worker role** | Scheduled reports, notification delivery and the outbox relay have nowhere to live. |
| **No settings accessor** | Promotions is "configure without code changes", which is precisely a settings layer. |
| **SQLite** | Analytics over a growing order table is fine at campus volume, but `groupBy` + date maths in SQLite is limited. Acceptable now; the ceiling is real. |
| **Client-side menu** | An owner editing prices from the admin panel cannot work while prices are build-time constants. |

---

## 4. Feature-to-architecture mapping

How each requested feature lands on what already exists. **Reuse** means no new concept.

### Owner dashboard
- **Reuse:** `KitchenStatsService` (already does business-date-scoped `groupBy`), `Money`,
  `toBusinessDate`, `RealtimeService` for the live feed.
- **New:** `modules/analytics` — revenue, AOV, peak hour, top products, trends, CSV export.
- **Blocked:** *Repeat Customers* needs A3. Interim: group by `customerPhone`, labelled as an
  estimate. *Refunds* has no data source — payments are simulated (A11).

### Smart inventory
- **Reuse:** `InventoryService`, `stockRemaining`, the `inventory.changed` event, the existing
  Inventory page.
- **New:** today's sales per product (from `OrderItem` by business date), burn-rate projection for
  "estimated sell-out time", a 20-left preset.
- **Note:** extending, not replacing. The reconciliation invariant in `applyStock` stays the single
  writer.

### Kitchen rush mode
- **Reuse:** the dashboard, `useKitchenStream`, `KitchenStatsService.waiting`.
- **New:** a density mode derived from queue depth. Pure presentation — no new data.

### Order timers
- **Already built.** `PHASE_ETA_SECONDS` (50/40/25/15) and four-band urgency shipped last phase.
  Remaining gap: the *kitchen* card grades against `promisedAt` while the *customer* grades against
  phase allowances. Two different definitions of "late" on one order. Should be unified in
  `packages/core`.

### Customer tracking timeline
- **Reuse:** `ORDER_FLOW`, `orderProgress`, `useOrderSync`.
- **New:** *Packed* and *Arriving* are requested but **do not exist in the state machine**. Adding
  them is a schema and state-machine change affecting every consumer. See open question Q1.

### Loyalty — Midnight Miles
- **Blocked on A3.** Needs `User`, points ledger, reward catalogue, redemption. Largest single item.

### Group ordering
- **Blocked on A3** for identity, plus split payment which needs a real gateway.

### Takeaway experience
- **Mostly built:** token, countdown, instructions. **New:** QR rendering, ready notification.

### Promotions
- **Reuse:** `Setting` table (A8), `COMMERCIAL_TERMS`.
- **New:** settings accessor + rule evaluation in pricing. Must run **server-side** — a client-side
  discount is a discount customers can mint themselves.

### Notifications
- **Reuse:** `useChime`, `RealtimeService`.
- **New:** a customer-side channel. Cannot reuse the kitchen stream — it carries every order's PII.

### Empty states
- **Reuse:** `EmptyState` in `components/ui`. Copy-level work.

### Accessibility / performance
- Cross-cutting. Focus-visible and focus trapping are the concrete gaps (A10).

---

## 5. Open questions — business decisions I should not invent

These change what gets built, so I will implement around them and flag rather than guess.

- **Q1 — Timeline steps.** *Packed* and *Arriving* are new lifecycle states. Does the kitchen press
  a **Packed** button between Ready and Out-for-delivery? Or are they display-only sub-states of
  what already exists? The first is a real workflow change for staff.
- **Q2 — Loyalty economics.** Points per rupee, reward tiers, expiry, and whether points accrue on
  discounted orders. Getting this wrong is a direct margin cost.
- **Q3 — Promotion mechanics.** Percentage, flat amount, or free item? Do promotions stack? Do they
  apply before or after the ₹100 minimum?
- **Q4 — Group ordering payment.** If one participant never pays, does the order proceed? Who is
  liable for delivery?
- **Q5 — Refunds.** No refund concept exists anywhere. The dashboard asks for a refund figure — is
  there a real refund process today, or is this forward-looking?

---

## 6. Recommended order of work

Value first, and unblock the blockers early.

1. **Shared domain types → `packages/core`** (A4). Small, and everything downstream benefits.
2. **State machine + pricing tests** (A5). Cover the invariants before changing behaviour near them.
3. **Owner dashboard.** Highest requested value; depends only on existing data.
4. **Smart inventory.** Extends a working feature; immediate daily value.
5. **Rush mode + empty states + accessibility.** Presentation-layer, low risk, high perceived polish.
6. **Settings accessor → promotions.** Unlocks Q3 once answered.
7. **Customer identity.** The big one. Unblocks loyalty, repeat customers, group ordering.
8. **Loyalty, then group ordering.** Only after 7.

Deliberately **not** doing: rewriting the outbox decision (A1) without a call from you, and adding
lifecycle states (Q1) without confirmation.
