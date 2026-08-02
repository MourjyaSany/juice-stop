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
| Shared domain types → `packages/core` | ✅ | A4 closed. Found and fixed a real bug: the pickup alphabet contained `5` despite claiming otherwise |
| Lifecycle tests | ✅ | 19 new tests, 112 total in `core`. Pricing/state-machine service tests still open |
| Owner dashboard | ✅ | Repeat customers labelled *estimated* (by phone); refunds render **Not tracked** rather than a fake zero |
| Smart inventory | 🔵 Next | — |
| Kitchen rush mode | ⬜ | — |
| Order timers | ✅ | Kitchen and customer now grade through one `phaseUrgency` in `core` |
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
| ~~A4~~ | ~~Five domain types duplicated across web/API~~ — closed | ✅ |
| A5 | No tests for the state machine, pricing, stock or auth — 103 tests are all in `core` | 🟠 |
| A6 | `pnpm verify` cannot pass — ESLint is not installed | 🟠 |
| A7 | `realtime` and `worker` process roles documented but unimplemented | 🟡 |
| A8 | `Setting`, `AuditLog`, `IdempotencyKey` are dead tables | 🟡 |
| A9 | Superseded client-side status simulator still live for legacy local orders | 🟡 |
| A10 | 2 focus-visible styles app-wide; no focus trapping; no skip link | 🟡 |
| A11 | Payments simulated; menu prices are build-time constants | 🟢 |

## Staff accounts (development only)

| Account | Password | Sees |
|---|---|---|
| `owner` | `owner123` | `/admin` — revenue, reports, activity, CSV export. Also has kitchen access |
| `cook` | `cook123` | `/kitchen` only. **403** on every `/admin` endpoint |

Roles are carried inside the signed token and enforced server-side by `@RequireRole('ADMIN')` on
the whole admin controller, so a new endpoint added there is restricted by default.

## Awaiting a decision

| # | Question |
|---|---|
| Q1 | Are *Packed* and *Arriving* real lifecycle states the kitchen presses, or display-only? |
| Q2 | Loyalty economics — points per rupee, tiers, expiry, accrual on discounted orders |
| Q3 | Promotion mechanics — percentage / flat / free item, stacking, order of application vs the ₹100 minimum |
| Q4 | Group ordering — what happens when a participant never pays |
| Q5 | Refunds — is there a real process today, or is the dashboard figure forward-looking? |
