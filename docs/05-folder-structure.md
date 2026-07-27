# 05 — Folder Structure & Module Boundaries

**Monorepo:** pnpm workspaces + Turborepo. Rationale and rejected alternatives in **ADR-002**.

---

## 1. Top level

```
juice-stop/
├── apps/
│   ├── web/            Customer PWA          → juicestop.in
│   ├── kitchen/        Kitchen kiosk PWA     → kitchen.juicestop.in
│   ├── rider/          Rider PWA             → rider.juicestop.in
│   ├── admin/          Admin+Finance+Analytics+SuperAdmin → admin.juicestop.in
│   └── api/            NestJS (api | realtime | worker roles)
├── packages/
│   ├── contracts/      Zod schemas → TS types → OpenAPI. THE source of truth
│   ├── ui/             AfterDark design system (shadcn-based)
│   ├── db/             Prisma schema, migrations, seeds
│   ├── realtime/       Typed socket client + reconnection/reconciliation logic
│   ├── core/           Money, business-date, geo, result types — pure, zero deps
│   ├── config/         eslint · tsconfig · tailwind preset · prettier
│   └── testing/        Fixtures, factories, testcontainer harness
├── infra/
│   ├── docker/         Dockerfiles, compose stacks
│   ├── nginx/          Reverse proxy, WS upgrade, rate-limit zones
│   ├── terraform/      AWS (scale phase only — see ADR-017)
│   └── scripts/        backup · restore · seed · reconcile
├── docs/               This directory
├── .github/workflows/  CI/CD
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Why four frontends, not one:** they have genuinely different device targets, availability
requirements, and bundle budgets. The kitchen app must boot offline on a cheap Android tablet and
never be affected by an admin deploy at 23:00. Detail in ADR-002.

---

## 2. `packages/contracts` — the keystone

Everything else depends on this. It has **zero runtime dependencies** beyond Zod.

```
contracts/src/
├── primitives/     paise, phoneE164, ulid, businessDate, coordinates
├── enums/          OrderStatus, DeliveryStatus, PaymentMode, … (single definition, FE+BE+DB)
├── auth/           requests + responses + JWT claim shapes
├── catalog/        menu, product, variant, modifier
├── ordering/       cart, quote, placeOrder, order, timeline
├── payments/       intent, verify, webhook payloads
├── kitchen/ delivery/ admin/ finance/ analytics/
├── realtime/       event envelope + a discriminated union of ALL event payloads
└── errors/         error codes + problem+json shape
```

```ts
// contracts/src/ordering/place-order.ts
export const PlaceOrderRequest = z.object({
  addressId: Ulid,
  menuVersion: z.number().int().positive(),
  items: z.array(OrderItemInput).min(1).max(30),
  couponCode: z.string().trim().toUpperCase().max(24).optional(),
  walletApplyPaise: Paise.default(0n),
  paymentMode: PaymentModeEnum,
  tipPaise: Paise.default(0n),
});
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequest>;
```

The NestJS controller validates with this schema; the React form validates with the *same* schema; the
OpenAPI doc is generated from it. **One definition. A field cannot drift between client and server.**

---

## 3. `apps/api` — NestJS

```
api/src/
├── main.ts                 role dispatcher: api | realtime | worker
├── app.module.ts
├── core/                   config · database · cache · queue · outbox · idempotency
│                           audit · logging · telemetry · errors · security
└── modules/
    ├── identity/  catalog/  inventory/  geo/  ordering/  kitchen/
    ├── delivery/  payments/ wallet/     promotions/ reviews/
    ├── notifications/ finance/ analytics/ cms/ admin/ platform/
