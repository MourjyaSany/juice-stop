# 03 — User Flows

Fourteen flows. Every one includes its **failure branches** — the happy path is the easy 20%, and
the failure branches are where a food-delivery product is actually won or lost.

Legend: `▸` user action · `⚙` system · `✉` notification · `⚠` failure branch · `💰` money moves

---

## F-01 · First-time customer, first order (the money flow)

```
▸ Lands on juicestop.in (Instagram bio link, 22:40)
⚙ Store status resolved server-side → OPEN · capacity 34% · quoted ETA 28 min
⚙ Menu streams from edge cache (RSC). Full menu < 60 KB — no loading spinner.

▸ Browses "Trending Tonight" → taps a burger
⚙ Bottom sheet: variants, modifiers, live stock, prep time
   ⚠ Out of stock → item shows greyed with "Sold out — back tomorrow", "Notify me" CTA

▸ Adds to cart (+ extra cheese ×2)
⚙ Cart persists to localStorage immediately, syncs to server when authenticated
⚙ Floating cart bar animates in: "1 item · ₹189 · View cart"

▸ Taps Checkout
⚙ Not authenticated → auth sheet (does NOT navigate away; cart stays visible behind glass)

┌─ AUTH ─────────────────────────────────────────────────────────────────┐
│ ▸ Enters phone → ⚙ rate check (3/phone/hr, 10/IP/hr) → ✉ OTP via SMS   │
│   ⚠ Rate limited → "Too many tries. Chill for 12 min." + Google option │
│   ⚠ SMS fails → auto-fallback to WhatsApp, then "Continue with Google" │
│ ▸ Enters 6-digit OTP (auto-read via WebOTP API on Android)             │
│   ⚠ Wrong ×3 → OTP invalidated, must resend                            │
│ ⚙ user created · wallet created · referral_code generated              │
│ ⚙ access token (10 min, memory) + refresh cookie (30 d, httpOnly)      │
│ ⚙ Guest cart merged into the account                                   │
└────────────────────────────────────────────────────────────────────────┘

┌─ ADDRESS ──────────────────────────────────────────────────────────────┐
│ ⚙ Requests GPS (with a clear "why" prompt — not a cold browser popup)  │
│   ⚠ Denied → skip straight to building search. Never a dead end.       │
│ ⚙ GPS → nearest buildings ranked by distance                           │
│ ▸ Picks "Abode Valley — Tower C"                                       │
│ ▸ Room 412 · Floor 4 · Landmark "near the lift"                        │
│ ⚙ resolved_zone_id computed (ST_Contains) → SERVICEABLE ✅             │
│   ⚠ Outside all polygons →                                             │
│       🌙 "You're a little outside our midnight kingdom"                │
│       [Notify me when you're covered] → captures demand for zone #2    │
│ ⚙ Delivery fee ₹19 · min order ₹99 · zone ETA baseline applied         │
└────────────────────────────────────────────────────────────────────────┘

▸ Applies coupon MIDNIGHT50
⚙ Validated server-side: window (01:00–04:00?) · min order · per-user cap
   · first-order-only · zone eligibility · stackability
   ⚠ Invalid → precise reason, never a generic "invalid coupon":
      "This one only wakes up after 1 AM ⏰"

⚙ PRICING (pure function, tested to the paisa):
     subtotal          ₹189.00
     − coupon           ₹50.00
     + delivery         ₹19.00
     + packaging         ₹5.00
     + GST 5%            ₹8.20
     ────────────────────────────
     total             ₹171.20   →  17120 paise

▸ Selects UPI
⚙ IDEMPOTENCY-KEY generated client-side (ULID), sent with the request

┌─ PLACEMENT TRANSACTION ────────────────────────────────────────────────┐
│ BEGIN                                                                  │
│  1. Re-validate cart vs CURRENT menu_version                           │
│     ⚠ Price changed → 409, show diff, require explicit re-confirm      │
│  2. Store open? zone serviceable? capacity slot free?                  │
│     ⚠ Capacity full → "Kitchen's at capacity. Back in ~15 min 🔥"      │
│  3. SELECT stock FOR UPDATE (ordered by id) → decrement                │
│     ⚠ Insufficient → 409 naming the exact item, cart auto-adjusted     │
│  4. Lock coupon redemption (unique constraint)                         │
│  5. 💰 Debit wallet if applied (append ledger entry)                   │
│  6. Book capacity slot                                                 │
│  7. INSERT order (AWAITING_PAYMENT) + items WITH PRICE SNAPSHOTS       │
│  8. INSERT outbox ['order.created']                                    │
│ COMMIT                                                                 │
│  9. Create Razorpay order (outside tx)                                 │
│     ⚠ Gateway error → order expires in 10 min, everything auto-released│
└────────────────────────────────────────────────────────────────────────┘

▸ Razorpay checkout → UPI app → approves
⚙ Client callback → optimistic "Payment received" UI ONLY. Nothing persisted.
⚙ ✅ Razorpay WEBHOOK arrives → signature verified (HMAC-SHA256, constant-time)
   → gateway_event_id deduped → payment CAPTURED → order → PLACED
   → outbox ['order.placed']
   ⚠ Webhook late (>20 s) → UI shows "Confirming payment…" with a live poll
   ⚠ Webhook never arrives → reconciliation job polls Razorpay every 2 min for
     30 min. Money is never lost to a missed webhook.

⚙ 🔊 KITCHEN TABLET: new ticket + escalating chime. p95 target < 1.5 s.
✉ Customer: push + "Order secured. Kitchen's got it 🔥"

▸ Auto-routed to /orders/{id} live tracking
```

