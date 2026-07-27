'use client';

import { m } from 'motion/react';
import { Money, isWaived, type Paise } from '@juice-stop/core';
import { AnimatedPaise } from './animated-value';
import { SPRING } from './motion-provider';

/**
 * The bill.
 *
 * One component for cart, checkout and the order receipt so the three can never disagree about
 * what is being charged — a bill that reads differently on the checkout screen than on the
 * receipt is the fastest way to lose trust.
 *
 * Waived charges render as **FREE**, not "₹0.00". A zero rupee amount reads as an oversight;
 * the word FREE reads as a promise, and customers scan a bill specifically for hidden costs.
 */
export function BillSummary({
  subtotalPaise,
  deliveryFeePaise,
  handlingFeePaise,
  taxPaise,
  totalPaise,
  animate = true,
}: {
  subtotalPaise: Paise;
  deliveryFeePaise: Paise;
  handlingFeePaise: Paise;
  taxPaise: Paise;
  totalPaise: Paise;
  /** Off for a settled receipt — a historical total has no reason to count up. */
  animate?: boolean;
}) {
  return (
    <dl className="space-y-2.5 text-sm">
      <Line label="Subtotal" value={subtotalPaise} animate={animate} />
      <Line label="Delivery" value={deliveryFeePaise} animate={animate} />
      <Line label="GST" value={taxPaise} animate={animate} />
      <Line label="Handling charges" value={handlingFeePaise} animate={animate} />

      <div
        className="!mt-4 flex items-baseline justify-between border-t pt-3.5"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <dt className="font-display text-[0.9375rem] font-bold">Grand total</dt>
        <dd>
          <m.span
            key={totalPaise.toString()}
            initial={animate ? { scale: 1 } : false}
            animate={animate ? { scale: [1, 1.06, 1] } : {}}
            transition={SPRING.bouncy}
            className="text-gradient inline-block font-display text-[1.4rem] font-bold"
          >
            {animate ? (
              <AnimatedPaise value={totalPaise} />
            ) : (
              <span className="tabular">{Money.format(totalPaise)}</span>
            )}
          </m.span>
        </dd>
      </div>
    </dl>
  );
}

function Line({
  label,
  value,
  animate,
}: {
  label: string;
  value: Paise;
  animate: boolean;
}) {
  const waived = isWaived(value);

  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd>
        {waived ? (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold tracking-[0.03em]"
            style={{ background: 'rgb(34 197 94 / 0.15)', color: 'var(--color-success)' }}
          >
            FREE
          </span>
        ) : animate ? (
          <AnimatedPaise value={value} />
        ) : (
          <span className="tabular">{Money.format(value)}</span>
        )}
      </dd>
    </div>
  );
}
