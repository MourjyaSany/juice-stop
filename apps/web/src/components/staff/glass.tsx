'use client';

import { useCallback, useRef, useState } from 'react';
import { tapFeedback, type HapticPattern } from '@/lib/haptics';

/**
 * Glass primitives for the staff surfaces.
 *
 * The kitchen board and the owner dashboard were flat panels — correct, legible, and visibly a
 * different product from the storefront the same business ships. These bring them onto the same
 * material without touching the customer app, which stays exactly as it is.
 *
 * Two rules keep this from becoming decoration:
 *
 *  1. **The kitchen reads from two metres away, through steam, on a cheap tablet.** Glass here is
 *     thinner and the contrast higher than the storefront's — a frosted panel that looks lovely on
 *     a phone in the dark is a panel a cook cannot read across a hot line. Blur is capped, and no
 *     text ever sits on a gradient.
 *  2. **Reactivity has to survive a finger.** A hover glow is invisible on a touchscreen, so every
 *     effect here is driven by *pointer position* and *press state* rather than `:hover` alone,
 *     and each one has a press-scale that works with no cursor at all.
 */

/** Pointer-tracked spotlight. One shared implementation so every staff surface lights identically. */
function useSpotlight() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (el === null) return;
    const box = el.getBoundingClientRect();
    setSpot({ x: event.clientX - box.left, y: event.clientY - box.top });
  }, []);

  const onPointerLeave = useCallback(() => setSpot(null), []);

  return { ref, spot, onPointerMove, onPointerLeave };
}

export function StaffPanel({
  children,
  className = '',
  accent = 'rgb(255 255 255 / 0.10)',
  interactive = true,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  /** The colour the spotlight paints. Columns pass their own so the board stays colour-coded. */
  accent?: string;
  interactive?: boolean;
  style?: React.CSSProperties | undefined;
}) {
  const { ref, spot, onPointerMove, onPointerLeave } = useSpotlight();

  return (
    <div
      ref={ref}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerLeave={interactive ? onPointerLeave : undefined}
      className={`relative isolate overflow-hidden rounded-[16px] ${className}`}
      style={{
        // Layered rather than a flat fill: a top-lit gradient plus a hairline inset edge is what
        // makes a panel read as a pane of glass instead of a grey rectangle.
        background:
          'linear-gradient(160deg, rgb(255 255 255 / 0.070), rgb(255 255 255 / 0.022) 46%, rgb(255 255 255 / 0.010))',
        border: '1px solid rgb(255 255 255 / 0.10)',
        // Capped at 14px. Heavier blur on a low-end tablet drops frames on every scroll, and the
        // kitchen board scrolls constantly during a rush.
        backdropFilter: 'blur(14px) saturate(1.25)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.25)',
        boxShadow:
          'inset 0 1px 0 0 rgb(255 255 255 / 0.10), 0 14px 40px -22px rgb(0 0 0 / 0.9)',
        transition: 'border-color .25s ease, box-shadow .25s ease',
        ...style,
      }}
    >
      {/* The spotlight. Pointer-driven so it works for a mouse and for a dragging finger, and
          `pointer-events-none` so it never intercepts a tap meant for the content. */}
      {spot !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
          style={{
            background: `radial-gradient(320px circle at ${spot.x}px ${spot.y}px, ${accent}, transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * A staff action button.
 *
 * Bigger targets than the storefront's — a cook is wearing gloves or has one wet hand — plus a
 * press dip and a haptic pulse, because on a wall tablet the only confirmation that a tap landed
 * is the thing that happens next, and that can be half a second of network away.
 */
export function StaffButton({
  children,
  tone = 'neutral',
  className = '',
  style,
  haptic,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'neutral' | 'danger' | 'success';
  haptic?: HapticPattern | false;
}) {
  const [pressed, setPressed] = useState(false);

  const tones: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #FF6B1A 0%, #FF3D81 52%, #A855F7 100%)',
      color: '#fff',
      boxShadow: '0 10px 28px -12px rgb(255 107 26 / 0.8)',
    },
    success: {
      background: 'linear-gradient(135deg,#22C55E,#16A34A)',
      color: '#fff',
      boxShadow: '0 10px 26px -14px rgb(34 197 94 / 0.85)',
    },
    danger: { background: 'rgb(239 68 68 / 0.16)', color: 'var(--color-danger)' },
    neutral: {
      background: 'rgb(255 255 255 / 0.07)',
      color: 'var(--color-text-primary)',
      border: '1px solid rgb(255 255 255 / 0.10)',
    },
  };

  return (
    <button
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-[12px] font-display font-bold disabled:pointer-events-none disabled:opacity-45 ${className}`}
      style={{
        ...tones[tone],
        ...style,
        transform: pressed ? 'scale(0.965)' : 'scale(1)',
        transition: 'transform .17s cubic-bezier(0.34, 1.56, 0.64, 1), filter .2s ease',
        filter: pressed ? 'brightness(1.12)' : 'none',
      }}
      onPointerDown={() => {
        setPressed(true);
        if (haptic !== false && rest.disabled !== true) {
          tapFeedback(haptic ?? (tone === 'danger' ? 'error' : tone === 'neutral' ? 'select' : 'commit'));
        }
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The frosted sheet behind a staff screen.
 *
 * A single fixed layer rather than a gradient on each panel: one composited element the browser can
 * keep on the GPU, instead of twenty stacked blurs fighting for the same frame budget.
 */
export function StaffAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-[15%] -top-[20%] h-[65vh] w-[65vw] rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(255 107 26 / 0.16), transparent 65%)', filter: 'blur(70px)' }}
      />
      <div
        className="absolute -bottom-[25%] -right-[10%] h-[60vh] w-[55vw] rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(168 85 247 / 0.16), transparent 65%)', filter: 'blur(80px)' }}
      />
    </div>
  );
}
