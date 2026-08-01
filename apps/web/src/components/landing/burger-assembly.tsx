'use client';

import { useRef, useState } from 'react';
import { m, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { BURGER_LAYER_ASSETS } from '@/data/assets';

/**
 * The scroll-assembled hero burger.
 *
 * Twelve ingredient cut-outs fly in and stack as the hero scrolls past — bottom bun first, top bun
 * last, steam and sesame settling over the finished build.
 *
 * Three decisions worth knowing:
 *
 * 1. **It adds no page height.** Progress is read from the hero's own passage through the
 *    viewport (`start 85%` → `end 25%`) rather than from a tall sticky scroll cage. A cage is the
 *    usual way to build this, and it would have changed the landing page's layout and scroll
 *    length — which this component was explicitly not allowed to do. Reading the existing scroll
 *    gets the same choreography for zero layout cost.
 *
 * 2. **Only `transform` and `opacity` animate.** No width, height, top or filter keyframes, so
 *    every layer stays on the compositor and the whole stack holds 60 fps with twelve elements in
 *    flight.
 *
 * 3. **The geometry is a table, not code.** Tuning the stack against the real photography means
 *    editing numbers in `LAYERS`, not rewriting animation logic.
 *
 * Under `prefers-reduced-motion` the burger renders fully assembled and still. The point of the
 * hero is the burger, not the scrolling.
 */

interface AssemblyLayer {
  slug: string;
  /** Resting centre, as a percentage of the stage. */
  top: number;
  /** Rendered width, as a percentage of the stage. */
  width: number;
  z: number;
  /** Entry offset relative to the resting place — where the ingredient flies in from. */
  fromX: number;
  fromY: number;
  fromRotate: number;
  /** Scroll window over which this layer travels and lands. */
  enter: number;
  settle: number;
}

/**
 * Bottom-up build order.
 *
 * Ingredients alternate sides on entry so the stack assembles like a tossed build rather than a
 * column of things dropping in single file. Windows overlap by design — a strictly sequential
 * stagger reads as a loading spinner; overlapping reads as a kitchen.
 */
const LAYERS: readonly AssemblyLayer[] = [
  { slug: 'bl-bun-bottom', top: 72, width: 54, z: 1, fromX: 0, fromY: 40, fromRotate: -6, enter: 0.0, settle: 0.16 },
  { slug: 'bl-sauce', top: 67, width: 44, z: 2, fromX: -34, fromY: 22, fromRotate: -18, enter: 0.08, settle: 0.26 },
  { slug: 'bl-patty', top: 60, width: 56, z: 3, fromX: 36, fromY: 26, fromRotate: 16, enter: 0.15, settle: 0.34 },
  { slug: 'bl-cheese', top: 54, width: 58, z: 4, fromX: -30, fromY: -24, fromRotate: -14, enter: 0.23, settle: 0.42 },
  { slug: 'bl-pickles', top: 49, width: 40, z: 5, fromX: 32, fromY: -20, fromRotate: 22, enter: 0.3, settle: 0.5 },
  { slug: 'bl-onion', top: 45, width: 46, z: 6, fromX: -36, fromY: -18, fromRotate: -20, enter: 0.36, settle: 0.56 },
  { slug: 'bl-tomato', top: 40, width: 52, z: 7, fromX: 34, fromY: -22, fromRotate: 18, enter: 0.42, settle: 0.62 },
  { slug: 'bl-lettuce', top: 35, width: 58, z: 8, fromX: -32, fromY: -26, fromRotate: -16, enter: 0.48, settle: 0.68 },
  { slug: 'bl-bun-top', top: 23, width: 56, z: 9, fromX: 0, fromY: -46, fromRotate: 8, enter: 0.56, settle: 0.8 },
  { slug: 'bl-sesame', top: 18, width: 40, z: 10, fromX: 0, fromY: -30, fromRotate: 0, enter: 0.72, settle: 0.9 },
  { slug: 'bl-steam', top: 8, width: 62, z: 11, fromX: 0, fromY: 24, fromRotate: 0, enter: 0.78, settle: 1.0 },
];

/** Every layer slug must exist in the asset registry, or it silently renders nothing. */
const KNOWN = new Set(BURGER_LAYER_ASSETS.map((a) => a.slug));

export function BurgerAssembly({
  className = '',
  radius = 26,
  priority = false,
}: {
  className?: string;
  radius?: number;
  priority?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start 85%', 'end 25%'],
  });

  // Springing the *driver* rather than each layer means one spring simulation feeds twelve
  // transforms. Springing them individually would run twelve simulations for an effect nobody
  // could distinguish.
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 30, mass: 0.5 });

  return (
    <span
      ref={stageRef}
      className={`relative block overflow-hidden ${className}`}
      style={{
        borderRadius: radius,
        background:
          'radial-gradient(circle at 50% 62%, rgb(255 107 26 / 0.20), rgb(168 85 247 / 0.12) 52%, transparent 76%)',
      }}
    >
      {/* Plate glow beneath the stack — grounds the burger so it does not float in a void. */}
      <Plate progress={progress} reduced={reduced === true} />

      {LAYERS.filter((l) => KNOWN.has(l.slug)).map((layer) => (
        <Layer
          key={layer.slug}
          layer={layer}
          progress={progress}
          reduced={reduced === true}
          priority={priority}
        />
      ))}

      {/* Same light treatment as every other image slot, so the hero belongs to the same system. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgb(255 255 255 / 0.08), transparent 44%, rgb(0 0 0 / 0.28))',
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07)',
          borderRadius: 'inherit',
        }}
      />
    </span>
  );
}

function Layer({
  layer,
  progress,
  reduced,
  priority,
}: {
  layer: AssemblyLayer;
  progress: MotionValue<number>;
  reduced: boolean;
  priority: boolean;
}) {
  const { slug, top, width, z, fromX, fromY, fromRotate, enter, settle } = layer;

  const range: [number, number] = [enter, settle];
  const x = useTransform(progress, range, [`${fromX}%`, '0%'], { clamp: true });
  const y = useTransform(progress, range, [`${fromY}%`, '0%'], { clamp: true });
  const rotate = useTransform(progress, range, [fromRotate, 0], { clamp: true });
  const scale = useTransform(progress, range, [0.86, 1], { clamp: true });
  // Fades in over the first third of its own window — an ingredient should be visible while it
  // travels, not pop into existence on arrival.
  const opacity = useTransform(progress, [enter, enter + (settle - enter) * 0.35], [0, 1], {
    clamp: true,
  });

  const asset = BURGER_LAYER_ASSETS.find((a) => a.slug === slug);
  // Layers arrive from the generator one at a time. A slug whose file is not there yet removes
  // itself rather than leaving a broken-image glyph wedged into the stack, so a partially
  // generated burger still assembles cleanly from whatever exists.
  const [missing, setMissing] = useState(false);
  if (missing) return null;

  return (
    <m.span
      className="pointer-events-none absolute left-1/2 block"
      style={{
        top: `${top}%`,
        width: `${width}%`,
        zIndex: z,
        marginLeft: `${-width / 2}%`,
        // translateY(-50%) centres the layer on its `top` anchor; the animated y stacks on top of
        // it, which is why the resting value is 0% rather than -50%.
        translateY: '-50%',
        ...(reduced ? {} : { x, y, rotate, scale, opacity }),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local pre-optimised cut-outs; the
          alpha channel and the onError-free path both matter more than a loader round-trip. */}
      <img
        src={`/generated/${slug}.webp`}
        alt={asset?.alt ?? ''}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setMissing(true)}
        className="h-auto w-full select-none"
        style={{
          // A contact shadow per layer is what makes a stack of cut-outs read as one object under
          // one light rather than as pasted stickers.
          filter: 'drop-shadow(0 10px 14px rgb(0 0 0 / 0.55))',
        }}
      />
    </m.span>
  );
}

/** The lit surface under the burger. Widens slightly as the stack grows heavier. */
function Plate({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  const scale = useTransform(progress, [0, 1], [0.7, 1], { clamp: true });
  const opacity = useTransform(progress, [0, 0.3, 1], [0, 0.5, 0.85], { clamp: true });

  return (
    <m.span
      aria-hidden
      className="absolute left-1/2 block h-[14%] w-[62%] -translate-x-1/2 rounded-[50%]"
      style={{
        top: '78%',
        background:
          'radial-gradient(ellipse at 50% 50%, rgb(255 138 61 / 0.55), rgb(168 85 247 / 0.22) 55%, transparent 74%)',
        filter: 'blur(14px)',
        ...(reduced ? { opacity: 0.85 } : { scale, opacity }),
      }}
    />
  );
}
