'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Money } from '@juice-stop/core';
import { priceFrom, useBrowsableItems, type MenuItem } from '@/data/menu';
import { assetForItem } from '@/data/assets';
import { usePopularLive, useIsSoldOut } from '@/components/storefront-live';
import { GeneratedImage, ScrollReveal, ScrollStagger, SectionHeading } from '@/components/system';
import { ArrowRightIcon, DietMark } from '@/components/icons';

/**
 * Popular tonight.
 *
 * Two sources, in priority order. If the owner has pinned a line-up from `/admin/menu`, that wins
 * and appears **in the order they chose** — their first pick is the first card, because a curated
 * rail that silently reorders itself is not curated.
 *
 * Otherwise it falls back to the catalogue's own bestseller tags, which is what shipped before and
 * is still the right default: a shop that has never touched this should see a sensible rail rather
 * than an empty one. The fallback also covers a failed fetch, so a network blip degrades to the
 * old behaviour instead of blanking a section of the landing page.
 */
function usePopularItems(): MenuItem[] {
  const items = useBrowsableItems();
  const pinned = usePopularLive((s) => s.ids);

  return useMemo(() => {
    if (pinned !== null && pinned.length > 0) {
      return pinned
        .map((id) => items.find((i) => i.id === id))
        .filter((i): i is MenuItem => i !== undefined);
    }
    return items
      .filter((i) => i.tags.includes('BESTSELLER') || i.tags.includes('TRENDING'))
      .slice(0, 8);
  }, [items, pinned]);
}

export function PopularTonight() {
  const items = useBrowsableItems();
  const popular = usePopularItems();

  // A rail of one card looks broken rather than curated. Below two, show nothing at all — the
  // landing page reads fine without this section and badly with a lonely card in it.
  if (popular.length < 2) return null;

  return (
    <section className="relative py-16">
      <div className="mx-auto w-full max-w-lg px-5">
        <ScrollReveal>
          <SectionHeading
            eyebrow="Popular tonight"
            title="What everyone's ordering"
            subtitle="Ranked by what's actually leaving the kitchen."
            trailing={
              <Link
                href="/menu"
                className="flex items-center gap-1 text-xs font-semibold text-[var(--color-purple-300)]"
              >
                {/* Counted, not hardcoded. The owner can add and remove items now, and a fixed
                    "All 195" would be wrong the first time they did either. */}
                All {items.length}
                <ArrowRightIcon size={13} />
              </Link>
            }
          />
        </ScrollReveal>
      </div>

      <div className="no-scrollbar mt-6 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-3">
        {/* Spacer keeps the first card aligned with the max-w-lg content column on wide screens. */}
        <div aria-hidden className="w-0 shrink-0 sm:w-[max(0px,calc((100vw-32rem)/2-1.25rem))]" />

        {popular.map((item, i) => (
          <ScrollStagger key={item.id} index={i} className="shrink-0 snap-start">
            <PopularCard item={item} />
          </ScrollStagger>
        ))}

        <div aria-hidden className="w-2 shrink-0" />
      </div>
    </section>
  );
}

function PopularCard({ item }: { item: MenuItem }) {
  const soldOut = useIsSoldOut(item.id);

  return (
    <Link
      href="/menu"
      className="group block w-[10.5rem] overflow-hidden rounded-[20px] p-3 transition-transform duration-300 hover:-translate-y-1"
      style={{
        background: item.isDeal
          ? 'linear-gradient(180deg, rgb(234 179 8 / 0.14), rgb(255 107 26 / 0.06))'
          : 'linear-gradient(180deg, rgb(255 255 255 / 0.055), rgb(255 255 255 / 0.018))',
        border: `1px solid ${item.isDeal ? 'rgb(234 179 8 / 0.35)' : 'rgb(255 255 255 / 0.08)'}`,
        boxShadow: '0 8px 26px -16px rgb(0 0 0 / 0.9)',
        // Sold out is dimmed rather than removed: the owner pinned this, and silently dropping a
        // card would make the rail look shorter than it was chosen to be.
        opacity: soldOut ? 0.45 : 1,
      }}
    >
      <div className="relative">
        <GeneratedImage
          slug={assetForItem(item.name, item.categoryId)}
          rounded="14px"
          className="aspect-square w-full transition-transform duration-500 group-hover:scale-[1.06]"
        />
        {item.isDeal && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]"
            style={{ background: '#EAB308', color: '#0B0B0F' }}
          >
            Deal
          </span>
        )}
        {soldOut && (
          <span
            className="absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold"
            style={{ background: 'rgb(11 11 15 / 0.85)', color: 'var(--color-danger)' }}
          >
            Sold out
          </span>
        )}
      </div>

      <div className="mt-3 flex items-start gap-1.5">
        <span className="mt-[3px] shrink-0">
          <DietMark isVeg={item.isVeg} size={11} />
        </span>
        <h3 className="min-w-0 flex-1 truncate font-display text-[13px] font-bold leading-tight">
          {item.name}
        </h3>
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        {item.variants.length > 1 && (
          <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
            from
          </span>
        )}
        <span className="tabular font-display text-sm font-bold">
          {Money.format(priceFrom(item))}
        </span>
      </div>
    </Link>
  );
}