**Total taps from landing to tracking for a returning customer: 4.** That number is the product.

---

## F-02 · Payment failure & recovery

```
▸ UPI request expires / bank declines / user backs out
⚙ Webhook `payment.failed` OR no webhook at all
⚙ Order stays AWAITING_PAYMENT. Stock stays reserved for the full 10 min.
   ↳ This is deliberate: releasing instantly punishes a customer whose bank
     is just slow, and they'd re-add to an out-of-stock cart.

UI: ⚠ "Payment didn't go through — your cart's safe."
    [ Try again ]  [ Switch to COD ]  [ Pay with wallet ]
    A live 10:00 countdown, because a silent hold feels like a bug.

▸ Retries with the SAME idempotency key
⚙ Joins the SAME order. No duplicate. No double stock decrement.

⚠ 10 min elapse with no capture:
⚙ Worker `orders.expire-unpaid`:
     release stock · release capacity slot · reverse wallet debit ·
     release coupon redemption · status → EXPIRED · outbox event
   Every release is individually idempotent — safe to run twice.
✉ "Your order timed out. Cart's still here whenever you're ready 👀"
```

**The double-charge scenario, explicitly handled:** payment captured *after* expiry (network lag).
Reconciliation detects `CAPTURED` payment against an `EXPIRED` order → **auto-refund to source**,
customer notified, incident logged. No human in the loop, no angry DM at 2 AM.

---

## F-03 · Kitchen accept → cook → ready

```
🔊 Ticket lands. Chime loops until acknowledged (a busy kitchen ignores one beep).
⚙ Urgency colour from promised_at:  NORMAL(purple) → WARNING(amber @ 60%)
                                     → CRITICAL(red, pulsing @ 85%)

▸ Chef taps ACCEPT (huge target — greasy fingers, 3 m away)
⚙ order → ACCEPTED · accepted_at · prep timer starts counting DOWN
⚙ Auto-print receipt (⚠ printer offline → banner + retry queue, never blocks)
✉ Customer: "Kitchen locked in. 🔒"

▸ Items marked ready per station (GRILL / FRYER / BEVERAGE / ASSEMBLY)
⚙ order → PREPARING at first item start
⚙ Live ETA recomputed and pushed to the customer — including when it slips.
   ↳ A visibly updating ETA is trusted. A frozen one is a lie.

▸ All items done → READY
⚙ outbox ['order.ready'] → dispatch room lights up
✉ Customer: "Food's ready. Rider incoming 🛵"

⚠ REJECT branch:
▸ Chef taps REJECT → must pick a reason (no free-text-only rejections):
     OUT_OF_STOCK · TOO_BUSY · CLOSING_SOON · ITEM_ISSUE
⚙ order → REJECTED → 💰 auto-refund initiated within 60 s (full, to source)
⚙ If OUT_OF_STOCK → that product auto-disabled for the rest of the night
✉ "Kitchen couldn't take this one 😔 Full refund's on the way — 3–5 days."
   + a wallet credit as goodwill (amount is an admin setting)

⚠ PARTIAL branch (one item unavailable, rest fine):
▸ Chef marks a single item UNAVAILABLE
⚙ Customer gets a decision, not a fait accompli:
     [ Continue without it — ₹89 refunded ]  [ Cancel whole order ]
⚙ 90 s to respond, else auto-continue with a partial refund
   ↳ Asking is slower. Asking is also why they order again.

⚠ NOBODY TOUCHES THE TICKET FOR 6 MIN:
⚙ Escalation ladder fires (see 01-system-architecture §5.5) →
   admin banner → manager SMS → owner WhatsApp → intake auto-pauses
```

