'use client';

import { useRef, useState } from 'react';
import { m, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';

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
  alt: string;
  /** Resting centre, as a percentage of the stage. */
  top: number;
  /** Rendered width, as a percentage of the stage. */
  width: number;
  z: number;
  /** Intrinsic pixel size of the extracted cut-out — reserves the box so nothing reflows on load. */
  w: number;
  h: number;
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
 *
 * `width` is derived from each cut-out's own pixel width relative to the top bun's, so the layers
 * keep the proportions they were photographed at. Cheese and lettuce are the two deliberate
 * exceptions: both are widened past the patty because a burger where the cheese does not drape and
 * the lettuce does not poke out looks like a diagram of a burger.
 *
 * `top` values assume the stage's 5/4 box. A layer's rendered height is
 * `width × 1.25 × (h / w)`, so changing the hero's aspect ratio means retuning this column.
 */
const LAYERS: readonly AssemblyLayer[] = [
  { slug: 'bottom-bun', alt: 'Toasted bottom bun', w: 404, h: 209, top: 79, width: 47.7, z: 1, fromX: 0, fromY: 40, fromRotate: -6, enter: 0.0, settle: 0.12 },
  { slug: 'patty', alt: 'Flame-grilled patty', w: 386, h: 183, top: 70, width: 45.6, z: 2, fromX: 36, fromY: 26, fromRotate: 16, enter: 0.06, settle: 0.20 },
  { slug: 'cheese', alt: 'Melted cheddar', w: 329, h: 167, top: 64.5, width: 48, z: 3, fromX: -30, fromY: -24, fromRotate: -14, enter: 0.12, settle: 0.27 },
  { slug: 'tomato', alt: 'Tomato slices', w: 355, h: 182, top: 56.5, width: 41.9, z: 4, fromX: 34, fromY: -22, fromRotate: 18, enter: 0.18, settle: 0.33 },
  { slug: 'lettuce', alt: 'Crisp lettuce', w: 374, h: 215, top: 51, width: 50, z: 5, fromX: -32, fromY: -26, fromRotate: -16, enter: 0.23, settle: 0.39 },
  { slug: 'onion', alt: 'Red onion rings', w: 312, h: 143, top: 45.5, width: 36.9, z: 6, fromX: -36, fromY: -18, fromRotate: -20, enter: 0.28, settle: 0.44 },
  { slug: 'pickles', alt: 'Dill pickles', w: 311, h: 165, top: 41, width: 36.7, z: 7, fromX: 32, fromY: -20, fromRotate: 22, enter: 0.33, settle: 0.48 },
  { slug: 'sauce', alt: 'Burger sauce', w: 383, h: 171, top: 36.5, width: 45.2, z: 8, fromX: -34, fromY: 22, fromRotate: -18, enter: 0.37, settle: 0.53 },
  { slug: 'top-bun', alt: 'Sesame brioche top bun', w: 474, h: 243, top: 24, width: 56, z: 9, fromX: 0, fromY: -46, fromRotate: 8, enter: 0.44, settle: 0.61 },
  // Particles ride over the finished build rather than joining the stack. Both sit inboard of the
  // edges they drift toward — the stage clips overflow, and a crumb sliced by the rounded corner
  // reads as a rendering bug rather than as a crumb.
  //
  // They now land before the compaction window opens, so nothing is still flying while the stack
  // is squeezing shut.
  { slug: 'sesame', alt: '', w: 292, h: 140, top: 15, width: 42, z: 10, fromX: 0, fromY: -30, fromRotate: 0, enter: 0.53, settle: 0.65 },
  { slug: 'crumbs', alt: '', w: 414, h: 222, top: 80, width: 52, z: 11, fromX: 0, fromY: 24, fromRotate: 0, enter: 0.56, settle: 0.67 },
];

/**
 * How much the finished stack squeezes together.
 *
 * The layers are positioned where they were *photographed*, which leaves visible air between them
 * — assembled, but loose, like an exploded diagram that stopped halfway. Real burgers compress
 * under their own top bun.
 *
 * So the resting geometry stays exactly as tuned, and a final pass pulls every layer toward the
 * stack's centre by this fraction of its distance from it. 0.26 closes most of the gap while
 * leaving enough separation to still read as distinct ingredients — past about 0.35 the tomato
 * disappears behind the cheese and it becomes a bun with a colour in the middle.
 *
 * Applied as a `translateY` on each layer rather than by editing `top`, because `top` is a layout
 * property: animating it would take the whole stack off the compositor, which is the one thing
 * this component's geometry is arranged to avoid.
 */
const COMPACTION = 0.26;

/** The vertical centre the stack collapses toward — midpoint of the bun-to-bun span. */
const STACK_CENTRE = 51.5;

/**
 * Scroll window over which the squeeze happens: after the last ingredient lands, well before the end.
 *
 * Ending at 0.84 rather than 0.98 leaves the last sixth of the range as slack. That headroom is the
 * point — the sparkle fires by ~0.9, so somebody scrolling briskly still sees the finish rather
 * than arriving at a burger that is already done and wondering what they missed.
 */
const COMPACT_FROM = 0.68;
const COMPACT_TO = 0.84;

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

  /**
   * The scroll window the build is choreographed across.
   *
   * This used to run `start 85%` → `end 25%`, which meant progress only reached 1 once the burger's
   * bottom edge had climbed to a quarter of the way up the viewport — by which point the finished
   * stack was half off the top of the screen. The payoff happened where nobody was looking.
   *
   * Now it completes at `end 78%`: the instant the whole burger is sitting comfortably inside the
   * viewport rather than leaving it. The range is shorter, so the assembly reads as brisk instead
   * of as something that has to be dragged out of the page.
   */
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start 95%', 'end 78%'],
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

      {LAYERS.map((layer) => (
        <Layer
          key={layer.slug}
          layer={layer}
          progress={progress}
          reduced={reduced === true}
          priority={priority}
        />
      ))}

      {/* Fires as the stack squeezes shut — the payoff for having scrolled. */}
      <Sparkles progress={progress} reduced={reduced === true} />

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
  const { slug, alt, w, h, top, width, z, fromX, fromY, fromRotate, enter, settle } = layer;

  const range: [number, number] = [enter, settle];
  const x = useTransform(progress, range, [`${fromX}%`, '0%'], { clamp: true });

  /**
   * How far this layer travels during the squeeze, expressed in its **own** height.
   *
   * `translateY` percentages resolve against the element's height, not the stage's — so a single
   * shared offset would move a thin slice of cheese much further than the top bun. The distance is
   * computed in stage units and then converted through each layer's rendered height.
   *
   * Rendered height as a share of the stage is `width × 1.25 × (h / w)`: the 1.25 converts a
   * horizontal percentage to a vertical one across the stage's 5/4 box.
   */
  const heightPct = width * 1.25 * (h / w);
  const compactPct = ((STACK_CENTRE - top) * COMPACTION * 100) / heightPct;

  // The −50% that centres the layer on its `top` anchor is baked into this range rather than set
  // as a separate `translateY`. Motion aliases `y` to `translateY` — they are one transform slot,
  // so declaring both would silently drop whichever it resolved second, and the stack would sit
  // half a layer low.
  //
  // Four stops rather than two: fly in, rest where it was photographed, hold, then squeeze. The
  // hold matters — without it a layer that lands early would start creeping toward the centre
  // while its neighbours were still in the air.
  const y = useTransform(
    progress,
    [enter, settle, COMPACT_FROM, COMPACT_TO],
    [`${fromY - 50}%`, '-50%', '-50%', `${-50 + compactPct}%`],
    { clamp: true },
  );
  const rotate = useTransform(progress, range, [fromRotate, 0], { clamp: true });
  // Squashes very slightly as it settles, the way a stack under a bun does. Subtle on purpose:
  // enough to feel weight, not enough to read as a distortion of the photography.
  const scale = useTransform(
    progress,
    [enter, settle, COMPACT_FROM, COMPACT_TO],
    [0.86, 1, 1, 1.015],
    { clamp: true },
  );
  // Fades in over the first third of its own window — an ingredient should be visible while it
  // travels, not pop into existence on arrival.
  const opacity = useTransform(progress, [enter, enter + (settle - enter) * 0.35], [0, 1], {
    clamp: true,
  });

  // A layer whose file is absent removes itself rather than leaving a broken-image glyph wedged
  // into the stack — the burger still assembles cleanly from whatever did load.
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
        ...(reduced ? { translateY: '-50%' } : { x, y, rotate, scale, opacity }),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local pre-optimised cut-outs; the
          alpha channel and the onError fallback both matter more than a loader round-trip. */}
      <img
        src={`/generated/burger/${slug}.webp`}
        alt={alt}
        {...(alt === '' ? { 'aria-hidden': true } : {})}
        width={w}
        height={h}
        /* Only the two layers on screen at scroll progress 0 load eagerly. The other nine total
           ~270 KB and none of them is visible until the customer has scrolled, so racing them
           against the LCP candidate would cost first paint for nothing. They still sit in the
           viewport, so browsers fetch them straight after — just at a lower priority. */
        loading={priority && z <= 2 ? 'eager' : 'lazy'}
        fetchPriority={priority && z <= 2 ? 'high' : 'low'}
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