```

Every module follows the same internal shape — no module invents its own layout:

```
modules/ordering/
├── ordering.module.ts
├── application/            use cases (one class, one transaction, one job)
│   ├── place-order.usecase.ts
│   ├── cancel-order.usecase.ts
│   └── quote-cart.usecase.ts
├── domain/                 pure business logic — NO Prisma, NO Nest, NO I/O
│   ├── order.entity.ts
│   ├── order-state-machine.ts
│   ├── pricing.service.ts          ← pure function, exhaustively unit-tested
│   └── capacity.policy.ts
├── infrastructure/
│   ├── order.repository.ts         implements the domain port
│   └── order.mapper.ts             Prisma row ↔ domain entity
├── presentation/
│   ├── orders.controller.ts        customer
│   ├── admin-orders.controller.ts  admin
│   └── orders.gateway.ts           socket
└── __tests__/
```

**The dependency rule, enforced by `eslint-plugin-boundaries` in CI:**

```
presentation → application → domain
                    ↓
             infrastructure  (implements ports defined in domain)

domain imports NOTHING outward. It has no Prisma import, no Nest decorator,
no HTTP awareness. It is testable with plain Vitest and no containers.
```

Cross-module: `ordering` may import `PaymentsService` (a public interface). It may **never** import
`PaymentRepository`. CI fails the build on violation — this is the boundary that keeps a modular
monolith from quietly becoming a big ball of mud, and it is why extraction to a service later is
mechanical rather than archaeological.

---

## 4. `apps/web` — customer PWA

```
web/src/
├── app/
│   ├── (marketing)/            landing, about, faq   — static, edge-cached
│   ├── (shop)/
│   │   ├── menu/  product/[slug]/  cart/  checkout/
│   ├── (account)/
│   │   ├── orders/[id]/  addresses/  wallet/  referrals/  profile/
│   ├── api/                    BFF only: CSRF, session cookie, webhooks-relay
│   ├── layout.tsx  error.tsx  not-found.tsx  global-error.tsx
├── features/                   VERTICAL SLICES — the primary organising axis
│   ├── menu/         components/ hooks/ store.ts
│   ├── cart/         components/ hooks/ store.ts (Zustand + localStorage)
│   ├── checkout/     components/ hooks/ steps/
│   ├── order-tracking/ components/ hooks/use-order-socket.ts
│   ├── auth/  address/  wallet/  reviews/  referrals/
├── components/                 shared, app-specific (not design-system)
├── lib/                        api-client · query-client · analytics · push
├── hooks/                      useStoreStatus · useGeolocation · useDebounce
└── styles/
```

**Feature folders over type folders.** A `components/` directory holding 200 unrelated files is
where velocity goes to die. Everything about the cart lives in `features/cart/`.

**Server vs. Client components:**

| Server (default) | Client (`'use client'`) |
|---|---|
| Menu, product pages, landing, order history | Cart, checkout, tracking, anything animated or realtime |
| Data fetch + initial render at the edge | Socket subscriptions, Framer Motion, form state |

State management, deliberately split three ways:
- **React Query** — all server state (menu, orders, wallet). Cache, revalidation, optimistic updates.
- **Zustand** — genuine client state only (cart, UI prefs, socket status). Persisted where it matters.
- **URL** — filters, search, selected category. Shareable, back-button-correct, zero state bugs.

---

## 5. `apps/kitchen` — the business-critical app

```
kitchen/src/
├── app/  (auth)/login  (kiosk)/queue  /history  /analytics  /settings
├── features/
│   ├── queue/          ticket-card · urgency-ring · station-columns
│   ├── ticket-actions/ accept · reject · ready · item-toggle
│   ├── sound/          escalating chime, WebAudio (survives autoplay policy)
│   ├── offline/        IndexedDB action queue + replay on reconnect
│   └── printing/       ESC/POS over WebUSB, with a retry queue
├── lib/  socket.ts · heartbeat.ts · wake-lock.ts
└── sw.ts               service worker: offline shell + background sync
```

Constraints that shape every decision here:
- **Touch targets ≥ 64 px.** Greasy fingers, fast hands, a 10-inch tablet viewed from 1–3 m.
- **Screen Wake Lock API** — the tablet must never sleep mid-service.
- **Offline-first.** Accept/ready actions queue locally and replay. The kitchen never blocks on network.
- **Sound is a feature, not a nicety.** An escalating chime that loops until acknowledged.
- **Zero navigation during service.** One screen. Everything reachable without leaving the queue.

---

## 6. `apps/rider` & `apps/admin`

```
rider/src/features/     shift · tasks · navigation · otp-verify · cash · earnings
admin/src/app/
  (auth)/login
  (dashboard)/
    overview/  orders/  menu/  inventory/  coupons/  banners/
    users/  staff/  riders/  zones/
    finance/    summary · invoices · expenses · reconciliation · cash-drawers · exports
    analytics/  overview · products · customers · funnel · retention · heatmap
    system/     feature-flags · health · queues · logs · audit · impersonate
