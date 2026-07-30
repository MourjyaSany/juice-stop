'use client';

import { useRef } from 'react';
import { m, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { SPRING } from '../motion-provider';

/**
 * Scroll-driven motion.
 *
 * `useInView` with `once: true` — an element that re-animates every time it scrolls back into
 * view is distracting on a long page and makes the content feel unstable. Reveal is a first
 * impression, not a recurring effect.
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 22,
  className = '',
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-12% 0px -8% 0px' });
  const reduced = useReducedMotion();

  const Component = m[as] as typeof m.div;

  return (
    <Component
      ref={ref}
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      animate={inView || reduced ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ ...SPRING.smooth, delay }}
    >
      {children}
    </Component>
  );
}

/** Staggers children by index, capped so a long list still finishes promptly. */
export function ScrollStagger({
  children,
  index,
  step = 0.05,
  max = 0.35,
  className = '',
}: {
  children: React.ReactNode;
  index: number;
  step?: number;
  max?: number;
  className?: string;
}) {
  return (
    <ScrollReveal delay={Math.min(index * step, max)} className={className}>
      {children}
    </ScrollReveal>
  );
}

/**
 * Parallax offset driven by the element's own scroll progress.
 *
 * Returns a MotionValue so the transform never passes through React state — the element moves on
 * the compositor and the component does not re-render while scrolling.
 */
export function useParallax(distance = 40): {
  ref: React.RefObject<HTMLDivElement | null>;
  y: MotionValue<number>;
} {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [distance, -distance]);
  return { ref, y };
}
