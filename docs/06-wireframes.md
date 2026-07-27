# 06 — UI Wireframes

Low-fidelity structural wireframes. They define **hierarchy, density and interaction**, not visual
styling — that lives in `07-design-system.md`. Mobile-first for customer and rider; landscape tablet
for kitchen; desktop for admin.

---

## 1. Customer — Landing (mobile, 390×844)

```
┌───────────────────────────────────────┐
│ ░░ animated gradient mesh, subtle ░░  │  ← 8s loop, pauses on reduced-motion
│                                       │
│  JUICE STOP                    [☾]    │  ← wordmark + theme toggle
│  ─────────────                        │
│                                       │
│   Late night hits                     │  ← 40px display, gradient on 2nd line
│   different. 🌙                       │
│                                       │
│   Open till 4 AM · Abode Valley       │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ 🟢 OPEN NOW  ·  ~28 min         │  │  ← LIVE. The single most important
│  │ Kitchen running at 34%          │  │     element on the page. Never fake.
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │   Start ordering        →       │  │  ← liquid button, gradient fill
│  └─────────────────────────────────┘  │
│                                       │
│  ───── TRENDING TONIGHT ─────         │
│  ┌──────┐ ┌──────┐ ┌──────┐          │  ← horizontal snap-scroll
│  │ img  │ │ img  │ │ img  │  →       │
│  │Zinger│ │Fries │ │Maggi │          │
│  │ ₹189 │ │ ₹79  │ │ ₹99  │          │
│  └──────┘ └──────┘ └──────┘          │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ⚡ MIDNIGHT50                    │  │
│  │ ₹50 off after 1 AM · tap to copy│  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

**Closed state** replaces the status card — a countdown, not an error:

```
│  ┌─────────────────────────────────┐  │
│  │ 🌙 We open in 2h 14m            │  │
│  │ Browse now · schedule for 7:05  │  │
│  └─────────────────────────────────┘  │
```

The store status card is rendered **server-side** so it is correct in the first paint. A client-side
"OPEN" flash that flips to "CLOSED" is the kind of detail that quietly destroys trust.

---

## 2. Customer — Menu

```
┌───────────────────────────────────────┐
│ ← Menu                    🔍  ☾       │  ← sticky, blurs content on scroll
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐   │
│ │ 🔍 Search the whole menu…       │   │  ← client-side, 250ms debounce,
│ └─────────────────────────────────┘   │     ZERO network calls
│                                       │
│ [All][Burgers][Rolls][Fries][Shakes]  │  ← sticky pills, active = gradient
├───────────────────────────────────────┤
│ ┌───────────────────────────────────┐ │
│ │ ┌────┐  Chicken Zinger      🔥    │ │
│ │ │ img│  Crispy, spicy, unfair     │ │
│ │ │    │  ⭐4.6 (231) · 🌶️🌶️        │ │
│ │ └────┘  ₹189  ~̶₹̶2̶2̶9̶       [ + ] │ │  ← + morphs to [− 1 +] in place
│ └───────────────────────────────────┘ │
│ ┌───────────────────────────────────┐ │
│ │ ┌────┐  Paneer Roll     [SOLD OUT]│ │
│ │ │dim │  ...                        │ │  ← 40% opacity, greyscale image
│ │ └────┘  ₹149      [ Notify me 🔔 ]│ │  ← captures lost demand
│ └───────────────────────────────────┘ │
│                                       │
│ ┌═══════════════════════════════════┐ │
│ ║ 🛒 2 items · ₹268    View cart → ║ │  ← floating glass bar, springs up
│ └═══════════════════════════════════┘ │
└───────────────────────────────────────┘
```

Whole menu is one payload; category switching is a client-side filter with a shared-layout animation.
**No spinner ever appears when changing category** — that is the difference between an app that feels
native and one that feels like a website.

---

## 3. Customer — Product sheet (bottom sheet, drag to dismiss)

```
┌───────────────────────────────────────┐
│              ▁▁▁▁                     │  ← drag handle
│ ┌───────────────────────────────────┐ │
│ │        hero image (16:9)          │ │  ← blurhash → fade, no layout shift
│ └───────────────────────────────────┘ │
│ Chicken Zinger              🔥 BESTSELLER
│ Crispy, spicy, unfair.                │
│ ⭐ 4.6 (231) · 🌶️🌶️ · ~7 min          │
│                                       │
│ CHOOSE SIZE            (required)     │
│ ○ Regular                      ₹189   │
│ ● Double Patty            +₹60 ₹249   │  ← selected: gradient ring
│                                       │
│ ADD-ONS                (max 4)        │
│ ☑ Extra Cheese            +₹20  [2]   │  ← qty stepper on multi-select
│ ☐ Jalapeños               +₹15        │
│ ☐ Extra Mayo         +₹10  SOLD OUT   │  ← kitchen 86'd, live
│                                       │
│ ┌─────────────────────────────────┐   │
│ │ Any notes for the chef?         │   │
│ └─────────────────────────────────┘   │
│                                       │
│ ┌───────┐ ┌─────────────────────────┐ │
│ │ − 1 + │ │  Add · ₹289          →  │ │  ← total updates live, tabular nums
│ └───────┘ └─────────────────────────┘ │
└───────────────────────────────────────┘
```

---

## 4. Customer — Checkout (single scrollable page, not a wizard)

```
┌───────────────────────────────────────┐
│ ← Checkout                            │
├───────────────────────────────────────┤
│ ① DELIVER TO                          │
│ ┌───────────────────────────────────┐ │
│ │ 🏠 Room 412, Tower C              │ │
│ │    Abode Valley · near the lift   │ │
│ │    ✅ We deliver here     [Change]│ │
│ └───────────────────────────────────┘ │
│                                       │
│ ② ORDER  (2 items)          [Edit]    │
│   Chicken Zinger ×1            ₹289   │
│     + Extra Cheese ×2                 │
│   Fries ×1                      ₹79   │
│                                       │
│ ③ OFFERS                              │
│ ┌───────────────────────────────────┐ │
│ │ 🎟️ MIDNIGHT50 applied  −₹50  [×] │ │
│ └───────────────────────────────────┘ │
│ 💰 Wallet ₹120 available   [Use ₹50]  │
│                                       │
│ ④ BILL                                │
│   Item total                   ₹368   │
│   Coupon                      −₹50    │
│   Delivery                     ₹19    │
│   Packaging                     ₹5    │
│   GST (5%)                   ₹17.10   │
│   ─────────────────────────────────   │
│   TO PAY                    ₹359.10   │  ← 24px, tabular, gradient text
│                                       │
│ ⑤ PAY WITH                            │
│   ● UPI   ○ Card   ○ Netbanking       │
│   ○ Cash on delivery                  │
│                                       │
│ ⚠ Kitchen's busy — 42 min tonight     │  ← honest, BEFORE they pay
│                                       │
│ ┌───────────────────────────────────┐ │
│ │   Pay ₹359.10             →       │ │  ← sticky bottom, safe-area aware
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘
```

One page, five labelled sections. Multi-step wizards add taps and abandonment for no benefit at this
cart size. The capacity warning appears **before** the pay button, never after payment.

---

## 5. Customer — Order tracking (the screen they stare at)

```
┌───────────────────────────────────────┐
│ ← Order #JS-270726-0417               │
├───────────────────────────────────────┤
│                                       │
│            ╭─────────╮                │
│           ╱   26:14   ╲               │  ← countdown ring, gradient stroke,
│          │   minutes   │              │     animates continuously
│           ╲  remaining ╱               │
│            ╰─────────╯                │
│                                       │
│      Chef is absolutely cooking 🔥    │  ← copy changes per status
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ ✅ Order secured          22:41   │ │
│ │ ✅ Kitchen locked in      22:43   │ │
│ │ 🔥 Cooking            ▓▓▓▓░░ 68%  │ │  ← live progress
│ │ ○  Out for delivery               │ │
│ │ ○  Delivered                      │ │
│ └───────────────────────────────────┘ │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ 🔐 DELIVERY OTP                   │ │
│ │        4  7  2  9                 │ │  ← huge, tabular. Appears only when
│ │ Show this to your rider           │ │     OUT_FOR_DELIVERY
│ └───────────────────────────────────┘ │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ 🛵 Arjun is on the way            │ │
│ │    [ 📞 Call ]  (number masked)   │ │
│ └───────────────────────────────────┘ │
│                                       │
│ ⚡ Reconnecting…                      │  ← honest degraded-state indicator
└───────────────────────────────────────┘
```

The socket-disconnected indicator is **shown, not hidden**. A stale screen pretending to be live is
worse than an honest "reconnecting" — and it stops the support call at 1 AM.

---

## 6. Kitchen — Queue (landscape tablet, 1280×800)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ JUICE STOP KITCHEN   ● LIVE   22:47   Tonight: 47 orders · ₹12,840   [RUSH]  │
├──────────────────────────────────────────────────────────────────────────────┤
│  NEW (2)              │  COOKING (3)          │  READY (1)                   │
│ ┌───────────────────┐ │ ┌───────────────────┐ │ ┌──────────────────────────┐ │
│ │ ⚠ #0417    04:12  │ │ │ #0415      08:44  │ │ │ #0412            ✓       │ │
│ │ ▓▓▓▓▓▓▓▓░░  RED   │ │ │ ▓▓▓▓░░░░  AMBER   │ │ │ Waiting for rider  02:10 │ │
│ │───────────────────│ │ │───────────────────│ │ │──────────────────────────│ │
│ │ 1× Chicken Zinger │ │ │ 2× Veg Roll       │ │ │ 1× Maggi                 │ │
│ │   + Extra Cheese×2│ │ │ 1× Fries          │ │ │                          │ │
│ │ 1× Fries          │ │ │                   │ │ │  [ HANDED TO RIDER ]     │ │
│ │───────────────────│ │ │ 📝 no onions bro  │ │ └──────────────────────────┘ │
│ │ 📝 Call at gate   │ │ │───────────────────│ │                              │
│ │───────────────────│ │ │ [ ✓ READY ]       │ │                              │
│ │ [ ACCEPT ] [ ✕ ]  │ │ └───────────────────┘ │                              │
│ └───────────────────┘ │                       │                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ 🔊 Sound ON   🖨 Printer OK   📶 Connected   Avg prep 7:20   [86 an item]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Design constraints, all non-negotiable:
- **Three columns, zero navigation.** Everything visible at once, readable from 3 m.
- **Urgency is colour + progress bar + position** — never colour alone (colour-blind safety, and a
  greasy screen at 1 AM washes out hues).
- **Buttons ≥ 64 px.** Destructive actions (reject) are visually separated and require a reason.
- **Status bar is permanent**: sound, printer, connection, avg prep. When something breaks, the
  kitchen sees it before the customer does.
- New tickets **slide in with an escalating chime that loops until acknowledged.**

---

## 7. Rider — Task (mobile, one-handed)

```
┌───────────────────────────────────────┐
│ ● ONLINE    Shift 3h 12m    ₹640      │
├───────────────────────────────────────┤
│ ┌───────────────────────────────────┐ │
│ │ PICKUP · #0417                    │ │
│ │ Juice Stop Kitchen                │ │
│ │ Ready ✓ · 200 m                   │ │
│ │ ┌───────────────────────────────┐ │ │
│ │ │  🧭 NAVIGATE                  │ │ │
│ │ └───────────────────────────────┘ │ │
│ │ [ ✓ PICKED UP ]                   │ │
│ └───────────────────────────────────┘ │
│ ┌───────────────────────────────────┐ │
│ │ DROP · Room 412, Tower C          │ │
│ │ Abode Valley · 1.2 km · ~6 min    │ │
│ │ ⚠ Gate needs ID after 23:00       │ │  ← building-level intel, from catalog
│ │ 💰 COLLECT ₹359 CASH              │ │  ← unmissable
│ │ [ 📞 CALL ]      [ ✓ DELIVERED ]  │ │
│ └───────────────────────────────────┘ │
│           [ Can't deliver ]           │  ← de-emphasised but always reachable
└───────────────────────────────────────┘

OTP entry ─────────────────────────────
│   Ask the customer for their code    │
│      ┌─┐ ┌─┐ ┌─┐ ┌─┐                 │
│      │4│ │7│ │_│ │_│                 │  ← 56px boxes, numeric keypad only
│      └─┘ └─┘ └─┘ └─┘                 │
│   Verified offline · 2 tries left    │
```

Bottom-third placement for all primary actions — thumb reach on a 6.5" phone, often while standing
next to a bike.

---

## 8. Admin — Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ☰  Juice Stop Admin              Tonight · 27 Jul     🔴 PAUSE ORDERS   [A]│
├──────────┬─────────────────────────────────────────────────────────────────┤
│ Overview │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│ Orders   │ │ ORDERS  │ │ REVENUE │ │  AOV    │ │ AVG ETA │ │ CAPACITY│    │
│ Menu     │ │   47    │ │ ₹12,840 │ │  ₹273   │ │ 31 min  │ │  ▓▓▓░ 68│    │
│ Inventory│ │ ▲ 12%   │ │ ▲ 8%    │ │ ▼ 3%    │ │ ▲ 4 min │ │   %     │    │
│ Coupons  │ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
│ Users    │                                                                 │
│ Riders   │ ┌───────────────────────────┐ ┌─────────────────────────────┐  │
│ Zones    │ │ ORDERS / HOUR             │ │ LIVE ORDERS             (8) │  │
│ ─────────│ │      ▁▂▃▅▇█▇▅▃           │ │ #0417 COOKING    04:12  ⚠   │  │
│ Finance  │ │ 19 20 21 22 23 00 01 02  │ │ #0415 COOKING    08:44      │  │
│ Analytics│ └───────────────────────────┘ │ #0412 READY      02:10      │  │
│ ─────────│                               │ #0410 OUT        11:03      │  │
│ System   │ ┌───────────────────────────┐ └─────────────────────────────┘  │
│          │ │ ⚠ ALERTS                  │ ┌─────────────────────────────┐  │
│          │ │ • Paneer Roll out of stock│ │ RIDERS          3 online    │  │
│          │ │ • Rider Arjun ₹40 short   │ │ Arjun  ●  2 active          │  │
│          │ │ • 1 order unaccepted 6min │ │ Kiran  ●  idle              │  │
│          │ └───────────────────────────┘ └─────────────────────────────┘  │
└──────────┴─────────────────────────────────────────────────────────────────┘
```

`PAUSE ORDERS` is a permanent, top-right, red control. When something goes wrong at 1 AM, the person
holding the phone must not have to hunt through a settings page for it.

---

## 9. Finance — Reconciliation (the screen that catches money bugs)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Finance › Reconciliation          Business date: 26 Jul 2026   [Export ▾]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│ │ OUR RECORDS  │ │ RAZORPAY     │ │ CASH (COD)   │ │ VARIANCE     │       │
│ │ ₹94,280      │ │ ₹86,140      │ │ ₹8,140       │ │ ₹0  ✅       │       │
│ │ 312 orders   │ │ 268 payments │ │ 44 orders    │ │ MATCHED      │       │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                            │
│ THREE-WAY MATCH                                                            │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Order    Ours      Gateway    Bank      Status                         │ │
│ │ #0417    ₹359.10   ₹359.10    ₹352.42   ✅ matched (fee ₹6.68)         │ │
│ │ #0401    ₹289.00   ₹289.00    —         ⏳ settling (T+2)              │ │
│ │ #0388    ₹199.00   —          —         🔴 CAPTURED, NOT SETTLED       │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ CASH DRAWERS                                                               │
│ │ Arjun   expected ₹4,820  counted ₹4,780  variance −₹40  ⚠ [Review]      │
│ │ Kiran   expected ₹3,320  counted ₹3,320  variance   ₹0  ✅ settled      │
└────────────────────────────────────────────────────────────────────────────┘
```

Variance is the headline number, and green is the only acceptable resting state. A finance screen
that shows totals but not *differences* is decoration.

---

## 10. Cross-cutting UI rules

| Rule | Why |
|---|---|
| **Skeletons, never spinners**, for known-shape content | Preserves layout, kills CLS, feels 2× faster |
| **Optimistic UI** on add-to-cart, favourite, qty change — with rollback | Instant response over a 4G round trip |
| **Empty states always offer an action**, never a dead end | "No orders yet → Browse the menu" |
| **Errors are specific and recoverable** | "Chicken Zinger just sold out" ≫ "Something went wrong" |
| **Bottom sheets on mobile, dialogs on desktop** | Thumb reach vs. pointer precision |
| **Safe-area insets** honoured everywhere | Notches and home indicators |
| **44 px minimum touch target** (64 px in kitchen) | WCAG 2.5.5 |
| **Sticky primary action** on every transactional screen | Never scroll to pay |
| **Every destructive action confirms**; every money action confirms twice | |
| **Reduced-motion honoured globally** | Vestibular safety, and a real accessibility obligation |
| **Focus visible on every interactive element** | Keyboard and screen-reader users exist in admin too |