---

## F-04 · Dispatch → delivery → OTP proof

```
⚙ Order READY → auto-assignment scores online riders:
     current load · distance to kitchen · same-building batching bonus ·
     shift time remaining · rider rating
   ⚠ No rider online → dispatch alert; admin can assign manually or
     mark the order for self-pickup with a discount offer

⚙ Rider gets a push + in-app card. 45 s to accept.
   ⚠ Declined / timed out → reassign to next best, log the decline
     (3 declines in a shift → dispatcher notified — this is a staffing signal)

▸ Rider ACCEPTS → delivery ASSIGNED → ACCEPTED_BY_RIDER
✉ Customer: "Driver has entered the grind 🛵"

⚙ BATCHING: up to 3 orders per trip if same building or < 400 m apart
             AND no order would exceed 85% of its promised_at.
             We never batch a nearly-late order to save a trip.

▸ Rider arrives at kitchen → AT_KITCHEN → verifies items → PICKED_UP
⚙ order → OUT_FOR_DELIVERY
✉ Customer: "Your food is officially on a road trip 🌙"
⚙ Customer sees: live countdown, rider name + photo, masked-call button
   (call proxied — the rider never sees the customer's real number, and the
    customer never sees the rider's. Both get harassed otherwise.)

▸ Rider arrives → asks for the 4-digit OTP shown in the customer's app
▸ Enters OTP → ⚙ verified against sha256 hash (works OFFLINE — hash pre-fetched)
   ⚠ Wrong ×3 → locked; rider must use "Customer can't verify" →
     dispatcher confirms by call → manual override, fully audited
⚙ delivery → DELIVERED · order → DELIVERED · GPS + timestamp recorded
💰 COD: rider records cash collected → added to their shift drawer

⚠ FAILED DELIVERY:
▸ Rider taps "Can't deliver" → reason:
     NO_ANSWER (after 2 calls + 5 min wait) · WRONG_ADDRESS ·
     REFUSED · GATE_BLOCKED (real: SRM hostel gates close)
⚙ Photo proof required · dispatcher notified · order → DELIVERY_FAILED
⚙ Refund decision routed to admin (not automatic — this is where fraud lives)

⏱ +30 min after DELIVERED → order → COMPLETED
✉ "Late night cravings successfully defeated. Rate it? ⭐"
```

---

## F-05 · Returning customer (the flow that must be 4 taps)

```
▸ Opens PWA from home screen (installed after order #2 via a soft prompt)
⚙ Session restored silently via refresh cookie. No login screen. Ever.
⚙ Home shows: "Order again?" with their last order as one tappable card

▸ Taps "Reorder"
⚙ Cart rebuilt · unavailable items flagged inline · prices re-validated
   ⚠ Price changed → shown explicitly: "Chicken roll is ₹10 more now"
▸ Taps "Pay ₹171" (default address, default payment method)
▸ UPI approve
→ Tracking screen.  FOUR TAPS.
```

---

## F-06 · Scheduled / pre-open order

