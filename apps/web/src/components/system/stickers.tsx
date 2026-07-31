'use client';

import { useMemo } from 'react';
import { m, useReducedMotion } from 'motion/react';

/**
 * Background stickers.
 *
 * Hand-drawn SVG rather than generated images: they stay crisp at any size, cost ~2 KB total
 * instead of five more network requests, and can be tinted from the brand ramp so they belong to
 * the page rather than sitting on top of it.
 *
 * On the cola can specifically — it is a **generic** red can, not Coca-Cola livery. Putting a
 * real trademark on a commercial storefront is a legal problem rather than a design one, and a
 * generic can reads exactly the same at 28 px.
 */

type StickerProps = { size?: number; className?: string };

export function ColaCan({ size = 28, className }: StickerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2.4" fill="#E23744" />
      <rect x="7" y="3" width="10" height="18" rx="2.4" stroke="#FF6B6B" strokeWidth="0.8" />
      <path d="M7.6 7.5h8.8M7.6 16.5h8.8" stroke="#FFF" strokeOpacity="0.75" strokeWidth="0.9" />
      <ellipse cx="12" cy="3.4" rx="4.6" ry="1.2" fill="#D1D5DB" />
      <path d="M10 11.5c1.4-1.2 2.6 1.2 4 0" stroke="#FFF" strokeOpacity="0.85" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="8.6" y="4.6" width="1.4" height="14" rx="0.7" fill="#FFF" fillOpacity="0.18" />
    </svg>
  );
}

export function PizzaBox({ size = 30, className }: StickerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 9.5 12 5l9 4.5v8L12 22l-9-4.5v-8Z" fill="#C2410C" />
      <path d="M3 9.5 12 14l9-4.5" stroke="#FDBA74" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M12 14v8" stroke="#FDBA74" strokeWidth="0.9" />
      <path d="M3 9.5 12 5l9 4.5v8L12 22l-9-4.5v-8Z" stroke="#FB923C" strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx="8.4" cy="10.4" r="0.9" fill="#FDE68A" />
      <circle cx="15.4" cy="10.6" r="0.75" fill="#FDE68A" />
      <path d="M8 7.2 12 5.6l4 1.6" stroke="#FED7AA" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

export function GameController({ size = 30, className }: StickerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6.6 8h10.8c2.1 0 3.6 1.7 3.9 3.8l.5 3.6c.25 1.9-1.2 3.2-2.7 2.5-1.2-.55-2.2-1.5-3.1-2.4H8.1c-.9.9-1.9 1.85-3.1 2.4-1.5.7-2.95-.6-2.7-2.5l.5-3.6C3.1 9.7 4.5 8 6.6 8Z"
        fill="#7E22CE"
        stroke="#C084FC"
        strokeWidth="0.85"
        strokeLinejoin="round"
      />
      <path d="M7.4 11.4v2.4M6.2 12.6h2.4" stroke="#F5F3FF" strokeWidth="1.15" strokeLinecap="round" />
      <circle cx="15.9" cy="11.7" r="1" fill="#FF6B1A" />
      <circle cx="17.6" cy="13.5" r="1" fill="#38BDF8" />
    </svg>
  );
}

export function ChipsPacket({ size = 28, className }: StickerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6.5 4.5h11l-1 15h-9l-1-15Z" fill="#F59E0B" stroke="#FCD34D" strokeWidth="0.85" strokeLinejoin="round" />
      <path d="M5.6 3.4c1.6.9 11.2.9 12.8 0l-1 1.9H6.6l-1-1.9Z" fill="#FBBF24" />
      <path d="M6.5 19.5c1.6.9 9.4.9 11 0l-.4 1.3H6.9l-.4-1.3Z" fill="#FBBF24" />
      <path d="M9 9.5c1.2-.9 2.4.9 3.6 0s2.4.9 2.4.9" stroke="#7C2D12" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />
      <path d="M9.2 13c1.2-.9 2.4.9 3.6 0" stroke="#7C2D12" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function CrescentMoon({ size = 24, className }: StickerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6Z"
        fill="#FDE68A"
        stroke="#FCD34D"
        strokeWidth="0.85"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="5.5" r="0.85" fill="#FFF" fillOpacity="0.9" />
      <circle cx="20.4" cy="8.6" r="0.6" fill="#FFF" fillOpacity="0.7" />
    </svg>
  );
}

const KINDS = [ColaCan, PizzaBox, GameController, ChipsPacket, CrescentMoon] as const;

/**
 * Scatters stickers across a section background.
 *
 * Placement uses a **seeded PRNG with a minimum-distance check**, not `Math.random()`. Two
 * reasons: random positions would hydrate-mismatch and React would discard the tree, and pure
 * random reliably produces clumps — the rejection sampling below is what keeps them evenly
 * spread rather than "not too clustered" by luck.
 *
 * Purely decorative: `aria-hidden`, non-interactive, and it renders nothing at all under
 * `prefers-reduced-motion` is *not* the behaviour — the stickers stay, only the drifting stops.
 * Removing them entirely would change the layout's character for no accessibility gain.
 */
export function StickerField({
  count = 10,
  seed = 11,
  opacity = 0.16,
}: {
  count?: number;
  seed?: number;
  opacity?: number;
}) {
  const reduced = useReducedMotion();

  const stickers = useMemo(() => {
    let s = seed;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    const placed: Array<{ x: number; y: number }> = [];
    const out: Array<{
      id: number;
      x: number;
      y: number;
      size: number;
      rotate: number;
      delay: number;
      duration: number;
      Kind: (typeof KINDS)[number];
    }> = [];

    // Rejection sampling: keep drawing positions until one is far enough from every other.
    // Caps attempts so a dense request degrades gracefully instead of spinning.
    const MIN_DISTANCE = 22;
    let attempts = 0;

    while (out.length < count && attempts < count * 40) {
      attempts++;
      const x = 4 + rand() * 92;
      const y = 3 + rand() * 94;
      const tooClose = placed.some(
        (p) => Math.hypot(p.x - x, (p.y - y) * 0.6) < MIN_DISTANCE,
      );
      if (tooClose) continue;

      placed.push({ x, y });
      out.push({
        id: out.length,
        x,
        y,
        size: 20 + rand() * 16,
        rotate: -28 + rand() * 56,
        delay: rand() * -14,
        duration: 11 + rand() * 9,
        Kind: KINDS[Math.floor(rand() * KINDS.length)]!,
      });
    }

    return out;
  }, [count, seed]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {stickers.map(({ id, x, y, size, rotate, delay, duration, Kind }) => (
        <m.span
          key={id}
          className="absolute block"
          style={{ left: `${x}%`, top: `${y}%`, opacity, rotate }}
          animate={reduced ? {} : { y: [0, -14, 0], rotate: [rotate, rotate + 7, rotate] }}
          transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
        >
          <Kind size={size} />
        </m.span>
      ))}
    </div>
  );
}
