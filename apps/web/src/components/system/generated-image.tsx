'use client';

import { useState } from 'react';
import { findAsset, type AssetTone } from '@/data/assets';

const TONE_GRADIENT: Record<AssetTone, string> = {
  warm: 'radial-gradient(circle at 32% 26%, rgb(255 107 26 / 0.30), rgb(255 61 129 / 0.10) 55%, transparent 74%)',
  violet: 'radial-gradient(circle at 32% 26%, rgb(168 85 247 / 0.30), rgb(255 61 129 / 0.10) 55%, transparent 74%)',
  mixed: 'radial-gradient(circle at 30% 24%, rgb(255 107 26 / 0.26), rgb(168 85 247 / 0.22) 58%, transparent 76%)',
};

/**
 * An image slot backed by a generated asset.
 *
 * Resolves `/generated/<slug>.webp` and falls back to a tone-matched gradient plate when the file
 * is missing. The fallback is deliberately *designed* rather than a broken-image icon or grey box:
 * assets do not exist yet, so the app has to look finished without them.
 *
 * When the images land, dropping files into `public/generated/` is the whole integration — no
 * component anywhere changes.
 */
export function GeneratedImage({
  slug,
  className = '',
  rounded = 'inherit',
  priority = false,
  sizes,
}: {
  slug: string;
  className?: string;
  rounded?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const asset = findAsset(slug);
  const [failed, setFailed] = useState(false);
  const showFallback = asset === undefined || failed;

  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      style={{ borderRadius: rounded, background: TONE_GRADIENT[asset?.tone ?? 'warm'] }}
    >
      {showFallback ? (
        <span className="absolute inset-0 grid place-items-center">
          {/* Soft inner light so the plate reads as a lit surface, not a flat swatch. */}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, rgb(255 255 255 / 0.07), transparent 62%)',
            }}
          />
          <span
            aria-hidden
            className="relative select-none"
            style={{ fontSize: 'clamp(1.5rem, 42%, 4rem)', lineHeight: 1 }}
          >
            {asset?.fallback ?? '🍽️'}
          </span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- assets are pre-optimised local
        // webp; next/image adds a loader round-trip for no gain and breaks the onError fallback.
        <img
          src={`/generated/${slug}.webp`}
          alt={asset.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          {...(sizes !== undefined ? { sizes } : {})}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      {/* Unifies generated and fallback plates under one light treatment, so a half-populated
          asset set still reads as a single coherent system. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgb(255 255 255 / 0.10), transparent 42%, rgb(0 0 0 / 0.30))',
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.07)',
          borderRadius: 'inherit',
        }}
      />
    </span>
  );
}
