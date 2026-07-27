# 07 — Design System: **AfterDark**

> "Gen Z meets Cyberpunk Fast Food." Matte charcoal, neon edges, liquid motion.
> Awwwards-grade polish that still works on a ₹8,000 Android at 3 AM on hostel Wi-Fi.

Delivered as `packages/ui` — tokens as TypeScript **and** CSS custom properties, consumed by all four
apps. Design decisions here are load-bearing, not decoration: every token below has a stated reason.

---

## 1. Design principles

1. **Dark is the canvas, not a theme.** This app is used between 19:00 and 04:00. Light mode exists
   and is fully supported, but dark is the default and gets the design attention.
2. **Neon is an accent, never a surface.** Large saturated areas vibrate on OLED and fatigue the eye.
   Glow lives on 1px borders, small fills, and motion.
3. **Motion communicates state.** Every animation answers "what just changed?" Decoration that
   answers nothing gets cut.
4. **Contrast is non-negotiable.** Every text token below ships with its measured contrast ratio.
   Cyberpunk is not an excuse for unreadable.
5. **One glance, one answer.** Kitchen and rider screens are read in under two seconds, under stress.
6. **Playful, sparingly.** Gen-Z copy appears at emotional beats (order placed, cooking, delivered) —
   never on errors, never on money, never twice on one screen.

---

## 2. Colour

### 2.1 Surfaces — matte charcoal, not black

```
--surface-canvas    #0B0B0F   page background
--surface-base      #121218   cards
--surface-raised    #1A1A22   elevated cards, popovers
--surface-overlay   #22222C   modals, sheets
--surface-inset     #08080B   wells, inputs
--border-subtle     #26262F   hairlines
--border-strong     #35353F   emphasised dividers
```

True `#000000` is deliberately avoided: it produces harsh OLED smearing on scroll and leaves no room
for a darker inset. `#0B0B0F` carries a whisper of blue-violet that makes the orange read warmer.

### 2.2 Brand

```
ORANGE  (primary action, energy, heat)
 50 #FFF3EC   300 #FFB27A   500 #FF6B1A ★   700 #C24500   900 #6B2400

PURPLE  (night, tech, accent)
 50 #F6F0FE   300 #C084FC ★  500 #A855F7 ★  700 #7E22CE   900 #4A1878

★ #FF6B1A — primary brand, buttons, CTAs
★ #A855F7 — glow, borders, decoration ONLY
★ #C084FC — purple TEXT (see §2.4)
```

### 2.3 The signature gradient

```css
--gradient-brand: linear-gradient(135deg, #FF6B1A 0%, #FF3D81 45%, #A855F7 100%);
```

**The `#FF3D81` midpoint is essential.** Interpolating orange → purple directly in sRGB passes
through desaturated brown around the midpoint — it looks muddy and cheap. Routing through magenta
holds chroma across the whole ramp. This is the single highest-impact colour decision in the system.

```css
--gradient-glow:    radial-gradient(circle at 50% 0%, #A855F733 0%, transparent 70%);
--gradient-mesh:    /* animated hero background, 8s loop, pauses on reduced-motion */
--gradient-urgent:  linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
```

### 2.4 Text — with measured contrast on `#0B0B0F`

| Token | Hex | Ratio | Verdict |
|---|---|---|---|
| `--text-primary` | `#F5F5F7` | **18.0 : 1** | AAA |
| `--text-secondary` | `#A1A1AA` | **7.7 : 1** | AAA |
| `--text-tertiary` | `#71717A` | **4.1 : 1** | ⚠️ **Large text (≥18.66px bold / 24px) or non-essential only** |
| `--text-accent-orange` | `#FF6B1A` | **6.9 : 1** | AA — safe for body text |
| `--text-accent-purple` | `#C084FC` | **7.4 : 1** | AAA |
| ~~`#A855F7` as text~~ | `#A855F7` | 5.0 : 1 | Passes AA but reserved for **decoration only** — too tight at small sizes over glass |

