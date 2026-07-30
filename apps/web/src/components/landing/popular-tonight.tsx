'use client';

import Link from 'next/link';
import { Money } from '@juice-stop/core';
import { ITEMS, priceFrom } from '@/data/menu';
import { assetForItem } from '@/data/assets';
import { GeneratedImage, ScrollReveal, ScrollStagger, SectionHeading } from '@/components/system';
import { ArrowRightIcon, DietMark } from '@/components/icons';

/**
 * Popular tonight.
 *
 * Derived from the catalogue's own tags rather than a second hand-maintained list — a hardcoded
 * "popular" array is a list that silently goes stale the first time the menu changes.
 */
const POPULAR = ITEMS.filter(
  (i) => i.inStock && (i.tags.includes('BESTSELLER') || i.tags.includes('TRENDING')),
).slice(0, 8);

export function PopularTonight() {
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
                All 195
                <ArrowRightIcon size={13} />
              </Link>
            }
          />
        </ScrollReveal>
      </div>

      <div className="no-scrollbar mt-6 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-3">
        {/* Spacer keeps the first card aligned with the max-w-lg content column on wide screens. */}
        <div aria-hidden className="w-0 shrink-0 sm:w-[max(0px,calc((100vw-32rem)/2-1.25rem))]" />

        {POPULAR.map((item, i) => (
          <ScrollStagger key={item.id} index={i} className="shrink-0 snap-start">
            <Link
              href="/menu"
              className="group block w-[10.5rem] overflow-hidden rounded-[20px] p-3 transition-transform duration-300 hover:-translate-y-1"
              style={{
                background: 'linear-gradient(180deg, rgb(255 255 255 / 0.055), rgb(255 255 255 / 0.018))',
                border: '1px solid rgb(255 255 255 / 0.08)',
                boxShadow: '0 8px 26px -16px rgb(0 0 0 / 0.9)',
              }}
            >
              <GeneratedImage
                slug={assetForItem(item.name, item.categoryId)}
                rounded="14px"
                className="aspect-square w-full transition-transform duration-500 group-hover:scale-[1.06]"
              />

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
          </ScrollStagger>
        ))}

        <div aria-hidden className="w-2 shrink-0" />
      </div>
    </section>
  );
}
