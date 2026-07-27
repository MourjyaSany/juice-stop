# 08 — Sprint Roadmap

**LOCKED CONTEXT:** solo developer with AI assistance · lean infra (ADR-016, ADR-017) ·
**ship-first**: a feature with high complexity and low launch value goes to the post-launch backlog.

**Locked priority order.** Everything below is sequenced against it:

```
1. Customers can order and pay reliably      ← M1, M2
2. Kitchen receives + manages orders live    ← M3
3. Delivery workflow works smoothly          ← M4
4. Admin manages menu, pricing, inventory    ← M5
5. Analytics and business intelligence       ← M9  (post-launch)
```

**Every milestone leaves the project deployable, demoable and green.** No milestone merges with a red
`pnpm verify`; no money path merges without an idempotency test.

---

## Definition of Done — every milestone

- [ ] `pnpm verify` green: lint · typecheck · boundaries · unit · integration (Testcontainers) · build
- [ ] Playwright E2E covers the happy path **and the two nastiest failure branches**
- [ ] Zod contract → OpenAPI → typed client; no hand-written types
- [ ] New tables: owning module, indexes justified by `EXPLAIN`, reversible migration
- [ ] Money mutations: idempotency test proving double-submit yields one effect
- [ ] Privileged actions: audit row asserted in a test
- [ ] New socket events: a REST endpoint that rebuilds the same state
- [ ] axe clean, keyboard traversable, contrast verified
- [ ] Deployed to staging, demoed against written acceptance criteria
- [ ] Docs updated in the same PR

### Solo-specific additions

- [ ] **No milestone spans more than 3 weeks.** Longer means the scope was wrong — cut it.
- [ ] **Every milestone ends on a green `main`.** No long-lived branches; there is nobody to merge for you.
- [ ] **AI-generated code is reviewed as if it came from a contractor** — especially on money paths (ADR-016).

---

# PHASE 1 — LAUNCH CUT

Everything required to take real money safely. Nothing else.

## M0 · Foundation — *2 weeks*

Monorepo (pnpm + Turborepo), 4 apps + 7 packages · TypeScript strict · ESLint with `boundaries` and
the **`paise` must be `bigint`** rule · Docker Compose (Postgres+PostGIS, Redis, MinIO, MailHog) ·
Prisma + migration linter · NestJS role dispatcher (api|realtime|worker) · `core/` (Zod-validated env,
Pino + PII redaction, problem+json errors, health) · `packages/contracts` + OpenAPI generation ·
`packages/ui` tokens + Button/Input/Card + Storybook · GitHub Actions verify pipeline · Sentry + OTel ·
**Oracle Always Free VM provisioned, multi-arch images building.**

**Acceptance:** `docker compose up` → `pnpm dev` → four apps boot, `/health/ready` green, CI passes a PR,
a container runs on the free-tier VM.

## M1 · Auth + Catalog — *2.5 weeks* · *priority 1*

**Phone OTP + Google only** · access/refresh with rotation + reuse detection · device sessions ·
RBAC (9 roles, ~70 permissions) · categories, products, variants, modifier groups · menu versioning +
publish · product stock with atomic decrement + `CHECK` constraint · customer landing, menu, product
sheet, client-side search · Redis menu cache with version-tag invalidation · full seed data.

→ *Backlog: email+password login, guest checkout, favourites.*

**Acceptance:** browse logged-out; sign up by OTP; publish invalidates cache < 2 s; a replayed refresh
token revokes the family.

## M2 · Cart → Payment → Order — *4 weeks* ⚠️ **the milestone that matters**

Longest by design. This is where money is won or lost, and solo means no second pair of eyes — so it
gets the time instead.

Cart (Zustand + localStorage, guest→user merge) · addresses with building catalog + GPS assist
(ADR-004) · PostGIS serviceability · out-of-zone capture · **pricing engine** (pure, tested to the
paisa) · basic coupons · wallet ledger (needed for instant refunds) · **capacity slots + honest ETA**
(ADR-013) · **the placement transaction** · `Idempotency-Key` interceptor · Razorpay with
**webhook-as-truth** · COD with admin toggle + risk gate · auto-expiry worker with compensating
release · transactional outbox + relay · order confirmation + history.