**Rule: `#A855F7` glows, `#C084FC` speaks.** Enforced by naming — the text token simply doesn't
expose the darker purple.

### 2.5 Semantic

| Token | Hex | Ratio | Use |
|---|---|---|---|
| `--success` | `#22C55E` | 8.6 : 1 | Delivered, matched, in stock |
| `--warning` | `#F59E0B` | 9.2 : 1 | Approaching ETA, low stock, variance |
| `--danger` | `#EF4444` | 5.2 : 1 | Late, rejected, failed |
| `--info` | `#38BDF8` | 9.8 : 1 | Neutral system messages |

**Colour is never the sole carrier of meaning.** Every status pairs a colour with an icon, a label,
and — on the kitchen board — position and a progress bar. A colour-blind chef and a sun-washed rider
screen must both work.

### 2.6 Light mode

Not an afterthought — admin and finance are used in daylight. Surfaces invert to
`#FAFAFA / #FFFFFF / #F4F4F5`; orange darkens to `#E85D00` (4.6:1 on white) and purple to `#7E22CE`
(6.9:1 on white). The gradient keeps its magenta midpoint. Driven by
`@media (prefers-color-scheme)` plus a `data-theme` override that always wins.

---

## 3. Typography

| Role | Family | Source | Why |
|---|---|---|---|
| Display | **Clash Display** | Fontshare (free, commercial-ok) | Wide, confident, slightly technical — carries the cyberpunk register without novelty-font cringe |
| UI / Body | **Satoshi** | Fontshare (free) | Geometric-humanist, excellent at 14–16px, real tabular figures |
| Mono | **JetBrains Mono** | OFL | Order numbers, OTPs, timers, invoice IDs |

Self-hosted `woff2`, subset to Latin + the punctuation we use, `font-display: swap`, preloaded for the
two weights above the fold. **No Google Fonts CDN** — it is a third-party request on the critical path
and a GDPR/DPDP data-sharing question we don't need.

### Scale (1.25 major third, clamped fluid)

```
display-xl  clamp(2.5rem, 8vw, 4rem)     Clash 600   -0.03em   0.95
display-lg  clamp(2rem, 6vw, 3rem)       Clash 600   -0.02em   1.0
h1          clamp(1.75rem, 4vw, 2.25rem) Clash 600   -0.02em   1.15
h2          1.5rem    Satoshi 700  -0.01em  1.25
h3          1.25rem   Satoshi 700   0       1.3
body-lg     1.125rem  Satoshi 400   0       1.6
body        1rem      Satoshi 400   0       1.6    ← never below 16px on mobile
body-sm     0.875rem  Satoshi 400   0       1.5
caption     0.75rem   Satoshi 500   0.01em  1.4
label       0.6875rem Satoshi 600   0.08em  1.2    UPPERCASE
mono-price  1rem      JetBrains 500 tabular-nums
```

**Every price, timer, countdown and quantity uses `font-variant-numeric: tabular-nums`.** Without it,
a live countdown visibly jitters as digit widths change — a small detail that reads as cheapness.

16px minimum on mobile inputs is not a style choice: iOS Safari auto-zooms below it, which breaks the
checkout layout mid-transaction.

---

## 4. Space, radius, elevation

```
Space (4px base):  1=4  2=8  3=12  4=16  5=20  6=24  8=32  10=40  12=48  16=64  20=80  24=96
Radius:  sm 6 · md 10 · lg 14 · xl 20 · 2xl 28 · full 9999
         Buttons lg · Cards xl · Sheets 2xl (top only) · Pills full
```

Elevation on dark surfaces comes from **layered shadow + a 1px lighter top border**, because pure
drop-shadow is nearly invisible against charcoal:

```css
--elev-1: 0 1px 2px rgb(0 0 0 / .40), 0 0 0 1px rgb(255 255 255 / .04);
--elev-2: 0 4px 12px rgb(0 0 0 / .45), 0 0 0 1px rgb(255 255 255 / .06);
--elev-3: 0 12px 32px rgb(0 0 0 / .55), 0 0 0 1px rgb(255 255 255 / .08);
--glow-orange: 0 0 24px -6px #FF6B1A66;
--glow-purple: 0 0 24px -6px #A855F766;
--glow-focus:  0 0 0 3px #A855F759;
```