```

Admin's four "panels" (Admin / Finance / Analytics / Super Admin) are **RBAC-gated route groups in one
app**, not four apps. They share a desk-based device target, a navigation shell, and a deploy cadence.
Splitting them would duplicate the shell four times for zero benefit — the separation that matters is
*permissions*, and that is enforced server-side regardless of routing.

Rider app specifics: one-handed reach zones, `navigator.geolocation.watchPosition` with battery-aware
throttling, offline OTP verification against a pre-fetched hash, and high-contrast mode for sunlight
and 3 AM darkness alike.

---

## 7. `packages/ui` — AfterDark design system

```
ui/src/
├── tokens/       colors · typography · spacing · radius · shadows · motion (TS + CSS vars)
├── primitives/   Button · Input · Select · Sheet · Dialog · Toast · Badge · Skeleton
├── patterns/     GlassCard · GradientBorder · LiquidButton · NeonGlow
│                 PriceTag · OrderStatusPill · CountdownRing · EmptyState
├── motion/       transitions · variants · springs · usePrefersReducedMotion
├── charts/       Recharts wrappers, themed, accessible
└── icons/
```

Rules: no business logic, no data fetching, no app imports. Every component ships a Storybook story
and an axe accessibility test. Consumed by all four apps.

---

## 8. `packages/db`

```
db/
├── prisma/
│   ├── schema.prisma          split via prismaSchemaFolder for reviewability
│   ├── migrations/
│   └── seed/  roles · outlet · zones · buildings · catalog · users · orders
└── src/  client.ts · transaction.ts · types.ts
```

Migrations follow the expand/contract policy in `02-data-model.md §6`, CI-linted for destructive
operations.

---

## 9. Naming & code conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `kebab-case.<kind>.ts` | `place-order.usecase.ts` |
| React components | `PascalCase.tsx` | `OrderStatusPill.tsx` |
| Hooks | `use-*.ts` | `use-order-socket.ts` |
| DB | `snake_case` plural | `order_status_events` |
| API routes | `kebab-case` plural | `/out-of-zone-requests` |
| Env vars | `SCREAMING_SNAKE` | `RAZORPAY_WEBHOOK_SECRET` |
| Money vars | always `*Paise` / `*_paise` | `totalPaise` |
| Booleans | `is` / `has` / `can` | `isServiceable` |
| Events | `noun.past_tense_verb` | `order.status_changed` |
| Permissions | `module:action` | `orders:refund` |

**Enforced by tooling, not memory:** TypeScript `strict` + `noUncheckedIndexedAccess`, ESLint with
`boundaries`, `import/no-cycle`, and a **custom rule banning `number` for any identifier matching
`/paise/i`** (must be `bigint`). Money bugs are caught at lint time, not in production.

---

## 10. Turborepo pipeline

```jsonc
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "test:unit": { "dependsOn": ["^build"] },
    "test:int":  { "dependsOn": ["^build"], "cache": false },
    "test:e2e":  { "dependsOn": ["build"],  "cache": false },
    "verify":    { "dependsOn": ["lint","typecheck","test:unit","test:int","build"] }
  }
}
```

`pnpm verify` is the **milestone gate**. Green, or the milestone is not done.
