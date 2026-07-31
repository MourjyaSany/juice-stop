'use client';

import { m } from 'motion/react';
import type { FulfilmentType } from '@/store/orders';
import { ClockIcon, MapPinIcon } from '@/components/icons';
import { SPRING } from '@/components/motion-provider';

/**
 * Delivery ⇄ Takeaway.
 *
 * A segmented control with one shared sliding pill (`layoutId`) rather than two independently
 * styled buttons — the pill moving between options is what makes it read as one control with a
 * state, not two things that happen to look alike.
 *
 * Each option carries its own ETA, because the difference is the entire reason to choose.
 */
export function FulfilmentToggle({
  value,
  onChange,
  deliveryMinutes,
  takeawayMinutes,
}: {
  value: FulfilmentType;
  onChange: (next: FulfilmentType) => void;
  deliveryMinutes: number;
  takeawayMinutes: number;
}) {
  const options = [
    {
      id: 'DELIVERY' as const,
      label: 'Delivery',
      minutes: deliveryMinutes,
      caption: 'To your block',
      Icon: MapPinIcon,
    },
    {
      id: 'TAKEAWAY' as const,
      label: 'Takeaway',
      minutes: takeawayMinutes,
      caption: 'Collect yourself',
      Icon: ClockIcon,
    },
  ];

  return (
    <div
      className="grid grid-cols-2 gap-1.5 rounded-[18px] p-1.5"
      style={{ background: 'var(--color-inset)', border: '1px solid var(--color-border-subtle)' }}
      role="radiogroup"
      aria-label="Fulfilment method"
    >
      {options.map(({ id, label, minutes, caption, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className="pressable relative flex flex-col items-center gap-1 rounded-[14px] px-3 py-3.5 transition-colors duration-200"
            style={{ color: active ? '#fff' : 'var(--color-text-secondary)' }}
          >
            {active && (
              <m.span
                layoutId="fulfilment-pill"
                transition={SPRING.snappy}
                className="absolute inset-0 rounded-[14px]"
                style={{
                  background: 'linear-gradient(135deg, #FF6B1A 0%, #FF3D81 55%, #A855F7 100%)',
                  boxShadow: '0 8px 24px -10px rgb(255 107 26 / 0.85)',
                }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon size={15} strokeWidth={2} />
              <span className="font-display text-sm font-bold">{label}</span>
            </span>
            <span className="relative text-[11px] font-medium opacity-90">
              ~{minutes} min · {caption}
            </span>
          </button>
        );
      })}
    </div>
  );
}