**Acceptance:**
- Same `Idempotency-Key` twice → **one** order, **one** charge, **one** ledger entry
- Concurrent orders for the last unit → exactly one wins, other gets a named-item 409
- Payment captured after expiry → auto-refund fires with no human involved
- Quoted total === charged total across 200 randomised carts
- Menu published mid-checkout → `409 MENU_VERSION_STALE` with a visible diff

**Demo:** real ₹1 Razorpay order; kill the network mid-payment; watch it self-heal.

## M3 · Kitchen + Realtime — *3 weeks* · *priority 2*

Socket.IO + Redis Streams adapter · ticket auth · room authorisation · `packages/realtime`
(envelope, version-gap reconciliation, backoff, polling fallback) · three-column queue · urgency
colouring · accept/reject/ready · per-item status · escalating sound · Wake Lock · offline action
queue · rush mode · 86-an-item · order notes · **kitchen heartbeat + 3-level escalation ladder** ·
customer live tracking (countdown ring, timeline, ETA updates).

→ *Backlog: ESC/POS printing, multi-station routing, kitchen analytics.*

**Acceptance:** commit → tablet render p95 < 1.5 s; socket killed 60 s and the queue stays correct via
polling, reconciles on reconnect; kitchen offline > 90 s triggers L1.

## M4 · Delivery + Rider — *3 weeks* · *priority 3*

Rider auth · shift start/end · online/offline · **manual assignment + simple auto-assign** (nearest
idle rider) · rider PWA task cards · navigation deep-link · masked calling · **offline OTP
verification** · delivery completion with GPS + timestamp · failure reasons + photo proof ·
**cash drawer sessions with variance tracking** (R-06 — ships now, not later) · rider earnings and
history · dispatch view in admin.

→ *Backlog: multi-order batching, trip optimisation, rider live location on the customer map.*
Batching is unnecessary below ~150 orders/night and adds real ETA-protection complexity.

**Acceptance:** full order → delivered with OTP; OTP verifies in airplane mode and syncs on reconnect;
a rider ₹40 short is escalated and visible.

## M5 · Admin Essentials — *2.5 weeks* · *priority 4*

Admin shell + RBAC route groups · menu CRUD + image upload + draft→publish · inventory + low-stock
alerts + bulk stock reset · **store control: hours, overrides, holiday mode, PAUSE ORDERS, capacity
limits, ADR-013 manual override (audited)** · zone editor + building catalog · order management
(filters, detail, manual cancel, manual rider assign) · users/staff/riders + role grants ·
**feature flags** (the kill switch — cheap and needed before launch) · audit log viewer.

→ *Backlog: banners, CMS, out-of-zone heatmap UI (data still collected from M2).*

**Acceptance:** every mutation audited; rank-limited role grants; pause reflected on the storefront < 2 s.

## M6 · Launch Readiness — *3 weeks*

**Refunds** (auto on kitchen-reject / expiry-after-capture / duplicate; manual with step-up re-auth —
4-eyes deferred) · refund-to-wallet for instant resolution · order receipts (PDF; **full GST invoicing
lands in M7 when registration completes**) · basic finance view (revenue by business date, AOV,
refunds, cash variance) · Web Push + SMS for OTP/arrival + email receipts · post-delivery 1-tap rating ·
security pass (CSP, CSRF, HSTS, rate limits, secret rotation, `gitleaks`) · k6 load test · **chaos
drills** (kill Redis, fail Postgres over, revoke the Razorpay key, kitchen device dies) · runbooks ·
**move Postgres to managed with PITR** · **first restore drill**.

**Acceptance:** every drill passes with a documented recovery time; refund path tested with real money;
a backup restored successfully at least once; p95 placement < 800 ms under load.

---