/**
 * The finishing sparkle.
 *
 * Fires as the stack squeezes shut, which is the moment the build is *done* — the payoff for
 * having scrolled. Without it the assembly simply stops, and an animation that stops is one the
 * viewer is left wondering whether they broke.
 *
 * Positions are a fixed table rather than randomised: a seed that changes per render would make
 * the same scroll look different on every visit, and the whole point is that this reads as one
 * choreographed moment. They ring the top bun and the seam where the fillings meet, because that
 * is where a glint belongs on something glazed.
 *
 * Purely decorative and `aria-hidden` — nothing here is information, and a screen reader
 * announcing eleven sparkles would be actively hostile.
 */
const SPARKS: ReadonlyArray<{ x: number; y: number; size: number; delay: number }> = [
  { x: 26, y: 30, size: 13, delay: 0.0 },
  { x: 72, y: 26, size: 16, delay: 0.06 },
  { x: 50, y: 17, size: 19, delay: 0.02 },
  { x: 36, y: 20, size: 10, delay: 0.12 },
  { x: 64, y: 38, size: 11, delay: 0.09 },
  { x: 20, y: 47, size: 12, delay: 0.15 },
  { x: 80, y: 52, size: 14, delay: 0.05 },
  { x: 44, y: 60, size: 9, delay: 0.18 },
  { x: 58, y: 70, size: 12, delay: 0.11 },
  { x: 30, y: 66, size: 10, delay: 0.2 },
  { x: 50, y: 84, size: 15, delay: 0.14 },
];