```
▸ Opens at 18:15 — store CLOSED
⚙ Not an error screen. An opportunity:
     "Doors open in 45m" + live countdown + full browsable menu
▸ Builds cart → "Schedule for 7:05 PM"
⚙ Slot picker: 10-min slots, capacity-aware (full slots visibly greyed)
▸ Pays now → order PLACED, type=SCHEDULED, hidden from the kitchen queue
⚙ Worker releases it to the kitchen at (scheduled_for − prep_estimate)
✉ 15 min before: "Your pre-order's up next 👀"
   ⚠ Store doesn't open (holiday override set after scheduling) →
     auto-cancel + full auto-refund + apology wallet credit, by 18:00 the same day
```

Pre-open orders are the cheapest revenue in the business: paid, predictable, and they let the kitchen
prep before the 22:30 wall hits.

---

## F-07 · Out-of-zone (the rejection that must not feel like one)

```
▸ Enters an address in Guduvancheri
⚙ ST_Contains → no zone match

🌙  You're a little outside our midnight kingdom
    We're only running around Abode Valley & SRM hostels right now.

    [ Notify me when you're covered ]   ← email/phone capture
    [ Pick a different address ]
    ─────────────────────────────────────
    Map showing our current zone, so it's concrete and not a mystery.

⚙ Logs an out_of_zone_request with the coordinates.
   Admin heatmap of these IS the expansion plan. Zone #2 gets drawn from data.
```

---

## F-08 · Refund (the flow that decides whether we get sued or reviewed)

```
TRIGGERS:  kitchen reject (auto) · item unavailable (auto, partial) ·
           delivery failed (manual review) · quality complaint (manual) ·
           duplicate charge (auto, from reconciliation) · admin goodwill

⚙ AUTO-REFUND (no human) when: kitchen reject, expiry-after-capture, duplicate.
   Full amount, to source, within 60 s of the trigger. Speed is the apology.

⚙ MANUAL REFUND:
  ▸ Support opens the order → Refund → amount, reason, destination
  ⚙ GUARDRAILS:
      · > ₹500 or > 50% of order → requires a second approver (4-eyes)
      · user has ≥3 refunds in 30 days → risk flag surfaced BEFORE approval,
        with their full refund history inline
      · step-up re-auth (password + TOTP) required regardless of amount
  ⚙ Destination:
      SOURCE       → Razorpay refund, 3–5 business days (we say this plainly)
      STORE_WALLET → instant. Offered first, because instant beats "correct"
                     for a hungry 20-year-old, and it retains the revenue.
  💰 INSERT refunds + wallet ledger entry + audit row — one transaction
  ✉ Customer notified with the exact amount, destination, and timeline
```

---

## F-09 · Wallet & referral

```
WALLET CREDIT SOURCES: refunds · referral rewards · goodwill · promo cashback
⚙ Every credit is an append-only ledger row. Balance is a projection.
⚙ Promo credits carry expires_at; a nightly job debits expired credits with
   reason=EXPIRY and notifies 3 days before. No silent expiry.

REFERRAL:
▸ User shares their code (deep link + WhatsApp share sheet — where students live)
▸ Friend signs up with the code
⚙ referral row → PENDING
⚙ QUALIFIES only when the referee's FIRST order reaches DELIVERED
   (not on signup — that's the entire anti-farm mechanism)
⚙ FRAUD CHECKS before payout:
     · same device fingerprint as referrer        → REJECTED_FRAUD
     · same signup IP within 24 h                 → manual review
     · referee phone previously used on any account → REJECTED
     · referrer > 10 qualified referrals in 7 days → manual review
     · referee's delivery address == referrer's    → manual review
💰 On QUALIFIED: referrer +₹50 wallet · referee +₹50 wallet
✉ "Your homie ate. You earned ₹50 💸"
```

I want to be blunt: on a single dense campus with a technically capable population, **referral fraud
is a certainty, not a risk.** The delayed, delivery-gated payout above is the only mechanism that
reliably works; signup-triggered rewards get farmed within days.

---

## F-10 · Store lifecycle across one night

