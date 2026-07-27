# 09 — Deployment Architecture & Operations

---

## 1. Environments

| Env | Purpose | Data | Infra |
|---|---|---|---|
| **local** | Development | Seeded, synthetic | Docker Compose: Postgres+PostGIS, Redis, MinIO, MailHog |
| **preview** | One per PR, auto-torn-down | Seeded, ephemeral | Vercel preview + shared staging API + branched DB (Neon) |
| **staging** | Pre-prod verification, load tests, drills | Anonymised production-shaped | Mirrors prod at 1 replica each |
| **production** | Real money | Real | See §3 |

**Staging is never skipped.** Every release passes through it. Gateways in **test mode** everywhere
except production, enforced by a boot-time assertion that refuses to start if a live Razorpay key is
present outside production.

---

## 2. CI/CD

```
PR opened
  ├─ install (pnpm, frozen lockfile)
  ├─ lint · typecheck · boundaries · migration-lint          ┐
  ├─ unit tests (Vitest)                                      │ parallel
  ├─ integration tests (Testcontainers: real PG + Redis)      │
  ├─ build all apps + bundle-size budget check                ┘
  ├─ E2E (Playwright, headless, seeded)
  ├─ security: pnpm audit · Semgrep · secret scan (gitleaks)
  ├─ a11y: axe on key routes
  └─ deploy preview → comment URL on the PR

merge to main
  ├─ full verify (re-run, no cache)
  ├─ build + push images (GHCR, tagged by commit SHA — never `latest`)
  ├─ deploy → staging
  ├─ smoke tests against staging
  ├─ ⏸ MANUAL APPROVAL  (+ deploy-window check)
  ├─ migrate production (expand-only, reviewed)
  ├─ rolling deploy (health-gated, one replica at a time)
  ├─ post-deploy smoke + 10-min error-rate watch
  └─ auto-rollback if error rate > 2% or health fails
```

### The deploy window — a hard operational rule

```
✅ DEPLOY ALLOWED     04:30 – 18:00 IST
🚫 DEPLOY BLOCKED     18:00 – 04:30 IST  (pre-service + service)
```

CI **refuses** to deploy to production outside the window. Overriding requires a labelled
`emergency-deploy` PR with a written incident reference and two approvals.

A bad deploy at 23:30 doesn't cost a rollback — it costs the night's revenue, a kitchen in chaos, and
sixty students who never come back. There is no feature worth shipping at peak.

**Emergency hotfix protocol:** feature-flag kill switch first (instant, no deploy), config change
second, code deploy only as a last resort — and if a code deploy is unavoidable during service,
`PAUSE ORDERS` goes on first, deploy, verify, then unpause.

---

## 3. Production topology

### Option A — **Lean** (recommended for Year 1)

```
                    ┌─────────────────────────────┐
                    │        CLOUDFLARE           │
                    │  DNS · WAF · CDN · DDoS     │
                    │  Bot mgmt · rate-limit L0   │
                    └──────────────┬──────────────┘
              ┌────────────────────┴───────────────┐
              │                                    │
   ┌──────────▼───────────┐         ┌──────────────▼──────────────┐
   │   VERCEL             │         │  DigitalOcean BLR1 Droplet  │
   │   4 Next.js apps     │         │  4 vCPU / 8 GB / Ubuntu 24  │
   │   edge, auto-scaled  │         │  ┌────────────────────────┐ │
   └──────────────────────┘         │  │ NGINX (TLS, WS, rate)  │ │
                                    │  ├────────────────────────┤ │
                                    │  │ api      ×2 (Docker)   │ │
                                    │  │ realtime ×2            │ │
                                    │  │ worker   ×1            │ │
                                    │  └────────────────────────┘ │
                                    └──────────┬──────────────────┘
                      ┌────────────────────────┼──────────────────┐
          ┌───────────▼──────────┐ ┌───────────▼────────┐ ┌───────▼─────────┐
          │ DO Managed Postgres  │ │ DO Managed Redis   │ │ DO Spaces (S3)  │
          │ 2 GB, PITR, daily bk │ │ 1 GB, persistence  │ │ invoices, proof │
          └──────────────────────┘ └────────────────────┘ └─────────────────┘
```

Managed Postgres and Redis, not self-hosted, deliberately: backups, failover and patching are the two
things a small team reliably gets wrong, and the ₹3,000/month is the cheapest insurance available.

