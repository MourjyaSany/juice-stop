'use client';

import { useRef } from 'react';
import { m, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { GeneratedImage } from '@/components/system';

/**
 * A still image treated like a film plate.
 *
 * Higgsfield image-to-video needs paid credits (the account is on the free plan with 0), so an
 * actual video file is not currently reachable. This gets most of the way there with four layers
 * of motion on a single still — and does it at ~0 KB of extra payload instead of a multi-megabyte
 * MP4 that would stall the hero on hostel Wi-Fi:
 *
 *   1. Ken Burns  — continuous slow zoom and drift, the shot that never quite settles
 *   2. Parallax   — the plate tracks scroll slower than the page, creating depth
 *   3. Light bar  — a specular sweep crossing the surface, like a light passing the lens
 *   4. Vignette   — breathing edge darkness so the frame feels lit rather than pasted
 *
 * Everything is transform/opacity, so it composites on the GPU and holds frame rate on a
 * low-end Android. When credits exist, swapping in a `<video>` is a change to this one file.
 */
export function CinematicStill({
  slug,
  className = '',
  radius = 26,
  priority = false,
}: {
  slug: string;
  className?: string;
  radius?: number;
  priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  // The plate drifts against the scroll direction — the cheapest convincing depth cue there is.
  const parallaxY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-26, 26]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      style={{ borderRadius: radius }}
    >
      {/* 1 + 2 — Ken Burns over parallax. Scaled past 100% so drift never exposes an edge. */}
      <m.div
        className="absolute inset-0"
        style={{ y: parallaxY }}
      >
        <m.div
          className="h-full w-full"
          animate={
            reduced
              ? {}
              : {
                  scale: [1.12, 1.2, 1.12],
                  x: ['0%', '-2.2%', '0%'],
                  y: ['0%', '1.6%', '0%'],
                }
          }
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
        >
          <GeneratedImage
            slug={slug}
            priority={priority}
            rounded="0px"
            className="h-full w-full"
          />
        </m.div>
      </m.div>

      {/* 3 — specular sweep. Long interval so it reads as an event, not a loop. */}
      {!reduced && (
        <m.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{
            background:
              'linear-gradient(105deg, transparent, rgb(255 255 255 / 0.16), transparent)',
          }}
          animate={{ x: ['-140%', '420%'] }}
          transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 5.5, ease: 'easeInOut' }}
        />
      )}

      {/* 4 — breathing vignette. */}
      <m.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, transparent 42%, rgb(0 0 0 / 0.55) 100%)',
        }}
        animate={reduced ? {} : { opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Colour grade — ties the plate to the brand ramp rather than leaving it neutral. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{
          background:
            'linear-gradient(140deg, rgb(255 107 26 / 0.22), transparent 45%, rgb(168 85 247 / 0.26))',
        }}
      />

      {/* Inner hairline so the plate reads as a lit surface, not a cut-out. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.09)', borderRadius: radius }}
      />
    </div>
  );
}