function Sparkles({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  // Under reduced motion the burger renders finished and still, so a burst of twinkling would be
  // exactly the thing that preference exists to prevent.
  if (reduced) return null;

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ zIndex: 12 }}>
      {SPARKS.map((spark) => (
        <Spark key={`${spark.x}-${spark.y}`} spark={spark} progress={progress} />
      ))}
    </span>
  );
}

function Spark({
  spark,
  progress,
}: {
  spark: { x: number; y: number; size: number; delay: number };
  progress: MotionValue<number>;
}) {
  // Each spark opens on its own slightly-delayed window, so they arrive as a scatter rather than
  // as one synchronised flash. Fading back out before the end leaves the burger clean at rest —
  // a permanent sparkle stops being a moment and becomes clutter.
  const start = COMPACT_FROM + spark.delay * 0.4;
  const peak = start + 0.05;
  const end = Math.min(1, peak + 0.09);

  const opacity = useTransform(progress, [start, peak, end], [0, 1, 0.35], { clamp: true });
  const scale = useTransform(progress, [start, peak, end], [0.2, 1, 0.8], { clamp: true });
  const rotate = useTransform(progress, [start, end], [-45, 45], { clamp: true });

  return (
    <m.span
      className="absolute block"
      style={{
        left: `${spark.x}%`,
        top: `${spark.y}%`,
        width: spark.size,
        height: spark.size,
        marginLeft: -spark.size / 2,
        marginTop: -spark.size / 2,
        opacity,
        scale,
        rotate,
      }}
    >
      {/* A four-point star drawn in CSS rather than an asset: it is two crossed radial gradients,
          it scales to any size without a second file, and it costs no request. */}
      <span
        className="block h-full w-full"
        style={{
          background:
            'radial-gradient(closest-side, rgb(255 255 255 / 0.95), transparent 70%), ' +
            'linear-gradient(0deg, transparent 46%, rgb(255 214 170 / 0.95) 50%, transparent 54%), ' +
            'linear-gradient(90deg, transparent 46%, rgb(255 214 170 / 0.95) 50%, transparent 54%)',
          filter: 'drop-shadow(0 0 6px rgb(255 176 92 / 0.9))',
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
        // Sits under the bottom bun's base (centre 79%, so its foot lands near 94%).
        top: '88%',
        background:
          'radial-gradient(ellipse at 50% 50%, rgb(255 138 61 / 0.55), rgb(168 85 247 / 0.22) 55%, transparent 74%)',
        filter: 'blur(14px)',
        ...(reduced ? { opacity: 0.85 } : { scale, opacity }),
      }}
    />
  );
}