# 🚀 LAUNCH — end of M6, ~week 20

**Gate — all must be true:** zero unresolved money bugs · 7 consecutive nights of clean reconciliation
on staging data · kitchen escalation drill passed live · p95 placement < 800 ms · refund tested with
real money · backup restored · runbooks rehearsed.

**Rollout:** wk 1 friends-and-family ~20 orders/night, one zone, COD off, you on-call nightly →
wk 2 Abode Valley, ~50/night, COD on with a ₹500 cap → wk 3 full zones, marketing on.

---

# PHASE 2 — POST-LAUNCH (built while live, in the deploy window)

| M | Scope | Est. |
|---|---|---|
| **M7 · Money tooling** | Full coupon engine · **referral programme with the complete anti-farm set** · **GST invoices** (gapless per-FY numbering, CGST/SGST, HSN/SAC, FSSAI) · three-way reconciliation · expenses · CSV export · 4-eyes refund approval | 3 wk |
| **M8 · Notifications & engagement** | Preference matrix · templates · retry/DLQ visibility · full reviews with moderation · favourites · scheduled/pre-open orders · banners + CMS | 3 wk |
| **M9 · Analytics** *(priority 5)* | Nightly rollups · revenue graphs · peak hours · best sellers · conversion funnel · abandoned carts · retention/cohorts · LTV · building heatmap · inventory forecasting | 3 wk |
| **M10 · Super admin & ops** | Impersonation with guardrails · queue/Redis monitoring · log search · backup trigger UI · advanced feature-flag rollout | 2 wk |
| **M11 · Optimisation** | Batching · trip optimisation · rider live location · ESC/POS printing · multi-station kitchen routing · guest checkout · email+password login | ongoing |

**M7 is not optional if you register for GST.** Compliant invoicing becomes a legal obligation the day
registration completes, so sequence M7 against that date, not against convenience.

---

## Timeline (solo, ~35–40 focused hrs/week)

```
M0 ▓▓         Foundation                 wk 1-2
M1   ▓▓▓      Auth + Catalog             wk 3-5
M2      ▓▓▓▓  Cart→Payment→Order  ⚠️     wk 6-9
M3          ▓▓▓  Kitchen + Realtime      wk 10-12
M4             ▓▓▓ Delivery + Rider      wk 13-15
M5                ▓▓▓ Admin Essentials   wk 16-18
M6                   ▓▓▓ Launch Ready    wk 18-20
🚀 LAUNCH ─────────────────────────────── wk 20
M7                       ▓▓▓ Money       wk 21-23
M8                          ▓▓▓ Notifs   wk 24-26
M9                             ▓▓▓ Analytics wk 27-29
```

**~20 weeks (5 months) to launch. ~29 weeks to feature-complete.**

**The binding constraint is scope discipline, not typing speed.** These estimates assume the backlog
stays in the backlog. Every "while I'm in here, let me also…" costs a week you do not have. If you
work part-time (15–20 hrs/week), double every number and say so out loud rather than discovering it
in month four.

**Emergency compression:** if cash flow demands revenue sooner, M0→M3 alone (menu, auth, cart,
payment, order, kitchen) can take real money at **~week 12**, with deliveries coordinated over
WhatsApp and admin via Prisma Studio. I would take that trade only under real pressure — it skips
M4's cash reconciliation and M6's refund tooling, which is precisely where money leaks — and it must
carry a hard date to close the gap, not become the destination.

---

## What we are deliberately NOT building for launch

Recorded so it stays cut, and so nobody re-litigates it at week 14:

referrals · full analytics · scheduled orders · guest checkout · email+password login · full reviews ·
favourites · order batching · rider live location · receipt printing · multi-station routing ·
banners/CMS · impersonation · super-admin panel · GST invoicing (until registration) · Excel export ·
heatmaps · cohorts · LTV · inventory forecasting · ingredient-level BOM · native apps · multi-outlet.

Every one is designed for in the schema and the module boundaries. None is built until it earns its place.
