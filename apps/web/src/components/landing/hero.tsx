'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Money, MIN_ORDER_PAISE, type StoreStatus } from '@juice-stop/core';
import { AuroraField, GeneratedImage, GridVeil, ParticleField, StatusPill } from '@/components/system';
import { ArrowRightIcon, ClockIcon, MapPinIcon } from '@/components/icons';
import { SPRING } from '@/components/motion-provider';

/**
 * Cinematic hero.
 *
 * The store status is computed on the **server** so the first paint is already truthful — a
 * client-side "OPEN" that flips to "CLOSED" a moment later is the fastest way to lose trust on a
 * page whose entire job is to be believed. The countdown then ticks locally from that seed.
 */
export function Hero({ status }: { status: StoreStatus }) {
  const reduced = useReducedMotion();
  const [remaining, setRemaining] = useState(
    status.acceptingOrders ? (status.secondsUntilClose ?? 0) : (status.secondsUntilOpen ?? 0),
  );

  useEffect(() => {
    const t = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const open = status.acceptingOrders;

  return (
    <section className="relative overflow-hidden pb-16 pt-6">
      <AuroraField />
      <GridVeil />
      <ParticleField count={20} />

      <div className="mx-auto w-full max-w-lg px-5">
        {/* ── Wordmark ─────────────────────────────────────────────────────────────────── */}
        <m.header
          className="flex items-center justify-between"
          initial={reduced ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING.smooth}
        >
          <div>
            <p className="font-display text-[13px] font-bold tracking-[0.24em]">JUICE STOP</p>
            <div
              className="gradient-animate mt-1 h-[2px] w-9 rounded-full"
              style={{ background: 'var(--gradient-brand)' }}
            />
          </div>
          <StatusPill
            tone={open ? 'live' : 'off'}
            label={open ? 'Open tonight' : 'Opens 7 PM'}
            pulse={open}
          />
        </m.header>

        {/* ── Headline ─────────────────────────────────────────────────────────────────── */}
        <div className="mt-16">
          <m.p
            className="text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING.smooth, delay: 0.05 }}
          >
            7 PM — 4 AM · Abode Valley
          </m.p>

          <h1 className="mt-4 font-display text-[clamp(2.9rem,14vw,4.2rem)] font-bold leading-[0.92] tracking-[-0.045em]">
            {['Night', 'fuel,'].map((word, i) => (
              <m.span
                key={word}
                className="block"
                initial={reduced ? false : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING.smooth, delay: 0.1 + i * 0.07 }}
              >
                {word}
              </m.span>
            ))}
            <m.span
              className="block"
              initial={reduced ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING.smooth, delay: 0.24 }}
              style={{
                background: 'linear-gradient(115deg, #FF8A3D 0%, #FF3D81 46%, #C084FC 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              delivered.
            </m.span>
          </h1>

          <m.p
            className="mt-5 max-w-[20rem] text-[15px] leading-relaxed text-[var(--color-text-secondary)]"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.34, duration: 0.5 }}
          >
            The kitchen that stays up with you. Two hundred plus things worth staying awake for,
            to your block in minutes.
          </m.p>
        </div>

        {/* ── Live panel ───────────────────────────────────────────────────────────────── */}
        <m.div
          className="glass-strong mt-8 overflow-hidden rounded-[22px]"
          initial={reduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.smooth, delay: 0.4 }}
        >
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'rgb(255 255 255 / 0.07)' }}>
            <Metric
              label={open ? 'Closes in' : 'Opens in'}
              value={
                hours > 0
                  ? `${hours}h ${String(minutes).padStart(2, '0')}m`
                  : `${minutes}:${String(seconds).padStart(2, '0')}`
              }
              tone={open ? 'default' : 'violet'}
            />
            <Metric
              label="Prep time"
              value={open ? `~${status.quotedEtaMinutes} min` : '—'}
              tone="warm"
            />
            <Metric
              label="Kitchen"
              value={open ? `${Math.round(status.capacityLoad * 100)}%` : 'Resting'}
              tone={status.capacityLoad >= 0.8 ? 'warn' : 'default'}
            />
          </div>

          {/* Capacity bar — the honest signal that ADR-013 exists to protect. */}
          {open && (
            <div className="px-4 pb-4">
              <div
                className="h-1 w-full overflow-hidden rounded-full"
                style={{ background: 'rgb(0 0 0 / 0.4)' }}
              >
                <m.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(status.capacityLoad * 100)}%` }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}
                  style={{
                    background:
                      status.capacityLoad >= 0.8
                        ? 'linear-gradient(90deg,#F59E0B,#EF4444)'
                        : 'var(--gradient-brand)',
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
                {status.capacityLoad >= 0.8
                  ? 'Kitchen is slammed — expect longer waits tonight.'
                  : 'Kitchen has room. Good time to order.'}
              </p>
            </div>
          )}
        </m.div>

        {/* ── CTA ──────────────────────────────────────────────────────────────────────── */}
        <m.div
          className="mt-5"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.smooth, delay: 0.5 }}
        >
          <Link
            href="/menu"
            className="sheen group flex h-[3.75rem] w-full items-center justify-center gap-2.5 rounded-[16px] font-display text-[15px] font-bold text-white transition-transform duration-200 active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #FF6B1A 0%, #FF3D81 48%, #A855F7 100%)',
              boxShadow: '0 14px 40px -14px rgb(255 107 26 / 0.85)',
            }}
          >
            {open ? 'Start your order' : 'Browse the menu'}
            <span className="transition-transform duration-200 group-hover:translate-x-1">
              <ArrowRightIcon size={19} strokeWidth={2.4} />
            </span>
          </Link>

          <div className="mt-3.5 flex items-center justify-center gap-2.5 text-[11px]">
            <span
              className="rounded-full px-2.5 py-1 font-semibold"
              style={{ background: 'rgb(34 197 94 / 0.14)', color: 'var(--color-success)' }}
            >
              Free delivery
            </span>
            <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
              <ClockIcon size={12} /> Min {Money.format(MIN_ORDER_PAISE)}
            </span>
            <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
              <MapPinIcon size={12} /> Abode Valley
            </span>
          </div>
        </m.div>
      </div>

      {/* ── Hero image, bleeding off the edge ────────────────────────────────────────────── */}
      <m.div
        className="relative mt-14 px-5"
        initial={reduced ? false : { opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...SPRING.smooth, delay: 0.55 }}
      >
        <div className="mx-auto w-full max-w-lg">
          <GeneratedImage
            slug="hero"
            priority
            rounded="26px"
            className="aspect-[5/4] w-full"
          />
        </div>
        {/* Fade the image into the page rather than ending it with a hard edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{ background: 'linear-gradient(180deg, transparent, var(--color-canvas))' }}
        />
      </m.div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warm' | 'violet' | 'warn';
}) {
  const colour =
    tone === 'warm'
      ? 'var(--color-orange-500)'
      : tone === 'violet'
        ? 'var(--color-purple-300)'
        : tone === 'warn'
          ? 'var(--color-warning)'
          : 'var(--color-text-primary)';

  return (
    <div className="px-3 py-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p className="tabular mt-1.5 font-display text-[17px] font-bold" style={{ color: colour }}>
        {value}
      </p>
    </div>
  );
}
