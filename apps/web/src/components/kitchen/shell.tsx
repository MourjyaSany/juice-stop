'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { kitchen, kitchenSession } from '@/lib/kitchen-api';
import { StaffAtmosphere } from '@/components/staff/glass';
import type { StreamState } from './use-kitchen-stream';

/**
 * The kitchen chrome: sidebar, session gate, connection lamp.
 *
 * Separate from the customer shell on purpose. This runs on a wall-mounted tablet at arm's length
 * in a bright room — the type is larger, the targets are bigger, and there is no marketing, no
 * bottom nav and no route back to the storefront. A cook mid-shift should not be one mis-tap away
 * from the landing page.
 */

const NAV = [
  { href: '/kitchen', label: 'Dashboard', icon: '🎟️' },
  { href: '/kitchen/inventory', label: 'Inventory', icon: '📦' },
  { href: '/kitchen/settings', label: 'Settings', icon: '⚙️' },
] as const;

export function KitchenShell({
  children,
  stream,
  header,
}: {
  children: React.ReactNode;
  stream?: StreamState;
  header?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  // The gate is client-side because the session lives in sessionStorage, which the server cannot
  // read. That is acceptable *only* because it is not the real access control — every kitchen
  // endpoint is guarded server-side, so a forged client route renders an empty screen and 401s.
  useEffect(() => {
    if (kitchenSession.get() === null) {
      router.replace('/kitchen/login');
      return;
    }
    kitchen
      .session()
      .then(() => setChecked(true))
      .catch(() => router.replace('/kitchen/login'));
  }, [router]);

  const signOut = () => {
    kitchenSession.clear();
    router.replace('/kitchen/login');
  };

  if (!checked) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ background: 'var(--color-canvas)' }}>
        <p className="font-mono text-sm text-[var(--color-text-tertiary)]">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh" style={{ background: 'var(--color-canvas)' }}>
      <StaffAtmosphere />
      {/* ── Sidebar ─────────────────────────────────────────────────────────────────────────
          Icon-only under 1024px so a tablet in portrait keeps its width for order cards. */}
      <aside
        className="sticky top-0 flex h-dvh w-[76px] shrink-0 flex-col justify-between border-r py-4 lg:w-[212px]"
        style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-raised)' }}
      >
        <div>
          <div className="px-3 lg:px-5">
            <p className="font-display text-[11px] font-bold tracking-[0.24em] lg:text-[13px]">
              <span className="lg:hidden">JS</span>
              <span className="hidden lg:inline">JUICE STOP</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-orange-500)]">
              Kitchen
            </p>
          </div>

          <nav className="mt-7 flex flex-col gap-1 px-2 lg:px-3">
            {NAV.map((item) => {
              const active =
                item.href === '/kitchen' ? pathname === '/kitchen' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-h-[56px] items-center gap-3 rounded-[12px] px-3 text-sm font-semibold transition-colors duration-150"
                  style={{
                    background: active ? 'rgb(255 107 26 / 0.14)' : 'transparent',
                    color: active ? 'var(--color-orange-500)' : 'var(--color-text-secondary)',
                    boxShadow: active ? 'inset 0 0 0 1px rgb(255 107 26 / 0.32)' : 'none',
                  }}
                >
                  <span className="text-lg leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="px-2 lg:px-3">
          {stream !== undefined && <ConnectionLamp state={stream} />}
          <button
            type="button"
            onClick={signOut}
            className="mt-2 flex min-h-[56px] w-full items-center gap-3 rounded-[12px] px-3 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-150 hover:text-[var(--color-danger)]"
          >
            <span className="text-lg leading-none" aria-hidden>
              ⏻
            </span>
            <span className="hidden lg:inline">Log out</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {header}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function ConnectionLamp({ state }: { state: StreamState }) {
  const tone =
    state === 'live'
      ? { colour: 'var(--color-success)', label: 'Live' }
      : state === 'connecting'
        ? { colour: 'var(--color-warning)', label: 'Connecting' }
        : { colour: 'var(--color-danger)', label: 'Reconnecting' };

  return (
    <div
      className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3"
      style={{ background: 'var(--color-inset)' }}
      title={`Realtime: ${tone.label}`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: tone.colour, boxShadow: `0 0 10px ${tone.colour}` }}
        aria-hidden
      />
      <span className="hidden text-xs font-semibold text-[var(--color-text-secondary)] lg:inline">
        {tone.label}
      </span>
    </div>
  );
}
