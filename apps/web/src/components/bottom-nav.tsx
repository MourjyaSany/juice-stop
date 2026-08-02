'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOverlayOpen } from '@/store/overlay';
import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { orderProgress, useOrders } from '@/store/orders';
import { BagIcon, HomeIcon, MenuIcon, UserIcon } from './icons';
import { SPRING } from './motion-provider';

const TABS = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/menu', label: 'Menu', Icon: MenuIcon },
  { href: '/orders', label: 'Orders', Icon: BagIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
] as const;

/** Surfaces that are not the customer app and must not carry customer navigation. */
const STAFF_ROUTES = ['/kitchen'];

/**
 * Floating tab bar.
 *
 * Bottom-anchored and detached from the edge: on a 6.5" phone held one-handed at 1 AM the top of
 * the screen is out of thumb reach. Sits above the grain overlay so nothing can obscure primary
 * navigation.
 *
 * The Orders tab carries a **live badge** whenever something is still being cooked or delivered,
 * so an in-progress order is visible from every screen in the app without opening anything.
 */
export function BottomNav() {
  const pathname = usePathname();
  const overlayOpen = useOverlayOpen();
  const orders = useOrders((s) => s.orders);
  const [activeCount, setActiveCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Recomputed on a timer as well as on store change: an order can finish while the customer is
  // simply sitting on a page, and the badge should clear itself without a navigation.
  useEffect(() => {
    setMounted(true);
    const recount = () => {
      const now = Date.now();
      setActiveCount(orders.filter((o) => orderProgress(o, now).status !== 'DELIVERED').length);
    };
    recount();
    const t = setInterval(recount, 5000);
    return () => clearInterval(t);
  }, [orders]);

  // The kitchen board is a wall-mounted kiosk with zero navigation by design — a customer tab bar
  // on it is both useless and a way for a chef to lose the queue mid-service.
  if (STAFF_ROUTES.some((route) => pathname.startsWith(route))) return null;

  // Withdraw entirely under a modal. The item sheet and the cart drawer are meant to own the
  // screen; a nav floating over their bottom edge covered the size picker and the checkout
  // button, which are the two controls those surfaces exist for.
  if (overlayOpen) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-[var(--z-nav)] mx-auto w-[calc(100%-1.5rem)] max-w-[26rem] rounded-[22px] px-1.5 pt-1.5"
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
          const badge = href === '/orders' && mounted && activeCount > 0;

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={badge ? `${label}, ${activeCount} in progress` : label}
                className="pressable relative flex flex-col items-center gap-1 rounded-[14px] px-2 py-2"
                style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}
              >
                {/* Active state is a gradient bar AND a weight change — never colour alone. */}
                <span
                  aria-hidden
                  className="absolute -top-1.5 h-[3px] w-8 rounded-full transition-opacity duration-300"
                  style={{ background: 'var(--gradient-brand)', opacity: active ? 1 : 0 }}
                />

                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2 : 1.6} />

                  <AnimatePresence>
                    {badge && (
                      <m.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={SPRING.bouncy}
                        className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1"
                        style={{
                          background: 'var(--gradient-brand)',
                          boxShadow: '0 0 12px rgb(255 107 26 / 0.85)',
                        }}
                      >
                        {/* Halo pulse: reads as "live" from the corner of the eye. */}
                        <span
                          aria-hidden
                          className="animate-pulse-dot absolute inset-0 rounded-full"
                          style={{ background: 'var(--color-orange-500)', opacity: 0.55 }}
                        />
                        <span className="tabular relative text-[10px] font-bold text-white">
                          {activeCount}
                        </span>
                      </m.span>
                    )}
                  </AnimatePresence>
                </span>

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