### Option B — **Scaled** (when 800+ orders/night or outlet #2)

AWS ap-south-1: ALB → ECS Fargate (api ×3, realtime ×2 sticky, worker ×2) → RDS PostgreSQL Multi-AZ +
read replica → ElastiCache Redis (cluster, multi-AZ) → S3 + CloudFront. Terraform in `infra/terraform`.

**Migration path A → B is intentionally non-disruptive:** same containers, same env contract, only
orchestration changes. We do not need to choose B today, and choosing it today would waste ~₹40k/month
on capacity we can't use.

---

## 4. Cost model (INR/month, realistic)

**Year 1, ~200 orders/night ≈ ₹15L/month GMV — Option A:**

| Item | Cost |
|---|---|
| DO Droplet 4vCPU/8GB (BLR1) | ₹4,000 |
| DO Managed Postgres 2GB + PITR | ₹2,500 |
| DO Managed Redis 1GB | ₹1,250 |
| DO Spaces + CDN | ₹450 |
| Vercel Pro (4 apps, 1 seat) | ₹1,700 |
| Cloudflare Pro | ₹1,700 |
| Cloudinary (free → ₹0) | ₹0 |
| Sentry / Grafana Cloud (free tiers) | ₹0 |
| Domain + TLS | ₹100 |
| **Fixed infrastructure** | **≈ ₹11,700** |
| SMS/OTP (MSG91, ~18k msgs @ ₹0.20) | ₹3,600 |
| WhatsApp Business (utility templates) | ₹1,500 |
| Google Maps (aggressively cached) | ₹800 |
| **Total operational** | **≈ ₹17,600/month** |

**Payment processing dwarfs all of it — and is controllable:**

| Method | MDR | On ₹15L/month |
|---|---|---|
| **UPI** | **0%** (zero MDR is mandated for P2M UPI in India) | **₹0** |
| Cards / Netbanking / Wallets | ~2% + GST | ~₹35,400 |

**This is the single highest-leverage financial decision in the product.** Every percentage point of
volume moved from cards to UPI is straight margin. Concretely: default the payment selector to UPI,
make it the visually primary option, and consider a small UPI-only incentive — a ₹5 discount on a
₹300 order costs 1.7% and saves 2.4%.

Two caveats to verify before relying on this: confirm your Razorpay contract actually passes through
zero UPI MDR (some plans levy a separate platform fee), and re-check current rates at signing —
gateway pricing and MDR policy both move. Treat the table as the shape of the decision, not a quote.

**Notification cost is the other silent leak.** At 300 orders/night, careless per-status SMS reaches
₹9,000/month. Mitigation: **Web Push first** (free), SMS reserved for OTP and delivery-arrival only.
Push-vs-SMS routing is a feature flag so the cost can be tuned without a deploy.

---

## 4b. Staged infrastructure spend — **LOCKED** (ADR-017)

The §4 table is the *mature* cost. We do not pay it on day one. Spend is staged against risk: while
no real money is flowing, infrastructure costs nothing.

| Phase | Milestones | Cost/month | What we're buying |
|---|---|---|---|
| **Build** | M0 – M5 | **₹0** | Nothing is at risk yet. Free tier throughout |
| **Pilot** | M6 – launch | **≈ ₹4,000** | Managed Postgres with real PITR + SMS/OTP. Protects money, nothing else |
| **Scale** | 300+ orders/night | ≈ ₹17,600 | The full §3 Option A topology |

### Build-phase stack (₹0)

| Layer | Service | Notes |
|---|---|---|
| Compute (API, worker, realtime, Redis) | **Oracle Cloud Always Free**, Mumbai — 4 ARM cores / 24 GB / 200 GB | More capacity than the ₹4,000 droplet. Node runs natively on arm64; our images are multi-arch |
| Postgres + PostGIS | Neon or Supabase free tier | Dev/staging only — see the warning below |
| Redis | Docker container on the same VM | Free, and lower latency than managed |
| Frontends | **Self-hosted Next.js** (standalone output) on the same VM | See the Vercel warning below |
| CDN · WAF · DDoS · DNS | Cloudflare Free | Production-grade at the free tier |
| Media | Cloudinary Free | Ample for a ~60-item menu |
| CI/CD | GitHub Actions (2,000 min/mo private) | We use roughly 40% |
| Errors · metrics · logs | Sentry Free · Grafana Cloud Free | |
| Payments | Razorpay — transaction fees only, no monthly fee | Test mode during build |
| Email | AWS SES (~₹0.01/email) | ~₹75/mo at 9k emails — cheaper than Resend's paid tier |

