# 12 — Frontend Redesign Plan

**Scope:** customer-facing frontend only. Backend, APIs, schema, business rules are the source of
truth and are treated as fixed — with two exceptions listed in §3, both of which the brief requires.

---

## 1. Pages

| Page | Current state | Action | Notes |
|---|---|---|---|
| `/` | Hero + status card + trending rail | **Rebuild** | Cinematic hero, particle field, live open/closing countdown, live prep time, Popular Tonight, scroll-driven treasure map |
| `/menu` | Functional list, group tabs | **Rebuild presentation** | Same filter/search logic. Editorial cards, generated imagery, sticky category rail, scroll reveals |
| `/cart` | Full page | **Rebuild → slide-over** | Becomes a drawer over the menu; full page kept as a deep-link fallback |
| `/checkout` | Single page, 5 sections | **Rebuild** | + fulfilment toggle (Delivery / Takeaway), payment methods reworked (§3) |
| `/orders/[id]` | Ring + timeline + edit window | **Rebuild** | Alive tracking, takeaway pickup token + QR, keeps edit-window logic untouched |
| `/orders/[id]/confirmation` | — | **New** | Success moment after placement, then routes to tracking |
| `/orders` | List | **Rebuild presentation** | Editorial cards, status-aware |
| `/profile` | Form + address list | **Rebuild presentation** | Same store, same validation |
| `/profile/settings` | Rows | **Rebuild presentation** | |
| `/kitchen` | Staff board | **Unchanged** | Not customer-facing. Inherits tokens only |

## 2. Design system

Consolidates into `components/system/` — one language, no per-page invention.

- **Tokens v2** — charcoal ramp, orange→magenta→purple gradient, neon accent set, elevation scale,
  radius scale, motion scale. Contrast ratios re-measured (07-design-system.md §2.4 rules hold).
- **New primitives** — `GlowCard`, `GlassPanel`, `AnimatedBorder`, `ParticleField`, `ScrollReveal`,
  `Marquee`, `SectionHeading`, `TactileButton`, `Drawer`, `SuccessBurst`.
- **Kept as-is** — `QuantityStepper`, `FloatingCart`, `AnimatedPaise/Count`, `BillSummary`,
  `MotionProvider` springs. These already work; they get restyled, not rewritten.

## 3. Backend / API impacts

Only two. Both are required by the brief and neither is cosmetic.

### 3.1 Remove Cash on Delivery — **contract change**

| File | Change |
|---|---|
| `apps/api/src/modules/ordering/ordering.controller.ts` | `paymentMethod` enum `['UPI','CARD','COD']` → `['UPI','CARD','NETBANKING','WALLET']` |
| `apps/api/src/modules/ordering/ordering.service.ts` | Drop the `COD → paymentStatus PENDING` branch; all methods now settle as paid |
| `packages/db` | `Order.paymentMethod` is a free string column — **no migration needed** |

Existing COD orders in the database keep their value and still render; only new orders are
constrained. That is deliberate — rewriting historical payment methods would falsify records.

### 3.2 Takeaway mode — **additive schema + contract change**

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | `Order.fulfilmentType String @default("DELIVERY")`, `Order.pickupToken String?` |
| migration | One additive migration. Nullable + defaulted, so it is expand-only and safe |
| `ordering.controller.ts` | `fulfilmentType` enum; `address` becomes **conditionally required** — required for DELIVERY, forbidden for TAKEAWAY |
| `ordering.service.ts` | Takeaway skips travel time in the ETA and mints a 4-char pickup token; `addressJson` stores a takeaway marker |

**Why this cannot be frontend-only:** the pickup token must be server-generated and stored, or it
cannot be verified at the counter — exactly the same reasoning as the delivery OTP.

**No other backend change.** Menu, pricing, order state machine, edit window, kitchen endpoints,
minimum order and block validation are all untouched.

## 4. Asset pipeline (Higgsfield)

Blocked on auth at time of writing, so it is built as a **slot system** rather than hardcoded paths:

```
public/generated/<slug>.webp        the generated asset
src/data/assets.ts                  slug → { alt, prompt, fallbackEmoji }
components/system/GeneratedImage    renders asset, falls back to a styled gradient plate
```

Every image site in the app renders through `GeneratedImage`. Until assets exist it shows the
current gradient-and-emoji plate; once generated, dropping files into `public/generated/` is the
entire integration. **No component changes when the images arrive.**

Prompt set (one house style, reused verbatim for consistency): burgers, loaded fries, milkshake,
cold coffee, falooda, pizza, wrap, momos, packaging, kitchen scene, delivery rider, night
apartment delivery, students eating, plus 9 treasure-map checkpoint illustrations.

## 5. Sequence

Each step ends green (`pnpm typecheck && pnpm build`) and is validated before the next starts.

1. **Foundation** — tokens v2, `components/system/` primitives, asset slot system
2. **Landing** — hero, live status, treasure map
3. **Menu + cart drawer**
4. **Checkout** — fulfilment toggle, payment rework *(backend change 3.1 + 3.2 here)*
5. **Confirmation + tracking** — incl. takeaway token/QR
6. **Profile, settings, order history**
7. **Pass** — a11y audit, reduced-motion, bundle check, responsive sweep

## 6. Non-negotiables carried forward

- Money stays `bigint` paise; display only through `Money.format` / `AnimatedPaise`
- `prefers-reduced-motion` honoured globally; motion never carries information alone
- Contrast ≥ 4.5:1 for body text; status never signalled by colour alone
- Server Components by default; `'use client'` only where interaction demands it
- Animations limited to `transform` / `opacity`
- No business logic moves into components — pricing, validation and state machines stay put
