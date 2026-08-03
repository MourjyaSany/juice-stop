'use client';

import { useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { tapFeedback, type HapticPattern } from '@/lib/haptics';

/**
 * Surface primitives.
 *
 * Three glass weights, one gradient-border treatment, one tactile button. Everything in the app
 * composes from these — the fastest way to a product that looks assembled from three UI kits is
 * letting each page invent its own card.
 */

type Weight = 'subtle' | 'base' | 'strong';

const WEIGHT: Record<Weight, React.CSSProperties> = {
  subtle: {
    background: 'linear-gradient(180deg, rgb(255 255 255 / 0.035), rgb(255 255 255 / 0.012))',
    backdropFilter: 'blur(10px) saturate(130%)',
    border: '1px solid rgb(255 255 255 / 0.055)',
    boxShadow: '0 1px 2px rgb(0 0 0 / 0.4)',
  },
  base: {
    background: 'linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02))',
    backdropFilter: 'blur(16px) saturate(145%)',
    border: '1px solid rgb(255 255 255 / 0.08)',
    boxShadow: '0 4px 16px -6px rgb(0 0 0 / 0.5)',
  },
  strong: {
    background: 'linear-gradient(180deg, rgb(255 255 255 / 0.09), rgb(255 255 255 / 0.03))',
    backdropFilter: 'blur(24px) saturate(165%)',
    border: '1px solid rgb(255 255 255 / 0.11)',
    boxShadow: '0 14px 40px -14px rgb(0 0 0 / 0.7)',
  },
};

/** Glass surface with the top-edge specular highlight that sells the material. */
export function GlassPanel({
  weight = 'base',
  radius = 20,
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { weight?: Weight; radius?: number }) {
  return (
    <div
      className={`relative ${className}`}
      style={{ ...WEIGHT[weight], borderRadius: radius, ...style }}
      {...rest}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.28), transparent)',
        }}
      />
      {children}
    </div>
  );
}

/**
 * Glass surface that lights up under the pointer.
 *
 * The glow tracks the cursor via CSS custom properties updated on pointermove — no React state,
 * so it never re-renders the subtree while the pointer moves. On touch devices the effect simply
 * never fires, which is correct: there is no hover on a phone.
 */
export function GlowCard({
  radius = 20,
  tone = 'warm',
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { radius?: number; tone?: 'warm' | 'violet' }) {
  const ref = useRef<HTMLDivElement>(null);
  const colour = tone === 'warm' ? '255 107 26' : '168 85 247';

  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
    el.style.setProperty('--glow', '1');
  };

  return (
    <div
      ref={ref}
      onPointerMove={track}
      onPointerLeave={() => ref.current?.style.setProperty('--glow', '0')}
      className={`group relative isolate ${className}`}
      style={{ ...WEIGHT.base, borderRadius: radius, ['--glow' as string]: '0', ...style }}
      {...rest}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          borderRadius: 'inherit',
          opacity: 'var(--glow)',
          background: `radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), rgb(${colour} / 0.16), transparent 68%)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.26), transparent)' }}
      />
      {children}
    </div>
  );
}

/**
 * Gradient border that slowly rotates.
 *
 * Implemented as a masked pseudo-layer rather than an animated `border-image`: only `transform`
 * animates, so it stays on the compositor instead of repainting the border box every frame.
 */
export function AnimatedBorder({
  radius = 20,
  active = true,
  className = '',
  children,
}: {
  radius?: number;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <div className={`relative isolate ${className}`} style={{ borderRadius: radius }}>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px overflow-hidden"
        style={{ borderRadius: 'inherit', opacity: active ? 1 : 0, transition: 'opacity .3s' }}
      >
        <m.span
          className="absolute left-1/2 top-1/2 block aspect-square w-[220%]"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, #FF6B1A 60deg, #FF3D81 120deg, #A855F7 180deg, transparent 260deg)',
            translateX: '-50%',
            translateY: '-50%',
          }}
          animate={reduced ? {} : { rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        />
      </span>
      {/* Inner fill masks the gradient into a 1px ring. */}
      <div
        className="relative"
        style={{ borderRadius: 'inherit', background: 'var(--color-surface)' }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Button with press physics.
 *
 * Scale on press plus a pointer-tracked sheen. The 0.96 dip is deliberately slightly deeper than
 * feels "correct" statically — under a finger, with the contact patch hiding the control, a
 * subtler dip reads as nothing happening.
 */
export function TactileButton({
  variant = 'primary',
  size = 'md',
  className = '',
  style,
  children,
  haptic,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'glass' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /**
   * Which pulse to fire, or `false` for none.
   *
   * Defaults by variant rather than being required at every call site: a primary button is the
   * commit action on almost every screen it appears on, and making each caller remember would
   * guarantee an inconsistent app.
   */
  haptic?: HapticPattern | false;
}) {
  const [pressed, setPressed] = useState(false);

  const sizes = {
    sm: 'h-9 px-4 text-[13px] rounded-[11px]',
    md: 'h-12 px-5 text-sm rounded-[13px]',
    lg: 'h-14 px-6 text-[15px] rounded-[15px]',
  } as const;

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #FF6B1A 0%, #FF3D81 48%, #A855F7 100%)',
      color: '#fff',
      boxShadow: '0 8px 26px -10px rgb(255 107 26 / 0.75)',
    },
    glass: { ...WEIGHT.base, color: 'var(--color-text-primary)' },
    ghost: { background: 'transparent', color: 'var(--color-text-secondary)' },
    danger: { background: 'rgb(239 68 68 / 0.15)', color: 'var(--color-danger)' },
  };

  return (
    <button
      className={`sheen relative isolate inline-flex items-center justify-center gap-2 overflow-hidden font-display font-semibold disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${className}`}
      style={{
        ...variants[variant],
        ...style,
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        // Overshoot easing gives the release a spring quality without a JS animation loop —
        // a plain <button> also sidesteps spreading button attributes onto a motion component.
        transition: 'transform .19s cubic-bezier(0.34, 1.56, 0.64, 1), filter .2s ease',
      }}
      onPointerDown={() => {
        setPressed(true);
        // Fired on press-down, not on click. The physical response has to arrive with the finger
        // landing; on release it reads as a delay rather than as feedback.
        if (haptic !== false && rest.disabled !== true) {
          tapFeedback(haptic ?? (variant === 'primary' ? 'commit' : 'select'));
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