### Three traps, stated explicitly

1. **Vercel Hobby prohibits commercial use.** Juice Stop takes money, so Hobby is a licence
   violation, not a loophole. Options: self-host Next.js on the VM during the build (chosen), then
   buy Vercel Pro (~₹1,700/mo) at launch if the DX is worth it. A storefront suspended mid-service
   at 23:30 is an unrecoverable evening.
2. **Free tiers that scale to zero are disqualifying for the API.** Render and Fly free services
   spin down after idle and cold-start in 30–50 s. Our store is idle 15 hours a day and then bursts
   — the first order of the night would time out. Oracle Always Free does not spin down.
3. **Free Postgres has thin backup and PITR guarantees.** This is the one line item I argue against
   keeping free once real money flows. **Managed Postgres with real PITR is the first ₹2,500 spent**
   — losing the database loses the business, and R-01/R-11 are not survivable on a best-effort backup.

**Free-tier terms change constantly.** Verify current limits at signup. The staging logic above holds
regardless of the specific numbers: pay for durability first, convenience later.

### Portability guarantee

Every build-phase choice is deliberately swappable without application changes: containers are
multi-arch, Postgres is vanilla + PostGIS (no vendor extensions), Redis is standard, media is behind
an upload port, and payments are behind the `PaymentGateway` port (ADR-014). Moving Oracle → DO → AWS
changes orchestration and environment variables only. **No provider SDK is imported outside an
adapter** — CI enforces it via the module boundary rules.

---

## 5. Container strategy

Multi-stage builds, distroless runtime, non-root user, pinned base digests.

```dockerfile
FROM node:24-alpine AS deps      # pnpm fetch --frozen-lockfile
FROM node:24-alpine AS build     # turbo build --filter=api
FROM gcr.io/distroless/nodejs24-debian12 AS runtime
USER nonroot
ENV NODE_ENV=production
HEALTHCHECK CMD ["/nodejs/bin/node","dist/healthcheck.js"]
CMD ["dist/main.js"]
```

One image, three roles via `APP_ROLE=api|realtime|worker`. Identical bits in every environment;
`docker compose` locally, the same image in production. Images are tagged by commit SHA — `latest` is
banned, because "which build is running?" must always have an exact answer.

---

## 6. NGINX

```nginx
limit_req_zone $binary_remote_addr zone=api:10m  rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=1r/s;

upstream api      { least_conn; server api1:3000; server api2:3000; keepalive 32; }
upstream realtime { ip_hash;    server rt1:3001;  server rt2:3001; }   # sticky: required for WS

server {
  listen 443 ssl http2;
  server_name api.juicestop.in;

  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options DENY always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;

  client_max_body_size 8m;              # review photos, receipts

  location /ws {
    proxy_pass http://realtime;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;           # long-lived kitchen sockets
    proxy_send_timeout 3600s;
  }

  location /api/v1/auth/ { limit_req zone=auth burst=5  nodelay; proxy_pass http://api; }
  location /api/         { limit_req zone=api  burst=50 nodelay; proxy_pass http://api; }

  # Razorpay retries aggressively — never throttle or buffer webhooks
  location /api/v1/webhooks/ { proxy_pass http://api; proxy_request_buffering off; }
}
```

`ip_hash` on the realtime upstream is not optional — Socket.IO's HTTP long-polling handshake breaks
across replicas without sticky routing, and the Redis adapter solves fan-out, not session affinity.

---

## 7. Security controls

