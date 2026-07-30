# Juice Stop 🌙

**Late-night food ordering for SRM University, Kattankulathur.**
Open 19:00 → 04:00. Delivery to Abode Valley Complex only.

A production-shaped ordering platform — customer storefront, kitchen dashboard, REST API and a
real database — built as a monorepo. Dark-first UI, orange → magenta → violet identity, motion
throughout.

---

## Quick start

```bash
# 1. Prerequisites: Node 24+, pnpm 11+  (corepack enable && corepack prepare pnpm@latest --activate)
pnpm install

# 2. Environment
cp .env.example .env          # dev defaults work as-is; no external accounts needed

# 3. Database — SQLite, a single file. No Docker, no server.
pnpm db:migrate               # creates packages/db/prisma/dev.db
pnpm db:seed                  # 194 menu items, 25 categories, settings, a demo customer

# 4. Run
pnpm dev
```

| Surface | URL | What it is |
|---|---|---|
| **Customer app** | http://localhost:3100 | Storefront — browse, cart, checkout, live tracking |
| **Kitchen board** | http://localhost:3100/kitchen | Staff queue: accept → cook → ready |
| **API** | http://localhost:3000/api/v1 | REST. `/health/ready` should report `database: up` |

> Browsing works 24/7. **Ordering is gated to 19:00–04:00 IST** — that is the business rule, not a
> bug. Outside those hours the menu is fully browsable and the order buttons explain why they are
> disabled. To try the full flow at any hour, change `STORE_OPEN_TIME` / `STORE_CLOSE_TIME` in `.env`.

---

## Repository layout

```
apps/
  web/         Next.js 15 · React 19 · customer storefront + kitchen board
  api/         NestJS · REST, order state machine, three process roles
packages/
  core/        Pure domain primitives — money, business dates, store hours, pricing rules
  db/          Prisma schema, migrations, seed
  config/      Shared tsconfig / ESLint presets
docs/          Architecture, ERD, API spec, design system, roadmap, ADRs
```

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | All apps in watch mode |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Strict TS across the workspace |
| `pnpm test:unit` | Unit tests (103) |
| `pnpm verify` | lint + typecheck + tests + build — **the merge gate** |
| `pnpm db:studio` | Browse the database in a GUI |
| `pnpm db:reset` | Wipe and re-seed |

---

## How it works

**Money is `BigInt` paise. Everywhere.** Never a float, never a rupee in storage. Columns and
variables end in `_paise` / `Paise`. `0.1 + 0.2 !== 0.3`, and every payment bug starts there.

**The service day crosses midnight.** An order at 02:30 belongs to the *previous* night. Reports
key on `businessDate`, computed as `(timestamp IST − 5 hours)::date`, not `created_at::date`.
Without this, every night's takings silently split across two dates.

**One state machine owns `orders.status`.** Controllers request transitions; they never decide
legality. Every transition writes an audit row and an outbox event in the same transaction — so a
socket event can never fire for a transaction that rolls back and put a ghost order on the kitchen
screen.

**The server prices orders, not the client.** Requests carry item IDs; the API looks up what they
actually cost. Trusting client-supplied prices is how a ₹499 combo gets bought for ₹1.

**Customers get 10 minutes to change an order.** During that window the kitchen is *blocked* from
starting — showing "Cooking" for food that might gain two more items is a lie, and once you've lied
about one status nobody believes the next. "Cook it now" closes the window early.

**Capacity is modelled, and intake pauses at 100%.** Refusing an order costs one order; delivering
it 45 minutes late costs the customer. ETAs are computed from live kitchen load, never a flattering
constant.

Full reasoning, including rejected alternatives, is in [`docs/`](./docs) — start with
[`docs/README.md`](./docs/README.md) and [`docs/11-decision-log.md`](./docs/11-decision-log.md).

---

## Imagery

Food photography in `apps/web/public/generated/` is AI-generated. To regenerate or extend:

```bash
cd apps/web
node scripts/generate-assets.ts            # all assets (skips existing)
node scripts/generate-assets.ts burger     # just one
```

Prompts live in `apps/web/src/data/assets.ts` behind a shared house-style string — consistency
comes from reusing it verbatim. The script has a provider seam, so swapping generators is one
function and no component changes.

> **Check the licence terms of whichever generator you use before shipping commercially.**

---

## Status

| Area | State |
|---|---|
| Menu, cart, checkout, tracking | ✅ Working (browser-local state) |
| Kitchen dashboard | ✅ Working, database-backed |
| API — menu, orders, kitchen | ✅ Working |
| Database, migrations, seed | ✅ SQLite |
| Storefront reading from the API | ⚠️ Not yet — reads a local menu file; the DB seed is the same data but they are separate copies |
| Payments | ⚠️ Simulated. No gateway connected; no money moves |
| Accounts / auth | ❌ Not built. Profile is `localStorage` |
| Rider app, admin, analytics | ❌ Not built |

This is **not** production-ready. It is a working, well-architected foundation with the money-path
reasoning already in place.

## Contributing

`pnpm verify` must pass before a PR. Conventions worth knowing:

- Domain logic lives in `packages/core` or a service — never in a component
- Server Components by default; `'use client'` only where interaction demands it
- Animate `transform` / `opacity` only, and honour `prefers-reduced-motion`
- Never write `orders.status` outside the state machine

## Licence

[MIT](./LICENSE) — use it, fork it, ship it. Keep the copyright notice.

Note that the licence covers the **code**. The generated imagery in
`apps/web/public/generated/` is AI-produced; check the terms of whichever generator you use before
relying on it commercially.
