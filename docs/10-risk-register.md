# 10 — Risk Register

Scored **L**ikelihood × **I**mpact (1–5). Score ≥ 15 = must be mitigated before launch.
Reviewed at every milestone gate and after every incident.

---

## Critical — mitigate before taking real money

### R-01 · Money divergence between our DB, the gateway, and the bank · L4 × I5 = **20**

Three systems record every transaction; they will disagree. Undetected, discrepancies compound
silently and surface as an unexplained shortfall months later, when the audit trail is cold.

**Mitigation:** integer paise only, enforced by a lint rule · webhook-as-truth, never the client
callback · `Idempotency-Key` on every money mutation · append-only wallet ledger with
`balance_after_paise` on each row · nightly three-way reconciliation with P2 alerting on any mismatch
· nightly ledger-integrity assertion (`SUM(credits) − SUM(debits) === balance`) with **P0** alerting
on drift. **Owner:** Solo dev. **Gate:** M2 (idempotency + ledger) · M6 (nightly integrity assertion,
**before launch**) · M7 (full three-way reconciliation).

### R-02 · Double-charging a customer · L3 × I5 = **15**

Flaky mobile networks make retries routine. A double charge at 1 AM produces a public Instagram story
before it produces a support ticket.

**Mitigation:** client-generated idempotency keys · unique constraint on `(key, user_id)` · gateway
event dedupe on `gateway_event_id` · reconciliation auto-refunds any capture against an expired or
cancelled order without human involvement · integration test asserting double-submit yields one order,
one charge, one ledger entry. **Owner:** Backend lead. **Gate:** M2.

### R-03 · Kitchen device failure during service · L4 × I5 = **20**

The single point of failure in the whole business. A dead tablet at 01:00 stops revenue completely,
and worse, silently.

**Mitigation:** offline-first PWA with a local action queue · Wake Lock · **heartbeat + 3-level
escalation ladder** (admin banner → manager SMS → owner WhatsApp + automatic intake pause) · a second
tablet on the same account as live failover · printed-ticket fallback · a documented, rehearsed
runbook. **Owner:** Solo dev. **Gate:** M3, drilled live in M6 before launch.

### R-04 · Razorpay outage during peak · L2 × I5 = **10** *(elevated: no fallback = business stops)*

**Mitigation:** circuit breaker → automatic COD-only mode with a customer-facing banner · carts and
orders survive the outage · queued retry of payment intents · gateway abstraction means a second
provider is a 2-day integration, not a rewrite · status-page monitoring feeding a P1 alert.
**Owner:** Solo dev. **Gate:** M2, drilled in M6.

### R-05 · Systematically overpromised ETAs · L4 × I4 = **16**

The #1 retention killer in late-night food. A 25-minute promise delivered in 70 minutes loses the
customer permanently — and they tell their floor.

**Mitigation:** capacity-slot model with explicit kitchen throughput · ETA computed from live queue
depth, not a constant · automatic ETA extension above 85% load with a visible storefront banner ·
**intake pause at 100%** · promised-vs-actual tracked as a first-class metric with a p80 confidence
buffer that self-tunes from the last 200 comparable orders. Thresholds and the audited admin override
are locked in ADR-013. **Owner:** Solo dev. **Gate:** M2/M3, reviewed weekly through the launch rollout.

### R-06 · Cash (COD) leakage · L4 × I4 = **16**

COD is 35–50% of orders in this segment. Cash, students, night shifts, and young riders is a
combination that leaks without deliberate controls — usually slowly enough to go unnoticed.

**Mitigation:** per-shift cash drawer sessions · system-computed expected cash · rider-entered counted
cash · variance auto-settled within ±₹20, escalated beyond · **per-rider variance trend on the finance
dashboard** · COD capped by order value, zone, and user risk · COD disabled for new users and after
prior COD failure. **Owner:** Finance/Ops. **Gate:** M4.

### R-07 · Referral and coupon fraud · L5 × I3 = **15**

Not a risk — a certainty. A dense, technically capable, incentive-motivated population on one campus.
Farms will appear within days of launch.

**Mitigation:** referral rewards pay out **only after the referee's first order is DELIVERED**, never
on signup · device fingerprint, signup IP, phone-reuse, address-match and velocity checks · per-user
and global coupon caps enforced by unique DB constraints inside the placement transaction · anomaly
report reviewed weekly · rewards to store wallet (retains the value) rather than cash.
**Owner:** Solo dev. **Gate:** M7 — referrals are deliberately **not** in the launch cut, which
removes this entire fraud surface from launch night.

---

## High

### R-08 · GPS inaccuracy causing wrongly rejected customers · L4 × I3 = **12**
Civilian GPS is ±30–150 m inside concrete hostel buildings. Literal device-GPS gating rejects real,
paying customers standing in their own room.
**Mitigation:** serviceability decided on the **verified delivery address**, not the live device
position (ADR-004) · curated building catalog with operator-verified coordinates · GPS assists
selection and flags fraud, never blocks · out-of-zone attempts logged with coordinates and surfaced as
an expansion heatmap. **Owner:** Product.

