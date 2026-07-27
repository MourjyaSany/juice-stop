# Juice Stop — Codename `AfterDark`

> Late-night food ordering for SRM University, Kattankulathur.
> Service window **19:00 → ~04:00 IST**. Restricted delivery footprint. Gen-Z / cyberpunk identity.

This directory is the **pre-code engineering plan**. Nothing is built until this is approved.

---

## 0. Read this first — the CTO's honest assessment

The brief asks for enterprise-grade software "that will handle millions of rupees." That framing is
correct, but it points at the wrong risks. Let me put the real ones on the table before we design
around them.

**This system is not scale-constrained. It is throughput- and trust-constrained.**

At a realistic mature state — 300 orders/night × ₹280 AOV × 330 serving nights — this is a
**~₹2.7 crore/year** business running through **one kitchen**. That single fact reshapes everything:

| The brief implies | The reality | What we design instead |
|---|---|---|
| Scale for millions of users | ~400 concurrent users at 23:30 peak, one kitchen | Optimise for **burst correctness**, not horizontal scale |
| Realtime everywhere via WebSockets | Hostel Wi-Fi and 4G drop sockets constantly | Sockets are an **accelerant**; REST is the source of truth. Every screen must self-heal |
| GPS gates who can order | Civilian GPS is ±30–150 m inside concrete buildings | Gate on the **verified delivery address**, use GPS to assist — details in ADR-004 |
| Kitchen dashboard is a screen | It is the **entire business**. If it dies at 01:00, revenue stops | Offline-first PWA, audible escalation, out-of-band fallback to owner's phone |
| Analytics dashboard | Running heavy aggregates on the live DB during service will stall order placement | Nightly rollups post-close + Redis counters for live tiles |
| COD is a payment toggle | Cash + students + riders = the single largest leakage vector | Per-shift cash drawer sessions with variance tracking, from day one |

**The five things most likely to actually hurt us**, in order:

1. **Money divergence.** Razorpay says one thing, our DB says another, the rider's cash bag says a
   third. Mitigated by: integer paise only, webhook-as-truth, idempotency keys everywhere,
   append-only wallet ledger, daily settlement reconciliation. See `10-risk-register.md` R-01.
2. **Kitchen device failure during service.** Mitigated by: offline queue, second device auto-failover,
   escalating audio, WhatsApp fallback to owner. R-03.
3. **Overpromising ETAs.** A student told "25 min" who waits 70 min never orders again. This is the
   #1 retention killer in late-night food. We model **kitchen capacity explicitly** and refuse to
   promise what we can't cook. R-05.
4. **Referral and coupon fraud.** A dense, technically-literate, incentive-hunting population on one
   campus. Referral farms will appear in week one. R-07.
5. **Semester-break seasonality.** SRM empties out. Revenue can drop **80–90% for 4–8 weeks**, twice
   a year. This is a cash-flow risk, not a code risk — but the forecasting model must know the
   academic calendar or every projection we build will be a lie. R-12.

Everything in this plan is downstream of that list.

---

## 1. Document index

| # | Document | What it answers |
|---|---|---|
| 01 | [System Architecture](./01-system-architecture.md) | How the pieces fit; runtime topology; state machines; realtime; consistency guarantees |
| 02 | [Data Model & ERD](./02-data-model.md) | Every table, every relationship, indexing, money & business-date rules |
| 03 | [User Flows](./03-user-flows.md) | 14 end-to-end flows including every failure branch |
| 04 | [API Specification](./04-api-spec.md) | REST surface, WebSocket event catalog, webhooks, error contract |
| 05 | [Folder Structure](./05-folder-structure.md) | Monorepo layout, module boundaries, dependency rules |
| 06 | [UI Wireframes](./06-wireframes.md) | Screen-by-screen layout for all six surfaces |
| 07 | [Design System](./07-design-system.md) | `AfterDark` tokens, type, motion, components, accessibility |
| 08 | [Sprint Roadmap](./08-roadmap.md) | M0→M11 · **launch at M6, ~week 20** · acceptance criteria, DoD |
| 09 | [Deployment Architecture](./09-deployment.md) | Environments, CI/CD, infra topology, cost, runbooks |
| 10 | [Risk Register](./10-risk-register.md) | 24 risks, scored, owned, mitigated |
| 11 | [Decision Log (ADRs)](./11-decision-log.md) | 14 architectural decisions with rejected alternatives |

---

## 2. Product shape at a glance

**Six surfaces, four deployable frontends:**

| Surface | App | Device reality | Availability need |
|---|---|---|---|
| Customer | `apps/web` | Phone, one-handed, in bed, bad Wi-Fi | High — but a failure loses one order |
| Kitchen | `apps/kitchen` | Wall tablet, greasy fingers, 3 m away, loud | **Critical — a failure stops the business** |
| Rider | `apps/rider` | Phone, moving, one-handed, helmet, sun/dark | Critical during dispatch |
| Admin + Finance + Analytics + Super Admin | `apps/admin` | Laptop, desk, deliberate | Low — can be down during service |

They are separate apps because their **device targets and availability requirements genuinely
differ** — not for tidiness. Justified in ADR-002.

**Backend:** one NestJS **modular monolith** with hard internal module boundaries, deployed as three
process types (API, socket gateway, worker) from one image. Not microservices. Justified in ADR-001.

---

## 3. Non-negotiable engineering invariants

These are enforced by lint rules, DB constraints, and CI — not by discipline.

