'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BagIcon, HomeIcon, MenuIcon, UserIcon } from './icons';

const TABS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/menu', label: 'Menu', Icon: MenuIcon },
  { href: '/orders', label: 'Orders', Icon: BagIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
] as const;

/**
 * Persistent bottom navigation.
 *
 * Bottom-anchored rather than a top bar: on a 6.5" phone held one-handed at 1 AM, the top of the
 * screen is out of thumb reach. Every primary destination sits in the natural arc.
 */
/** Surfaces that are not the customer app and must not carry customer navigation. */
const STAFF_ROUTES = ['/kitchen'];

export function BottomNav() {
  const pathname = usePathname();

  // The kitchen board is a wall-mounted kiosk with zero navigation by design — a customer tab bar
  // on it is both useless and a way for a chef to lose the queue mid-service.
  if (STAFF_ROUTES.some((route) => pathname.startsWith(route))) return null;

  return (
    // A floating island rather than a docked bar: detached from the bottom edge, always on screen,
    // never part of the document flow. z-index sits above the grain overlay so nothing can
    // obscure primary navigation.
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-[10000] mx-auto w-[calc(100%-1.5rem)] max-w-[26rem] rounded-[22px] px-1.5 pt-1.5"
      style={{
        bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        paddingBottom: '0.375rem',
        background: 'linear-gradient(180deg, rgba(24,18,26,0.92), rgba(16,12,20,0.94))',
        backdropFilter: 'blur(24px) saturate(170%)',
        WebkitBackdropFilter: 'blur(24px) saturate(170%)',
        border: '1px solid rgb(255 255 255 / 0.10)',
        boxShadow: '0 16px 44px -14px rgb(0 0 0 / 0.85), 0 0 24px -18px rgb(255 107 26 / 0.9)',
      }}
    >
      <ul className="flex items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="pressable relative flex flex-col items-center gap-1 rounded-[14px] px-2 py-2"
                style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}
              >
                {/* Active indicator is a gradient bar AND a filled label weight — never colour
                    alone, which a colour-blind user or a sun-washed screen would miss. */}
                <span
                  aria-hidden
                  className="absolute -top-1.5 h-[3px] w-8 rounded-full transition-opacity duration-300"
                  style={{
                    background: 'var(--gradient-brand)',
                    opacity: active ? 1 : 0,
                  }}
                />
                <Icon size={22} strokeWidth={active ? 2 : 1.6} />
                <span
                  className="text-[0.6875rem] leading-none"
                  style={{ fontWeight: active ? 600 : 500 }}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