### R-09 · Peak-hour rider shortage · L4 × I3 = **12**
22:30–00:30 concentrates most of the night's volume. Too few riders means READY food going cold.
**Mitigation:** batching (≤3 orders, ETA-protected) · rider ETA folded into the quoted promise so the
customer is told the truth · dispatch alert when riders-online < forecast · self-pickup offered with a
discount when dispatch is saturated · staffing model driven by the peak-hour analytics from M9.
**Owner:** Ops.

### R-10 · Poor connectivity in hostels breaking realtime · L5 × I2 = **10**
**Mitigation:** the entire realtime design assumes this — REST is truth, sockets are hints, version
gaps trigger refetch, polling fallback after 15 s offline, optimistic UI with rollback, aggressive
caching, cart persisted locally. **Owner:** Frontend lead.

### R-11 · Data breach exposing customer PII · L2 × I5 = **10**
Names, phones, addresses and location for thousands of students. A breach is a DPDP Act matter and a
reputational end-state on a campus that talks.
**Mitigation:** full control set in `09-deployment.md §7` · least privilege · encrypted at rest ·
log redaction with a proving test · no card data ever (SAQ-A) · quarterly access review · incident
response plan with a 72-hour notification path. **Owner:** CTO.

### R-12 · Semester-break revenue collapse · L5 × I4 = **20** *(business risk, not technical)*

SRM empties during vacations. Revenue can fall **80–90% for 4–8 weeks, twice a year.** This is the
most under-appreciated risk in the entire plan, and no amount of good code addresses it.

**Mitigation (product/ops, not engineering):** academic-calendar awareness built into the forecasting
model so projections aren't fiction · planned reduced-hours or closure during breaks (holiday mode
already exists) · fixed costs kept low and variable — the ₹11,700/month infra bill is deliberately
small enough to survive a dead month · cash reserve sized to two lean months · consider staff/faculty
and nearby-resident segments as counter-seasonal demand. **Owner:** Founder/CEO.

### R-13 · Food safety incident or serious quality complaint · L2 × I5 = **10**
**Mitigation:** FSSAI licence displayed on every invoice · batch/prep timestamps on every order for
traceability · complaint workflow with mandatory photo evidence · refund + escalation policy ·
per-product complaint-rate monitoring that flags a bad item before it becomes a pattern.
**Owner:** Ops/Founder.

### R-14 · Regulatory non-compliance (GST · FSSAI · DPDP) · L3 × I4 = **12**
**Mitigation:** GST registration before launch (turnover will exceed the ₹20 lakh services threshold
comfortably) · gapless per-FY invoice numbering with CGST/SGST split and HSN/SAC 996331 · FSSAI number
on invoices · DPDP: consent capture, erasure workflow with a documented statutory-retention exemption
for financial records, 3-year audit retention. **Confirm the specific GST treatment and rate with a
practising CA before launch** — restaurant-service GST rules and e-commerce-operator liability have
changed repeatedly and are not something to take from an architecture document.
**Owner:** Founder + CA.

---

## Medium

| ID | Risk | Score | Mitigation |
|---|---|---|---|
| R-15 | Stock oversell under concurrent orders | 9 | `SELECT FOR UPDATE` ordered by id + `CHECK (available_qty >= 0)` + a concurrency integration test |
| R-16 | Notification cost spiral (SMS/WhatsApp) | 9 | Web Push first (free); SMS restricted to OTP + arrival; channel routing behind a feature flag; monthly cost alert |
| R-17 | Google Maps quota / cost overrun | 6 | Aggressive caching of building-pair distances; per-zone static ETA baselines as fallback; hard billing cap |
| R-18 | Key-person dependency (single engineer) | 12 | This documentation set · ADRs recording *why* · no undocumented infrastructure · runbooks · second person with production access |
| R-19 | Prank DDoS / scripted order spam from campus | 9 | Cloudflare bot management · per-phone and per-IP OTP limits · order velocity limits · payment required before the kitchen ever sees a ticket |
| R-20 | Review bombing / abusive UGC | 6 | Reviews only from delivered orders · moderation queue · rate limits · right of reply |
| R-21 | Migration breaking production | 8 | Expand/contract only · migration linter in CI · staging rehearsal · deploy window · rollback plan in every migration header |
| R-22 | Vendor lock-in (Vercel / DO / Razorpay) | 6 | Everything containerised and portable · payment gateway behind a port/adapter · no proprietary runtime APIs |
| R-23 | Scope creep delaying launch | 12 | Milestone gates with written acceptance criteria · deferred-scope list in `README.md §4` · "Night One" cut defined and costed |
| R-24 | Kitchen staff rejecting the software | 12 | **Design *with* the kitchen, not for it** · 64px targets, three columns, zero navigation · on-site observation during M3 · training in M6 · the ability to fall back to printed tickets at any moment |

---

## Risk posture

**What we accept:** single-region hosting (Mumbai) · a modular monolith rather than services ·
no native apps at launch · one payment gateway live · manual restore procedure.

**What we do not accept:** any unreconciled money · any unaudited privileged action ·
any deploy during service hours · any order promised that the kitchen cannot cook ·
any customer PII in logs.

**Top three to re-read before every launch decision:** R-01 (money divergence), R-03 (kitchen device
failure), R-12 (semester seasonality). The first two can end a night; the third can end the business,
and it is the one no code in this repository will ever fix.
