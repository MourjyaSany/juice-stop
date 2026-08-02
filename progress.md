# Progress

Running log of what is built, what is in flight, and what is deliberately not started. Updated at
the end of every feature.

Full reasoning lives in [`docs/`](./docs); the pre-phase audit is
[`docs/13-operational-audit.md`](./docs/13-operational-audit.md).

---

## Shipped

| Milestone | State | Notes |
|---|---|---|
| M0 — foundations | ✅ | Monorepo, strict TS, env validation with production guards, RFC 9457 errors, health checks |
| M1 — catalogue | ✅ | `GET /menu`, Redis-cached with DB fallback, single-source menu package (197 items) |
| M2 — ordering | ✅ | Server-side pricing, 10-min edit window, takeaway, 4 payment methods, state machine |
| M3 — kitchen operations | ✅ | 4-column dashboard, inventory + stock counts, SSE realtime, dev auth, OTP-gated delivery, undo, phase countdowns |
| Frontend redesign | ✅ | Landing, menu, cart, checkout, tracking, profile, scroll-assembled hero |
| One-command setup | ✅ | `scripts/bootstrap.mjs`, verified against a throwaway clone. Guide in `mano.md` |

## Operational Excellence — in progress

| Feature | State | Blocked by |
|---|---|---|
| Repository audit | ✅ | — |
| Shared domain types → `packages/core` | ⬜ Next | — |
| State machine + pricing tests | ⬜ | — |
| Owner dashboard | ⬜ | Repeat customers needs identity; refunds have no data source |
| Smart inventory | ⬜ | — |
| Kitchen rush mode | ⬜ | — |
| Order timers | 🟡 Partly shipped | Kitchen and customer define "late" differently — needs unifying |
| Customer tracking timeline | ⬜ | **Q1** — are *Packed* / *Arriving* real lifecycle states? |
| Takeaway QR + ready notification | ⬜ | — |
| Empty states | ⬜ | — |
| Accessibility pass | ⬜ | — |
| Promotions | ⬜ | **Q3** — discount mechanics |
| Live notifications (customer) | ⬜ | — |
| Customer identity | ⬜ | Prerequisite for the three below |
| Loyalty — Midnight Miles | ⬜ | Identity, **Q2** |
| Group ordering | ⬜ | Identity, **Q4**, real payment gateway |

## Known debt

Detail and evidence in the audit. Severity as assessed there.

| # | Issue | Severity |
|---|---|---|
| A1 | Transactional outbox written but never drained — ADR-006's guarantee is not in force | 🔴 |
| A2 | `GET /orders/:id` unauthenticated; exposes name, phone, address | 🔴 |
| A3 | No customer identity — profile is `localStorage`; `User`/`Address` unused by the API | 🔴 |
| A4 | Five domain types duplicated across web/API | 🟠 |
| A5 | No tests for the state machine, pricing, stock or auth — 103 tests are all in `core` | 🟠 |
| A6 | `pnpm verify` cannot pass — ESLint is not installed | 🟠 |
| A7 | `realtime` and `worker` process roles documented but unimplemented | 🟡 |
| A8 | `Setting`, `AuditLog`, `IdempotencyKey` are dead tables | 🟡 |
| A9 | Superseded client-side status simulator still live for legacy local orders | 🟡 |
| A10 | 2 focus-visible styles app-wide; no focus trapping; no skip link | 🟡 |
| A11 | Payments simulated; menu prices are build-time constants | 🟢 |

## Awaiting a decision

| # | Question |
|---|---|
| Q1 | Are *Packed* and *Arriving* real lifecycle states the kitchen presses, or display-only? |
| Q2 | Loyalty economics — points per rupee, tiers, expiry, accrual on discounted orders |
| Q3 | Promotion mechanics — percentage / flat / free item, stacking, order of application vs the ₹100 minimum |
| Q4 | Group ordering — what happens when a participant never pays |
| Q5 | Refunds — is there a real process today, or is the dashboard figure forward-looking? |