---

## 5. Glassmorphism — the honest version

```css
.glass {
  background: linear-gradient(180deg, rgb(255 255 255 / .06), rgb(255 255 255 / .02));
  backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgb(255 255 255 / .08);
  border-radius: var(--radius-xl);
  box-shadow: var(--elev-2);
}
/* the top-edge specular highlight that sells the material */
.glass::before {
  content: ''; position: absolute; inset: 0 0 auto; height: 1px;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / .25), transparent);
}
```

**Performance rules — `backdrop-filter` is expensive and this matters on a ₹8,000 phone:**
- Maximum **three** blurred layers on screen at once.
- Never on scrolling list items — only on floating chrome (cart bar, sheets, nav, modals).
- `@supports not (backdrop-filter: blur(1px))` → solid `--surface-raised` fallback.
- **Kitchen app uses zero glass.** Legibility from 3 m under fluorescent light beats aesthetics, every
  time. This is a deliberate divergence, not an oversight.

---

## 6. Motion

Library: **Motion** (formerly Framer Motion; package `motion`, imported from `motion/react`), loaded
via `LazyMotion` + `domAnimation` — ~4.6 KB instead of ~34 KB for the full bundle.

```
Duration:  instant 80 · fast 140 · base 200 · slow 320 · slower 480 · ambient 8000
Easing:    out    cubic-bezier(0.16, 1, 0.30, 1)     ← entrances (expo-out)
           inOut  cubic-bezier(0.65, 0, 0.35, 1)     ← moves
           in     cubic-bezier(0.55, 0, 1, 0.45)     ← exits
Springs:   snappy {stiffness 400, damping 30}   ← buttons, toggles
           smooth {stiffness 260, damping 26}   ← sheets, cards
           bouncy {stiffness 500, damping 18}   ← cart bar, success beats
```

| Interaction | Motion |
|---|---|
| Button press | `scale 0.97` + a radial highlight tracking the pointer — the "liquid" feel |
| Add to cart | Item ghost flies to the cart bar; the bar springs and the count rolls over |
| Page transition | Shared-element on the product image; content cross-fades 200 ms |
| Bottom sheet | Spring up, drag-to-dismiss with velocity, backdrop fades |
| Status change | Timeline node fills, ring redraws, pill cross-fades |
| New kitchen ticket | Slides in + a one-shot glow pulse + escalating chime |
| Countdown ring | Continuous `strokeDashoffset`, `transform`-only, GPU-composited |
| Skeleton | Gradient sweep 1.4 s — never a spinner where the shape is known |
| Toast | Springs from the bottom, auto-dismiss 4 s, swipe to kill |

**Only `transform` and `opacity` are animated.** Animating `width`, `height`, `top` or `box-shadow`
triggers layout on every frame and drops a mid-range Android to ~20 fps.

