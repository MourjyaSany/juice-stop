import { HapticLink as Link } from '@/components/haptic-link';
import { getStoreStatus, orderingBlockedMessage } from '@juice-stop/core';
import { Hero } from '@/components/landing/hero';
import { ActiveOrders } from '@/components/landing/active-orders';
import { PopularTonight } from '@/components/landing/popular-tonight';
import { TreasureMap } from '@/components/landing/treasure-map';
import { Reviews } from '@/components/landing/reviews';
import { ScrollReveal, StickerField } from '@/components/system';
import { ArrowRightIcon } from '@/components/icons';

// Store status changes minute to minute, so this page is never served stale.
export const dynamic = 'force-dynamic';

/**
 * Landing page.
 *
 * A **Server Component**: the store status — the one thing on this page that must be true at
 * first paint — is computed here and passed down. Only the sections that genuinely need
 * interaction (motion, countdown, scroll progress) are client components.
 *
 * The page tells a story before it shows a menu: what this place is, that it is open right now,
 * what people are eating, and exactly what happens after you tap.
 */
export default function HomePage() {
  const status = getStoreStatus();
  const blockedMessage = orderingBlockedMessage(status);

  return (
    <main className="page-in relative min-h-dvh overflow-x-hidden">
      <Hero status={status} />

      {/* Anything of yours currently being cooked outranks everything else on this page. */}
      <ActiveOrders />

      {blockedMessage !== null && (
        <div className="mx-auto w-full max-w-lg px-5">
          <ScrollReveal>
            <div
              role="status"
              className="flex items-start gap-3 rounded-[16px] px-4 py-3.5"
              style={{
                background: 'linear-gradient(135deg, rgb(255 107 26 / 0.10), rgb(168 85 247 / 0.07))',
                border: '1px solid rgb(255 107 26 / 0.24)',
              }}
            >
              <span aria-hidden className="mt-0.5 text-base">
                🌙
              </span>
              <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  Menu is open · ordering from 7 PM
                </span>
                <br />
                {blockedMessage}
              </p>
            </div>
          </ScrollReveal>
        </div>
      )}

      <PopularTonight />

      <Reviews />

      {/* Stickers scattered behind the journey — seeded placement with a minimum-distance check,
          so they stay evenly spread rather than clumping. */}
      <div className="relative">
        <StickerField count={11} seed={23} opacity={0.14} />
        <TreasureMap />
      </div>

      {/* ── Closing CTA ─────────────────────────────────────────────────────────────────── */}
      <section className="pb-nav relative mx-auto w-full max-w-lg px-5">
        <ScrollReveal>
          <div
            className="relative overflow-hidden rounded-[24px] px-6 py-10 text-center"
            style={{
              background:
                'linear-gradient(150deg, rgb(255 107 26 / 0.14), rgb(168 85 247 / 0.12))',
              border: '1px solid rgb(255 255 255 / 0.09)',
            }}
          >
            <h2 className="font-display text-[clamp(1.5rem,6.5vw,2rem)] font-bold leading-[1.08] tracking-[-0.03em]">
              Still awake?
            </h2>
            <p className="mx-auto mt-2.5 max-w-[17rem] text-sm leading-relaxed text-[var(--color-text-secondary)]">
              So are we. Free delivery across Abode Valley until 4 AM.
            </p>

            <Link
              href="/menu"
              className="sheen group mt-6 inline-flex h-13 items-center gap-2 rounded-[15px] px-7 py-3.5 font-display text-sm font-bold text-white transition-transform duration-200 active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #FF6B1A 0%, #FF3D81 48%, #A855F7 100%)',
                boxShadow: '0 12px 34px -14px rgb(255 107 26 / 0.85)',
              }}
            >
              See the menu
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                <ArrowRightIcon size={17} strokeWidth={2.4} />
              </span>
            </Link>
          </div>
        </ScrollReveal>

        <footer className="mt-10 text-center">
          <p className="font-display text-[11px] font-bold tracking-[0.24em] text-[var(--color-text-tertiary)]">
            JUICE STOP
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
            Abode Valley Complex, Kattankulathur
            <br />
            Open 7 PM — 4 AM, every night
          </p>
        </footer>
      </section>
    </main>
  );
}