```
18:00  ⚙ Pre-open: menu browsable, scheduling open, countdown live
19:00  ⚙ store_hours opens. Scheduled orders release to the kitchen.
       ⚙ Stock reset job: tracking_date rolls, kitchen confirms today's counts
19:00–22:00  steady. capacity 20–40%.
22:30  ⚙ THE WALL. Capacity 85%+ → ETAs auto-extend, storefront banner appears.
       ▸ Kitchen may toggle RUSH MODE → tighter capacity, simplified queue UI,
         auto-86 of the slowest-prep items
23:00–01:00  peak. Batching aggressive. Dispatch under load.
01:00  ⚙ Late-night coupons activate (valid_from_time)
03:30  ⚙ "Last orders" banner: "Kitchen closing in 30 min ⏳"
04:00  ⚙ Intake stops. In-flight orders continue to completion.
04:30  ⚙ Kitchen closes shift. Riders settle cash drawers. Variance recorded.
05:00  ⚙ Backup. 05:30 ⚙ Analytics rollup for business_date.
05:45  ⚙ Reconciliation: our payments ↔ Razorpay settlement ↔ bank.
       ⚠ Any mismatch → finance alert with the exact orders listed.
06:00  ⚙ Deploy window opens.

PANIC PATHS (any time):
  ▸ Admin → PAUSE ORDERS  → new intake stops instantly, reason shown to customers
  ▸ Admin → HOLIDAY MODE  → closed for the whole business date
  ▸ Kitchen → 86 an item  → removed from the storefront within 2 s
```

---

## F-11 · Guest checkout

```
▸ Adds to cart → Checkout → "Continue as guest"
⚙ Phone verification is STILL mandatory. Non-negotiable: the rider must be
  able to call, and a delivery to an unverifiable phone is a guaranteed
  failed delivery plus a fraud vector.
⚙ Creates a shadow user (status=GUEST, no password). Order attaches to it.
⚙ After delivery: "Save your details for 4-tap reordering?" → one tap upgrades
  the shadow user to a full account, and their order history follows them.
```

Guest checkout that throws away the customer is a wasted acquisition. This one converts.

---

## F-12 · Admin: menu change mid-service

```
▸ Admin edits a price at 23:40
⚙ Draft state. Live menu is UNCHANGED. Nothing ships until publish.
▸ Publish
⚙ New menu_versions row (immutable snapshot) + version bump
⚙ Cache invalidation: Redis key + revalidateTag('menu') + socket 'menu.updated'
⚙ Clients hot-swap the menu without a reload
⚙ ORDERS ALREADY PLACED ARE UNAFFECTED — they carry price snapshots
⚙ Carts holding the old version: re-priced at checkout with an explicit
  "prices changed" confirmation. Never a silent charge difference.
⚙ Audit row: who, when, before → after, on every field
```

---

## F-13 · Super admin: impersonation

```
▸ Super admin → user → "Impersonate"
⚙ REQUIRES: step-up re-auth (password + TOTP) AND a typed reason
⚙ Issues a distinct token: act_as=<user>, impersonator=<admin>, TTL 30 min
⚙ BLOCKED while impersonating: any payment, any refund, any wallet write,
  password change, 2FA change, address deletion, account deletion
⚙ Permanent red banner: "Impersonating rahul@… · 27:14 left · [Exit]"
⚙ EVERY action writes an audit row carrying impersonator_user_id
⚙ Cannot impersonate another SUPER_ADMIN, ever
▸ Exit or expiry → session destroyed, audit row closed
```

---

## F-14 · Rider shift & cash reconciliation (the leak most startups miss)

```
▸ Rider taps "Start shift" → ⚙ shift opens, rider goes online, opening cash recorded
… deliveries …
▸ Taps "End shift"
⚙ System computes expected cash = Σ cod_collected_paise for the shift
▸ Rider counts and enters actual cash
⚙ variance = counted − expected
     · ₹0            → auto-settled ✅
     · within ±₹20   → auto-settled, logged (change-making reality)
     · beyond ±₹20   → escalated to admin, rider must add a note
⚙ Variance TREND per rider is on the finance dashboard.
  A rider consistently ₹30 short isn't one bad night — it's a pattern, and
  you want to see it in week two, not at the annual audit.
```

COD is ~35–50% of orders in this segment. Without this flow, cash leakage is invisible until it is
large. This is why it ships in M4, not "later."