**Reduced motion is a global contract:**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
}
```

Ambient gradients pause; countdown rings become plain numbers; nothing that conveys state disappears
— reduced motion must never mean reduced information.

---

## 7. Component inventory

**Primitives** — Button (primary/secondary/ghost/danger/liquid × sm/md/lg/xl) · IconButton · Input ·
Textarea · Select · Combobox · Checkbox · Radio · Switch · Slider · OTPInput · Sheet · Dialog ·
Popover · Tooltip · Toast · Tabs · Accordion · Badge · Avatar · Skeleton · Spinner · Progress ·
Separator · ScrollArea.

**AfterDark patterns** — `GlassCard` · `GradientBorder` · `LiquidButton` · `NeonGlow` ·
`AnimatedGradientText` · `CountdownRing` · `OrderStatusPill` · `PriceTag` (tabular, strikethrough,
gradient) · `ProductCard` · `CartBar` · `StepperInput` · `EmptyState` · `StatTile` · `UrgencyBar` ·
`TicketCard` · `TimelineTrack` · `MetricCard` · `DataTable` (sortable, virtualised, exportable).

Every component: TypeScript-strict props, `forwardRef`, `data-*` state attributes for testing, a
Storybook story, an axe test, and light+dark coverage.

---

## 8. Voice & tone

The playful copy is a **garnish with a strict allowlist of placements**.

| Moment | Copy |
|---|---|
| Order placed | "Order secured. Kitchen's got it 🔥" |
| Accepted | "Kitchen locked in. 🔒" |
| Cooking | "Chef is absolutely cooking." / "Bro your fries are getting cooked 🔥" |
| Ready | "Food's ready. Rider incoming 🛵" |
| Out for delivery | "Driver has entered the grind." / "Your burger is in its main character arc." |
| Delivered | "Late night cravings successfully defeated. 🏆" |
| Empty cart | "Cart's emptier than the library at 2 AM." |
| Out of zone | "You're a little outside our midnight kingdom 🌙" |
| Pre-open | "Doors open in 2h 14m. Touch grass later. Eat first." |

**Where playful copy is banned, without exception:**
- Payment failures, refunds, any screen with money on it
- Error states of any kind
- Delivery failures, cancellations
- Everything in kitchen, rider, admin and finance apps
- Legal, invoices, T&C

Rules: **one playful line per screen, maximum.** The information always comes first and the joke
second — never a joke *instead of* the fact. A customer whose ₹359 vanished does not want banter;
they want the amount, the destination, and the date.

---

## 9. Accessibility — WCAG 2.2 AA, committed

| Requirement | Implementation |
|---|---|
| Contrast | Every token measured (§2.4). CI runs a contrast assertion over the token file — a failing pair breaks the build |
| Touch targets | ≥ 44×44 px (WCAG 2.5.5); ≥ 64 px in kitchen |
| Focus | Visible `--glow-focus` ring on every interactive element; never `outline: none` without a replacement |
| Keyboard | Full traversal in admin/finance; modals trap focus and restore it on close |
| Screen readers | Semantic HTML first, ARIA second. Order status changes announced via `aria-live="polite"`; errors via `assertive` |
| Motion | `prefers-reduced-motion` honoured globally (§6) |
| Forms | Every input labelled; errors linked by `aria-describedby`; never colour-only validation |
| Zoom | Usable to 200% without horizontal scroll |
| Language | `lang="en-IN"` |
| Colour independence | Icon + text accompany every colour-coded state |

Tooling: `eslint-plugin-jsx-a11y` (error-level), `axe-core` in component tests, Playwright axe scan on
key routes, Lighthouse a11y ≥ 95 as a CI gate.

---

## 10. Responsive

```
xs 0      mobile portrait — the design target for customer & rider
sm 640    large phones
md 768    tablets — KITCHEN starts here (landscape only)
lg 1024   small laptops — ADMIN starts here
xl 1280   desktop
2xl 1536  large desktop
```

Customer and rider: mobile-first, enhanced upward. Kitchen: **landscape-locked ≥ 768px**, with an
explicit "rotate your device" screen rather than a broken portrait layout. Admin: desktop-first, with
a functional (not pretty) mobile fallback for the on-call owner checking from bed.

Container queries for cards that appear in multiple layouts; fluid `clamp()` type; `dvh` units so
mobile browser chrome doesn't clip sticky checkout buttons.

---

## 11. Performance budgets (CI-enforced)

| Metric | Budget |
|---|---|
| LCP (mobile, 4G) | < 2.0 s |
| INP | < 200 ms |
| CLS | < 0.05 |
| First-load JS (customer route) | < 130 KB gzip |
| Menu payload | < 60 KB gzip |
| Lighthouse Performance / A11y | ≥ 90 / ≥ 95 |
| Kitchen app cold boot (offline) | < 1.5 s |

Budgets fail the build. A design system that ships beautiful screens nobody can load on hostel Wi-Fi
has failed at its actual job.
