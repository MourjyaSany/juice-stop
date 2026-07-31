'use client';

import { useRef } from 'react';
import { m, useInView, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { JOURNEY, type Checkpoint } from '@/data/journey';
import { GeneratedImage, Eyebrow, GradientText } from '@/components/system';
import { SPRING } from '@/components/motion-provider';

/**
 * The midnight mission map.
 *
 * Cards alternate sides, and each is followed by an **in-flow** connector that occupies the gap
 * and warps across to the next card's side. That is the fix for the previous version, where the
 * connector was absolutely positioned at `top-85%` behind the card — it overlapped the artwork
 * instead of linking between cards, so the route read as decoration rather than a path.
 *
 * The connector owning real layout height also means the spacing between checkpoints *is* the
 * connector, so the line can never drift out of alignment with the cards it joins.
 *
 * Paths animate `pathLength` (drawn, not faded) and cards animate transform/opacity only, so the
 * whole map stays on the compositor.
 */
export function TreasureMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 0.85', 'end 0.4'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 });
  const trailOpacity = useTransform(progress, [0, 0.15, 1], [0.25, 0.6, 0.9]);

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

      <m.ol className="relative mt-12" style={{ opacity: reduced ? 1 : trailOpacity }}>
        {JOURNEY.map((point, i) => (
          <Checkpoint
            key={point.id}
            point={point}
            side={i % 2 === 0 ? 'left' : 'right'}
            isLast={i === JOURNEY.length - 1}
          />
        ))}
      </m.ol>
    </section>
  );
}

function Checkpoint({
  point,
  side,
  isLast,
}: {
  point: Checkpoint;
  side: 'left' | 'right';
  isLast: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px -15% 0px' });
  const reduced = useReducedMotion();

  const accent = point.tone === 'warm' ? '255 107 26' : '168 85 247';

  return (
    <li ref={ref} className="relative">
      {/* Card — 64% width so the artwork is legible, offset to its side. */}
      {/* z-10 keeps the card above the connector, so the trail passes cleanly *behind* the
          artwork rather than crossing over it. */}
      <m.div
        className={`relative z-10 w-[64%] ${side === 'left' ? 'mr-auto' : 'ml-auto'}`}
        initial={reduced ? false : { opacity: 0, x: side === 'left' ? -28 : 28, y: 12 }}
        animate={inView || reduced ? { opacity: 1, x: 0, y: 0 } : {}}
        transition={SPRING.smooth}
      >
        {/* Checkpoint number rides the card's outer corner — no central spine to collide with. */}
        <m.span
          aria-hidden
          className={`absolute -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full ${
            side === 'left' ? '-right-3' : '-left-3'
          }`}
          initial={reduced ? false : { scale: 0.2, opacity: 0 }}
          animate={inView || reduced ? { scale: 1, opacity: 1 } : {}}
          transition={{ ...SPRING.bouncy, delay: 0.14 }}
          style={{
            background: 'var(--color-canvas)',
            border: `2px solid rgb(${accent})`,
            boxShadow: `0 0 20px rgb(${accent} / 0.75)`,
          }}
        >
          <span className="tabular font-mono text-[11px] font-bold" style={{ color: `rgb(${accent})` }}>
            {point.index}
          </span>
        </m.span>

        <div
          className="group relative overflow-hidden rounded-[20px] p-3 transition-transform duration-500 hover:-translate-y-1"
          style={{
            background: `linear-gradient(155deg, rgb(${accent} / 0.12), rgb(255 255 255 / 0.02))`,
            border: `1px solid rgb(${accent} / 0.26)`,
            boxShadow: `0 14px 36px -20px rgb(${accent} / 0.9)`,
          }}
        >
          <GeneratedImage
            slug={point.asset}
            rounded="14px"
            className="aspect-[4/3] w-full transition-transform duration-700 group-hover:scale-[1.07]"
          />
          <h3 className="mt-3 font-display text-sm font-bold leading-tight tracking-[-0.01em]">
            {point.title}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {point.line}
          </p>
        </div>
      </m.div>

      {/* In-flow connector: owns the gap, so the line and the cards can never drift apart. */}
      {!isLast && <Connector from={side} active={inView} accent={accent} />}
    </li>
  );
}

/**
 * The flowing link to the next checkpoint.
 *
 * Sits **below** its card in normal flow and sweeps across to the opposite side, so the route
 * visibly wanders down the page. Two stacked paths: a wide soft glow underneath and a dashed
 * stroke on top — a single dashed line on a dark background reads as a hairline rather than a
 * trail.
 */
function Connector({
  from,
  active,
  accent,
}: {
  from: 'left' | 'right';
  active: boolean;
  accent: string;
}) {
  const reduced = useReducedMotion();

  // Card centres sit at roughly 32% and 68%. The S-curve leaves one and arrives at the other.
  //
  // The path deliberately starts at y=-14 and ends at y=114, i.e. *past* both ends of its own
  // box, and the box is pulled into the cards with negative margins. Stopping at the box edge
  // left a visible gap between the trail and the artwork — the line has to run underneath the
  // card corners for the route to read as continuous.
  const d =
    from === 'left'
      ? 'M32,-14 C32,32 68,60 68,114'
      : 'M68,-14 C68,32 32,60 32,114';

  const gradientId = `trail-${from}`;

  return (
    // Negative margins tuck the connector under the cards above and below it.
    <div className="relative -mb-4 -mt-4 h-28 w-full" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B1A" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#FF3D81" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#A855F7" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Soft glow beneath the dashes, so the trail has presence at a glance. */}
        <m.path
          d={d}
          fill="none"
          stroke={`rgb(${accent})`}
          strokeWidth="6"
          strokeLinecap="round"
          opacity={0.13}
          vectorEffect="non-scaling-stroke"
          initial={reduced ? false : { pathLength: 0 }}
          animate={active || reduced ? { pathLength: 1 } : {}}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />

        <m.path
          d={d}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="5 6"
          vectorEffect="non-scaling-stroke"
          initial={reduced ? false : { pathLength: 0, opacity: 0 }}
          animate={active || reduced ? { pathLength: 1, opacity: 1 } : {}}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />
      </svg>
    </div>
  );
}
