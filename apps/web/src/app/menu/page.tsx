import Link from 'next/link';
import type { Metadata } from 'next';
import { getStoreStatus } from '@juice-stop/core';
import { MenuBrowser } from '@/components/menu-browser';
import { OrderingBanner } from '@/components/ordering-banner';

export const metadata: Metadata = {
  title: 'Menu — Juice Stop',
  description: 'Burgers, rolls, fries, Maggi and shakes. Browse any time; we deliver 7 PM–4 AM.',
};

// Store status changes minute to minute, so this page is never served stale.
// The *menu* itself is static and will be edge-cached separately from M1.
export const dynamic = 'force-dynamic';

/**
 * The menu is browsable 24/7 by design.
 *
 * Only ordering and payment are gated by the service window — a customer reading the menu at
 * 16:00 is a customer who orders at 19:05, and turning them away at the door for eleven hours a
 * day would be self-defeating.
 */
export default function MenuPage() {
  const status = getStoreStatus();

  return (
    <main className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute -top-[20%] left-[-20%] h-[50vh] w-[70vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgb(255 107 26 / 0.16), transparent 65%)' }}
        />
        <div
          className="absolute -top-[10%] right-[-25%] h-[45vh] w-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgb(168 85 247 / 0.16), transparent 65%)' }}
        />
      </div>

      <div className="mx-auto w-full max-w-lg px-5 pb-28 pt-6">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <p className="tabular font-mono text-sm text-[var(--color-text-secondary)]">
            {status.localTime} IST
          </p>
        </header>

        <h1 className="mt-6 font-display text-3xl font-bold tracking-[-0.02em]">Menu</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          {status.acceptingOrders
            ? `Kitchen's live · ~${status.quotedEtaMinutes} min`
            : 'Browse anytime · we deliver 7 PM–4 AM'}
        </p>

        {/* Inline, non-blocking. Browsing is never interrupted. */}
        <div className="mt-5">
          <OrderingBanner status={status} />
        </div>

        <div className="mt-6">
          <MenuBrowser acceptingOrders={status.acceptingOrders} />
        </div>
      </div>
    </main>
  );
}
