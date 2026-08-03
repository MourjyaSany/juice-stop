'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { kitchen, kitchenSession } from '@/lib/kitchen-api';
import { StaffAtmosphere } from '@/components/staff/glass';

/**
 * Owner chrome.
 *
 * Deliberately a different application from the kitchen board even though they share a backend and
 * a session. The kitchen is read from two metres away by someone holding a pan — huge targets,
 * four columns, no navigation. This is read at a desk or on a phone by someone deciding whether
 * tonight went well: dense, quiet, scannable, and navigable.
 *
 * The role check here is convenience, not security. Every `/admin` endpoint is gated server-side
 * by `@RequireRole('ADMIN')`; a cook who types the URL gets an empty screen and 403s.
 */

const NAV = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/menu', label: 'Menu & deals', icon: '🔥' },
  { href: '/admin/staff', label: 'Staff logins', icon: '🔑' },
  { href: '/admin/activity', label: 'Activity', icon: '⚡' },
  { href: '/kitchen', label: 'Kitchen board', icon: '🎟️' },
] as const;

export function AdminShell({
  children,
  header,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ready' | 'denied'>('checking');

  useEffect(() => {
    if (kitchenSession.get() === null) {
      router.replace('/admin/login');
      return;
    }
    kitchen
      .session()
      .then((r) => {
        // A signed-in cook is not signed out — they are simply not the owner. Bouncing them to a
        // login screen would invite them to try credentials that cannot help.
        setState(r.session.role === 'ADMIN' ? 'ready' : 'denied');
      })
      .catch(() => router.replace('/admin/login'));
  }, [router]);

  if (state === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ background: 'var(--color-canvas)' }}>
        <p className="font-mono text-sm text-[var(--color-text-tertiary)]">Checking access…</p>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div
        className="grid min-h-dvh place-items-center px-6 text-center"
        style={{ background: 'var(--color-canvas)' }}
      >
        <div className="max-w-sm">
          <p className="font-display text-2xl font-bold">Owner access only</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            You are signed in as kitchen staff. Revenue and reports are restricted to the owner
            account.
          </p>
          <Link
            href="/kitchen"
            className="mt-6 inline-flex h-12 items-center rounded-[12px] px-5 font-display text-sm font-bold text-white"
            style={{ background: 'var(--gradient-brand)' }}
          >
            Back to the kitchen board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh" style={{ background: 'var(--color-canvas)' }}>
      <StaffAtmosphere />
      <aside
        className="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col justify-between border-r py-4 md:flex"
        style={{
          borderColor: 'rgb(255 255 255 / 0.08)',
          background: 'linear-gradient(180deg, rgb(255 255 255 / 0.055), rgb(255 255 255 / 0.02))',
          backdropFilter: 'blur(16px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        }}
      >
        <div>
          <div className="px-5">
            <p className="font-display text-[13px] font-bold tracking-[0.24em]">JUICE STOP</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-purple-300)]">
              Owner
            </p>
          </div>
          <nav className="mt-7 flex flex-col gap-1 px-3">
            {NAV.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-h-[46px] items-center gap-3 rounded-[11px] px-3 text-sm font-semibold transition-colors duration-150"
                  style={{
                    background: active ? 'rgb(168 85 247 / 0.14)' : 'transparent',
                    color: active ? 'var(--color-purple-300)' : 'var(--color-text-secondary)',
                    boxShadow: active ? 'inset 0 0 0 1px rgb(168 85 247 / 0.3)' : 'none',
                  }}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={() => {
            kitchenSession.clear();
            router.replace('/admin/login');
          }}
          className="mx-3 flex min-h-[46px] items-center gap-3 rounded-[11px] px-3 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-danger)]"
        >
          <span aria-hidden>⏻</span> Log out
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        {header}
        <main className="p-4 lg:p-6">{children}</main>

        {/* Mobile navigation. The sidebar is hidden under md, and an owner checking takings on a
            phone still needs to move between screens. */}
        <nav
          className="sticky bottom-0 flex border-t md:hidden"
          style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-raised)' }}
        >
          {NAV.map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
                style={{ color: active ? 'var(--color-purple-300)' : 'var(--color-text-tertiary)' }}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