1. **Money is `BigInt` paise. Never a float, never a `Decimal` in app code, never rupees in the DB.**
   Column names end in `_paise`. A lint rule bans `number` typed money.
2. **The payment gateway webhook is the only source of payment truth.** Client-side success callbacks
   may only optimistically advance the *UI*, never the DB.
3. **Every mutating endpoint accepts and enforces `Idempotency-Key`.** Mobile networks retry. We must
   not create two orders or two refunds.
4. **Order status changes only through the server-side state machine.** No `UPDATE orders SET status`
   anywhere outside `OrderStateMachine`. Every transition writes an `order_status_events` row.
5. **Side effects emit through the transactional outbox.** A socket event must never fire for a
   transaction that later rolls back — that puts a ghost order on the kitchen screen.
6. **Prices and item names are snapshotted onto `order_items` at placement.** Editing the menu at
   01:00 must not retroactively change a placed order.
7. **`business_date`, not `created_at::date`.** The service day crosses midnight. Every financial and
   analytical query keys on `business_date`. See `02-data-model.md §3`.
8. **The wallet is an append-only ledger.** `wallets.balance_paise` is a cached projection,
   reconciled nightly against the sum of `wallet_ledger_entries`. Never mutated directly.
9. **Stock decrements are atomic and durable in Postgres**, guarded by `CHECK (available_qty >= 0)`.
   Redis caches stock; it never owns it.
10. **Every privileged action writes an immutable `audit_logs` row** with actor, IP, before/after.

---

## 4. Scope boundaries for v1

**In:** everything in the brief, phased across M0–M11. The **launch cut ends at M6 (~week 20)**;
everything else ships post-launch. The full not-building-for-launch list is in `08-roadmap.md`.

**Explicitly deferred, with rationale** (so we don't pretend these are free):

| Deferred | Why | Revisit at |
|---|---|---|
| Ingredient-level inventory (recipes/BOM) | Product-level stock covers 95% of the operational need; BOM needs disciplined kitchen data entry that a 3-person night crew will not sustain on day one | Post-launch, once ops is stable |
| Native mobile apps | PWA with push, install prompt, and offline shell covers the use case; two app-store review cycles at launch is a tax we can't afford | Post-launch, if push delivery on iOS proves inadequate |
| Multi-outlet / franchise | Schema is multi-tenant-*ready* (`outlet_id` on the relevant tables from day one) but no UI or routing for it | When outlet #2 is real |
| Rider live-location on customer map | Needs continuous GPS + battery + a map bill; a good ETA countdown satisfies 90% of the anxiety at 5% of the cost | M11, measured against support-ticket volume |
| Stripe as an active gateway | The port + adapter abstraction ships in M2 so it's a 2-day swap; Razorpay is correct for INR/UPI today | If we ever take international cards |

---

## 5. How we build after approval

Per the brief: **milestone by milestone, each leaving the project fully working and deployable.**

For every milestone:
1. Migrations first, reviewed for expand/contract safety.
2. Contracts (`packages/contracts`) before implementation — FE and BE agree on types before code.
3. Backend module + tests → frontend feature → E2E happy path + the two nastiest failure paths.
4. Milestone gate: `pnpm verify` green (lint, typecheck, unit, integration, e2e, build), docs updated,
   deployed to staging, demoed.
5. Then, and only then, the next milestone.

No milestone merges with a red gate. No "we'll fix it next sprint" on the money paths.

---

## 6. Locked decisions — approved 27 Jul 2026

These are **project requirements**, not proposals. They change only on explicit instruction.

| # | Decision | Detail |
|---|---|---|
| **Team** | Solo developer + AI assistance | Architecture, tooling and process optimised for one person. Minimum operational burden, production-grade code. **ADR-016** |
| **Infra** | Lean topology, staged spend | Next.js (Vercel at launch) · NestJS on DigitalOcean BLR · managed Postgres · managed Redis · Cloudinary · Razorpay · Resend · GitHub Actions. **Build phase runs at ₹0** on free tier. AWS migration must require minimal application change. **ADR-017**, `09-deployment.md §4b` |
| **ADR-004** | Serviceability on the **verified delivery address** | GPS assists only: suggest nearest saved address · detect distance from delivery address · aid accurate address entry. `strictGpsGating` implemented, **disabled by default** |
| **ADR-013** | Capacity intake pause, **amended** | < 80% normal · **≥ 80% warn with wait estimate before checkout** · **80–100% queue with progressively increasing ETAs** · **100% pause** · admin manual override, **audit-logged**, auto-expires in 30 min |

### Product direction — **ship over completeness**

Built for a real business. A feature with high complexity and low launch value goes to the
post-launch backlog. Priority order, which sequences the entire roadmap:

```
1. Customers can order and pay reliably      → M1, M2
2. Kitchen receives + manages orders live    → M3
3. Delivery workflow works smoothly          → M4
4. Admin manages menu, pricing, inventory    → M5
5. Analytics and business intelligence       → M9  (post-launch)
```

**Target: launch at ~week 20.** Full plan and the explicit not-building-for-launch list in
`08-roadmap.md`.

### Working agreement

Build feature by feature without pausing for further architectural approval. Escalate only when a
decision would **fundamentally alter the product** or **introduce significant business risk** — for
example: a change to how money is handled, a new external dependency on a money path, a legal or
compliance obligation, or a scope change that moves the launch date.
