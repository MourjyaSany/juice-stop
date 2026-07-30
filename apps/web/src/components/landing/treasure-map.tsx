'use client';

import { useRef } from 'react';
import { m, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { JOURNEY, type Checkpoint } from '@/data/journey';
import { GeneratedImage, Eyebrow, GradientText } from '@/components/system';
import { SPRING } from '@/components/motion-provider';

/**
 * The midnight mission map.
 *
 * A zig-zag route with curved dashed connectors that **draw themselves** as you scroll, and a
 * spine whose glow fills to your scroll position — so progress down the page reads as progress
 * through the journey.
 *
 * Why zig-zag rather than a literally horizontal rail: a horizontal scroller on a phone hijacks
 * the vertical gesture and hides most of the content behind a swipe nobody discovers. This keeps
 * the wandering-path feeling of a treasure map while staying a normal vertical scroll — the map
 * reads horizontally *within* each row, and the route weaves side to side down the page.
 *
 * Connector paths animate `pathLength`, and cards animate `transform`/`opacity` only, so the
 * whole thing stays on the compositor.
 */
export function TreasureMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.8', 'end 0.35'],
  });
  // Smoothed so the spine glides rather than jitters with the scroll wheel.
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 });
  const spineScale = useTransform(progress, [0, 1], [0, 1]);

  return (
    <section ref={containerRef} className="relative mx-auto w-full max-w-lg px-5 py-20">
      <header className="text-center">
        <Eyebrow tone="violet">The midnight mission</Eyebrow>
        <h2 className="mt-2.5 font-display text-[clamp(1.75rem,7vw,2.4rem)] font-bold leading-[1.05] tracking-[-0.03em]">
          Nine checkpoints
          <br />
          <GradientText>from tap to doorstep.</GradientText>
        </h2>
        <p className="mx-auto mt-3 max-w-[19rem] text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Every stage below is a real order status. You will watch your own food move through it.
        </p>
      </header>

      <div className="relative mt-14">
        {/* Spine — a dim rail with a bright fill that tracks scroll. */}
        <div
          aria-hidden
          className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2"
          style={{ background: 'rgb(255 255 255 / 0.07)' }}
        />
        <m.div
          aria-hidden
          className="absolute left-1/2 top-0 w-px -translate-x-1/2 origin-top"
          style={{
            height: '100%',
            scaleY: reduced ? 1 : spineScale,
            background:
              'linear-gradient(180deg, #FF6B1A 0%, #FF3D81 45%, #A855F7 100%)',
            boxShadow: '0 0 14px rgb(255 107 26 / 0.55)',
          }}
        />

        <ol className="relative space-y-8">
          {JOURNEY.map((point, i) => (
            <CheckpointCard
              key={point.id}
              point={point}
              side={i % 2 === 0 ? 'left' : 'right'}
              isLast={i === JOURNEY.length - 1}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function CheckpointCard({
  point,
  side,
  isLast,
}: {
  point: Checkpoint;
  side: 'left' | 'right';
  isLast: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: '-18% 0px -18% 0px' });
  const reduced = useReducedMotion();

  const accent = point.tone === 'warm' ? '255 107 26' : '168 85 247';

  return (
    <li ref={ref} className="relative">
      {/* Node on the spine. Unlocks — scales in and lights up when the card arrives. */}
      <m.span
        aria-hidden
        className="absolute left-1/2 top-7 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full"
        initial={reduced ? false : { scale: 0.3, opacity: 0 }}
        animate={inView || reduced ? { scale: 1, opacity: 1 } : {}}
        transition={{ ...SPRING.bouncy, delay: 0.12 }}
        style={{
          background: 'var(--color-canvas)',
          border: `2px solid rgb(${accent})`,
          boxShadow: `0 0 18px rgb(${accent} / 0.7)`,
        }}
      >
        <span
          className="tabular font-mono text-[10px] font-bold"
          style={{ color: `rgb(${accent})` }}
        >
          {point.index}
        </span>
      </m.span>

      <m.div
        className={`w-[calc(50%-1.6rem)] ${side === 'left' ? 'mr-auto' : 'ml-auto'}`}
        initial={reduced ? false : { opacity: 0, x: side === 'left' ? -26 : 26, y: 10 }}
        animate={inView || reduced ? { opacity: 1, x: 0, y: 0 } : {}}
        transition={SPRING.smooth}
      >
        <div
          className="group relative overflow-hidden rounded-[18px] p-3"
          style={{
            background: `linear-gradient(155deg, rgb(${accent} / 0.10), rgb(255 255 255 / 0.02))`,
            border: `1px solid rgb(${accent} / 0.22)`,
            boxShadow: `0 10px 30px -18px rgb(${accent} / 0.8)`,
          }}
        >
          <GeneratedImage
            slug={point.asset}
            rounded="12px"
            className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.05]"
          />
          <h3 className="mt-2.5 font-display text-[13px] font-bold leading-tight tracking-[-0.01em]">
            {point.title}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {point.line}
          </p>
        </div>
      </m.div>

      {!isLast && <Connector side={side} active={inView} />}
    </li>
  );
}

/**
 * Curved dashed link to the next checkpoint.
 *
 * `pathLength` animates from 0 → 1, which draws the line rather than fading it in. The dash
 * pattern is applied to a second overlaid path so the stroke can crawl without the draw-on
 * animation fighting the dash offset.
 */
function Connector({ side, active }: { side: 'left' | 'right'; active: boolean }) {
  const reduced = useReducedMotion();

  // Sweeps out from the current side and back to the spine, giving the wandering-route feel.
  const d =
    side === 'left'
      ? 'M50,0 C50,22 12,26 12,48 C12,70 50,74 50,100'
      : 'M50,0 C50,22 88,26 88,48 C88,70 50,74 50,100';

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 top-[85%] -z-10 h-14 w-full"
    >
      <defs>
        <linearGradient id={`conn-${side}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF6B1A" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#A855F7" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <m.path
        d={d}
        fill="none"
        stroke={`url(#conn-${side})`}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="4 5"
        vectorEffect="non-scaling-stroke"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={active || reduced ? { pathLength: 1, opacity: 1 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
      />
    </svg>
  );
}
