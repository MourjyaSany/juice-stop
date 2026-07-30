'use client';

import { useMemo } from 'react';
import { m, useReducedMotion } from 'motion/react';

/**
 * Ambient background layers.
 *
 * Everything here is decorative and `aria-hidden`. All motion is transform/opacity only, and the
 * particle count drops to zero under `prefers-reduced-motion` — ambient drift is exactly the kind
 * of movement that triggers vestibular discomfort and carries no information, so removing it costs
 * nothing.
 */

/** Slow-drifting colour wash. The base layer of every screen. */
export function AuroraField({ intensity = 1 }: { intensity?: number }) {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <m.span
        className="absolute -top-[28%] left-[-14%] block h-[62vh] w-[68vw] rounded-full"
        style={{
          background: `radial-gradient(circle, rgb(255 107 26 / ${0.3 * intensity}), transparent 66%)`,
          filter: 'blur(90px)',
        }}
        animate={reduced ? {} : { x: ['0%', '6%', '0%'], y: ['0%', '-4%', '0%'], scale: [1, 1.1, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <m.span
        className="absolute -top-[12%] right-[-18%] block h-[56vh] w-[60vw] rounded-full"
        style={{
          background: `radial-gradient(circle, rgb(168 85 247 / ${0.28 * intensity}), transparent 66%)`,
          filter: 'blur(90px)',
        }}
        animate={reduced ? {} : { x: ['0%', '-5%', '0%'], y: ['0%', '5%', '0%'], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: -6 }}
      />
      <m.span
        className="absolute top-[32%] left-[24%] block h-[40vh] w-[46vw] rounded-full"
        style={{
          background: `radial-gradient(circle, rgb(255 61 129 / ${0.16 * intensity}), transparent 68%)`,
          filter: 'blur(100px)',
        }}
        animate={reduced ? {} : { x: ['0%', '-7%', '0%'], y: ['0%', '6%', '0%'] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: -12 }}
      />
    </div>
  );
}

/**
 * Floating embers.
 *
 * Positions are derived from a seeded PRNG rather than `Math.random()` so the server and client
 * agree — random positions would hydrate-mismatch and React would throw the tree away.
 */
export function ParticleField({ count = 18, seed = 7 }: { count?: number; seed?: number }) {
  const reduced = useReducedMotion();

  const particles = useMemo(() => {
    let s = seed;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rand() * 100,
      top: rand() * 100,
      size: 1.5 + rand() * 2.5,
      delay: rand() * -20,
      duration: 14 + rand() * 16,
      drift: -20 + rand() * 40,
      warm: rand() > 0.45,
      opacity: 0.25 + rand() * 0.45,
    }));
  }, [count, seed]);

  if (reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {particles.map((p) => (
        <m.span
          key={p.id}
          className="absolute block rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.warm ? 'rgb(255 150 80)' : 'rgb(196 132 252)',
            boxShadow: `0 0 ${p.size * 4}px ${p.warm ? 'rgb(255 107 26 / 0.8)' : 'rgb(168 85 247 / 0.8)'}`,
          }}
          animate={{ y: [0, -110], x: [0, p.drift], opacity: [0, p.opacity, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, ease: 'linear', delay: p.delay }}
        />
      ))}
    </div>
  );
}

/** Fine grid that fades out — gives large empty areas structure without adding visual noise. */
export function GridVeil() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage:
          'linear-gradient(rgb(255 255 255 / 0.028) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.028) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, #000 30%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, #000 30%, transparent 78%)',
      }}
    />
  );
}
