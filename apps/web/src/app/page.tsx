import Link from 'next/link';
import { getStoreStatus, Money } from '@juice-stop/core';
import { StoreStatusCard } from '@/components/store-status-card';
import { OrderingBanner } from '@/components/ordering-banner';

// Store status must never be served stale — it changes minute to minute.
export const dynamic = 'force-dynamic';

/**
 * Placeholder catalogue. Replaced in M1 by `GET /menu`, which ships the entire menu as one
 * edge-cached payload under 60 KB so switching category is a client-side filter with no
 * network round trip (01-system-architecture.md §12).
 */
const TRENDING = [
  { name: 'Chicken Zinger', tagline: 'Crispy, spicy, unfair', pricePaise: 18900n, wasPaise: 22900n, emoji: '🍔', rating: 4.6, count: 231 },
  { name: 'Peri Peri Fries', tagline: 'Dangerously reorderable', pricePaise: 7900n, wasPaise: null, emoji: '🍟', rating: 4.8, count: 412 },
  { name: 'Cheese Maggi', tagline: '2 AM comfort, certified', pricePaise: 9900n, wasPaise: null, emoji: '🍜', rating: 4.7, count: 388 },
  { name: 'Oreo Thick Shake', tagline: 'Basically a dessert', pricePaise: 12900n, wasPaise: 14900n, emoji: '🥤', rating: 4.5, count: 156 },
] as const;

export default function HomePage() {
  const status = getStoreStatus();

  return (
    <main className="relative min-h-dvh overflow-hidden">
      {/* Ambient gradient mesh. Pure transform/opacity, and it stops entirely under
          prefers-reduced-motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="animate-mesh absolute -top-[30%] left-[-10%] h-[70vh] w-[70vw] rounded-full blur-[100px]"
          style={{ background: 'radial-gradient(circle, rgb(255 107 26 / 0.30), transparent 65%)' }}
        />
        <div
          className="animate-mesh absolute -top-[10%] right-[-15%] h-[60vh] w-[60vw] rounded-full blur-[100px]"
          style={{
            background: 'radial-gradient(circle, rgb(168 85 247 / 0.28), transparent 65%)',
            animationDelay: '-4s',
          }}
        />
      </div>

      <div className="mx-auto w-full max-w-lg px-5 pb-24 pt-6">
        {/* ── Header ─────────────────────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between">
          <div>
            <p className="font-display text-xl font-bold tracking-tight">JUICE STOP</p>
            <div className="mt-1 h-[2px] w-12 rounded-full" style={{ background: 'var(--gradient-brand)' }} />
          </div>
          <p className="tabular font-mono text-sm text-[var(--color-text-secondary)]">
            {status.localTime} IST
          </p>
        </header>

        {/* ── Hero ───────────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-14">
          <h1 className="font-display text-[clamp(2.5rem,11vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.03em]">
            Late night hits
            <br />
            <span className="text-gradient">different.</span> 
          </h1>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            Open till 4&nbsp;AM · Abode Valley &amp; SRM hostels
          </p>
        </section>

        {/* ── Live status ────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-7" style={{ animationDelay: '80ms' }}>
          <StoreStatusCard status={status} />
        </section>

        {/* ── Primary CTA ────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-5" style={{ animationDelay: '140ms' }}>
          {/* Always a live link. The menu is browsable 24/7 — gating this on `acceptingOrders`
              rendered a DISABLED button labelled "Browse the menu", which made browsing
              impossible for the eleven hours a day the kitchen is shut. */}
          <Link
            href="/menu"
            className="group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-[14px] font-display text-base font-semibold text-white transition-transform duration-150 active:scale-[0.97]"
            style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--glow-orange)' }}
          >
            <span className="relative z-10">
              {status.acceptingOrders ? 'Start ordering' : 'Browse the menu'}
            </span>
            <span className="relative z-10 transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
          <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
            Free delivery over {Money.format(Money.paise(29900))} · Min order{' '}
            {Money.format(Money.paise(9900))}
          </p>
        </section>

        {/* ── Why ordering is off, when it is ────────────────────────────────────────────── */}
        {!status.acceptingOrders && (
          <section className="animate-rise mt-4" style={{ animationDelay: '180ms' }}>
            <OrderingBanner status={status} />
          </section>
        )}

        {/* ── Trending ───────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-12" style={{ animationDelay: '200ms' }}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
              Trending tonight
            </h2>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {status.businessDate}
            </span>
          </div>

          <div className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
            {TRENDING.map((item) => (
              <article
                key={item.name}
                className="glass w-[9.5rem] shrink-0 snap-start rounded-[20px] p-3.5"
              >
                <div
                  className="flex h-20 items-center justify-center rounded-[10px] text-4xl"
                  style={{ background: 'var(--gradient-glow)' }}
                  aria-hidden
                >
                  {item.emoji}
                </div>
                <h3 className="mt-3 truncate font-display text-sm font-semibold">{item.name}</h3>
                <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-text-secondary)]">
                  {item.tagline}
                </p>
                <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                  <span aria-hidden>⭐</span>
                  <span className="tabular">{item.rating}</span>
                  <span className="opacity-60">({item.count})</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="tabular font-display text-base font-semibold">
                    {Money.format(Money.paise(item.pricePaise))}
                  </span>
                  {item.wasPaise !== null && (
                    <span className="tabular text-xs text-[var(--color-text-tertiary)] line-through">
                      {Money.format(Money.paise(item.wasPaise))}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Offer ──────────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-8" style={{ animationDelay: '260ms' }}>
          <div className="gradient-border rounded-[20px] p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                ⚡
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold tracking-wide text-[var(--color-purple-300)]">
                  MIDNIGHT50
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {Money.format(Money.paise(5000))} off after 1 AM · min{' '}
                  {Money.format(Money.paise(24900))}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Delivery area ──────────────────────────────────────────────────────────────── */}
        <section className="mt-8 text-center">
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
            We only deliver around{' '}
            <span className="text-[var(--color-text-primary)]">Abode Valley</span>, SRM hostels and
            nearby PGs.
            <br />
            Anywhere else and you&apos;re a little outside our midnight kingdom 🌙
          </p>
        </section>
      </div>
    </main>
  );
}