| Layer | Controls |
|---|---|
| **Edge** | Cloudflare WAF (OWASP ruleset), DDoS, bot management, country rules, `/auth` rate limits |
| **Transport** | TLS 1.3 only, HSTS preload, certificate auto-renewal, monitored expiry |
| **Headers** | Strict CSP (no `unsafe-inline`; nonce-based), `nosniff`, `DENY` framing, Referrer-Policy, Permissions-Policy |
| **CORS** | Explicit origin allowlist. No wildcard, ever. Credentials only for known origins |
| **CSRF** | Double-submit cookie on all cookie-authenticated mutations; `SameSite=Lax` |
| **Auth** | Argon2id (m=64MB, t=3, p=4), OTP hashed + single-use, refresh rotation with reuse detection, TOTP for admin+ |
| **Authorisation** | Permission-based guards; **object-level checks on every read** (a customer fetching another's order must 404, not 403 — a 403 confirms existence) |
| **Input** | Zod at the boundary + class-validator; strict allowlists; HTML sanitised on any user-generated content |
| **SQL injection** | Prisma parameterised throughout; raw SQL requires review + parameter binding; a lint rule flags template-literal SQL |
| **XSS** | React escaping; `dangerouslySetInnerHTML` banned by lint; CSP as defence in depth |
| **Secrets** | Doppler (or AWS Secrets Manager); **zero secrets in the repo**; `gitleaks` in CI; quarterly rotation; `.env.example` only |
| **PII** | Encrypted at rest (managed DB); TOTP secrets and licence numbers column-encrypted (pgcrypto); logs redacted at the serialiser with a unit test proving it |
| **Payments** | **We never touch card data.** Razorpay hosted checkout → PCI-DSS SAQ-A. Webhook signatures verified constant-time on the raw body |
| **Audit** | Append-only, trigger-protected, 3-year retention, actor + IP + before/after |
| **Dependencies** | Renovate weekly, `pnpm audit` blocking on high, lockfile committed |
| **Access** | SSH keys only, no password auth, 2FA on every provider account, least-privilege IAM |

**Practices to keep sharp:** quarterly access review · quarterly restore drill · annual pen test once
GMV is material · a written incident-response plan with named owners.

---

## 8. Observability

| Signal | Tool | Retention |
|---|---|---|
| Logs | Pino JSON → Grafana Loki | 30 d hot, 1 y archived |
| Traces | OpenTelemetry → Tempo | 7 d |
| Metrics | Prometheus → Grafana | 90 d |
| Errors | Sentry (all four apps + API) | 90 d |
| Uptime | Better Stack, 1-min checks from Mumbai | 1 y |
| RUM | Vercel Analytics + Web Vitals | 90 d |

**Dashboards:** *Tonight* (live orders, revenue, capacity, kitchen latency, riders) ·
*System Health* · *Money* (payments, refunds, reconciliation drift) · *Funnel*.

**Alert routing — deliberately tiered, because alert fatigue is how real incidents get missed:**

| Severity | Examples | Route |
|---|---|---|
| **P0 — wake someone** | API down · payment webhooks failing · kitchen offline > 5 min during service · wallet ledger drift ≠ 0 | Phone call + SMS + WhatsApp |
| **P1 — respond in 15 min** | Error rate > 2% · p95 > 2 s · order unaccepted > 6 min · queue depth > 500 | Push + WhatsApp |
| **P2 — next morning** | Reconciliation mismatch · cash variance > ₹100 · low stock · cert expiring | Email digest |
| **P3 — weekly** | Dependency updates · slow-query report · zero-result searches | Dashboard |

---

## 9. Nightly operations schedule (IST)

```
04:00  Order intake stops (in-flight orders continue)
04:30  Kitchen shift close · rider cash drawers settle · deploy window OPENS
05:00  Automated backup + logical dump → S3
05:30  Analytics rollup for the business date
05:45  Three-way reconciliation (payments ↔ gateway ↔ bank) → finance alert on any mismatch
06:00  Wallet ledger integrity assertion (sum === balance, every wallet)
06:15  Stock reset prep · low-stock report to the kitchen lead
06:30  Nightly ops digest email: revenue, orders, ETA accuracy, refunds, variance, incidents
18:00  DEPLOY WINDOW CLOSES · pre-service checklist
18:45  Kitchen device check-in (heartbeat verified before opening)
19:00  Service begins
```

## 10. Runbooks (`docs/runbooks/`, authored in M6, before launch)

`kitchen-device-failure` · `payment-gateway-outage` · `database-failover` ·
`restore-from-backup` (two-person) · `refund-dispute` · `cash-variance-investigation` ·
`ddos-under-attack` · `emergency-deploy` · `secret-rotation` · `data-erasure-request` ·
`rider-no-show-at-peak` · `incident-postmortem-template`.

Every runbook: trigger, severity, first response, decision tree, rollback, comms template, owner.
Rehearsed at least once before launch — a runbook first read during an incident is a wish, not a plan.
