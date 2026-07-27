import Link from 'next/link';
import { getStoreStatus, Money, MIN_ORDER_PAISE } from '@juice-stop/core';
import { StoreStatusCard } from '@/components/store-status-card';
import { OrderingBanner } from '@/components/ordering-banner';
import { ArrowRightIcon, ClockIcon, MapPinIcon, SparkIcon, StarIcon } from '@/components/icons';
import { PRODUCTS } from '@/data/menu';

// Store status changes minute to minute, so this page is never served stale.
export const dynamic = 'force-dynamic';

/** Top-rated items, derived from the catalogue rather than hand-listed twice. */
const TRENDING = [...PRODUCTS]
  .filter((p) => p.inStock)
  .sort((a, b) => b.rating * b.ratingCount - a.rating * a.ratingCount)
  .slice(0, 5);

export default function HomePage() {
  const status = getStoreStatus();

  return (
    <main className="page-in relative min-h-dvh overflow-hidden">
      {/* Ambient mesh. Transform/opacity only, and it stops under prefers-reduced-motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="animate-mesh absolute -top-[30%] left-[-10%] h-[70vh] w-[70vw] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, rgb(255 107 26 / 0.28), transparent 65%)' }}
        />
        <div
          className="animate-mesh absolute -top-[10%] right-[-15%] h-[60vh] w-[60vw] rounded-full blur-[110px]"
          style={{
            background: 'radial-gradient(circle, rgb(168 85 247 / 0.26), transparent 65%)',
            animationDelay: '-4s',
          }}
        />
      </div>

      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        {/* ── Header ─────────────────────────────────────────────────────────────────────── */}
        <header className="flex items-end justify-between">
          <div>
            <p className="font-display text-xl font-bold tracking-tight">JUICE STOP</p>
            <div
              className="gradient-animate mt-1.5 h-[2px] w-12 rounded-full"
              style={{ background: 'var(--gradient-brand)' }}
            />
          </div>
          <p className="tabular flex items-center gap-1.5 font-mono text-sm text-[var(--color-text-secondary)]">
            <ClockIcon size={14} />
            {status.localTime}
          </p>
        </header>

        {/* ── Hero ───────────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-14">
          <h1 className="font-display text-[clamp(2.5rem,11vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.035em]">
            Late night hits
            <br />
            <span className="text-gradient gradient-animate">different.</span>
          </h1>
          <p className="mt-4 flex items-center gap-1.5 text-base text-[var(--color-text-secondary)]">
            <MapPinIcon size={15} />
            Abode Valley &amp; SRM hostels · till 4 AM
          </p>
        </section>

        {/* ── Live status ────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-7" style={{ animationDelay: '80ms' }}>
          <StoreStatusCard status={status} />
        </section>

        {/* ── Primary CTA ────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-5" style={{ animationDelay: '140ms' }}>
          {/* Always a live link — the menu is browsable 24/7. */}
          <Link
            href="/menu"
            className="pressable sheen group flex h-14 w-full items-center justify-center gap-2 rounded-[14px] font-display text-base font-semibold text-white"
            style={{ background: 'var(--gradient-brand)', boxShadow: 'var(--glow-orange)' }}
          >
            <span className="relative z-10">
              {status.acceptingOrders ? 'Start ordering' : 'Browse the menu'}
            </span>
            <span className="relative z-10 transition-transform duration-200 group-hover:translate-x-1">
              <ArrowRightIcon size={19} strokeWidth={2.2} />
            </span>
          </Link>

          <div className="mt-3.5 flex items-center justify-center gap-2 text-xs">
            <span
              className="rounded-full px-2.5 py-1 font-semibold"
              style={{ background: 'rgb(34 197 94 / 0.15)', color: 'var(--color-success)' }}
            >
              Free delivery, always
            </span>
            <span className="text-[var(--color-text-tertiary)]">
              Min order {Money.format(MIN_ORDER_PAISE)}
            </span>
          </div>
        </section>

        {/* ── Why ordering is off, when it is ────────────────────────────────────────────── */}
        {!status.acceptingOrders && (
          <section className="animate-rise mt-4" style={{ animationDelay: '180ms' }}>
            <OrderingBanner status={status} />
          </section>
        )}

        {/* ── Trending ───────────────────────────────────────────────────────────────────── */}
        <section className="animate-rise mt-12" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
              <SparkIcon size={13} />
              Trending tonight
            </h2>
            <Link
              href="/menu"
              className="flex items-center gap-0.5 text-xs font-medium text-[var(--color-purple-300)]"
            >
              See all
              <ArrowRightIcon size={13} />
            </Link>
          </div>

          <div className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
            {TRENDING.map((item) => (
              <Link
                key={item.id}
                href="/menu"
                className="glass liftable w-[9.75rem] shrink-0 snap-start rounded-[20px] p-3.5"
              >
                <div
                  className="flex h-20 items-center justify-center rounded-[12px] text-4xl"
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
                  <StarIcon size={12} filled className="text-[var(--color-warning)]" />
                  <span className="tabular">{item.rating}</span>
                  <span className="opacity-60">({item.ratingCount})</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="tabular font-display text-base font-semibold">
                    {Money.format(Money.paise(item.pricePaise))}
                  </span>
                  {item.compareAtPaise !== null && (
                    <span className="tabular text-xs text-[var(--color-text-tertiary)] line-through">
                      {Money.format(Money.paise(item.compareAtPaise))}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Delivery area ──────────────────────────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="glass-subtle rounded-[18px] px-4 py-4 text-center">
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              We deliver around{' '}
              <span className="text-[var(--color-text-primary)]">Abode Valley</span>, SRM hostels and
              nearby PGs.
              <br />
              Anywhere else and you&apos;re a little outside our midnight kingdom.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
