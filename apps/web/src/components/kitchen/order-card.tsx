'use client';

import { Money, isFlowStatus, phaseUrgency, type UrgencyLevel } from '@juice-stop/core';
import type { ApiOrder } from '@/lib/api';
import { toPaise } from '@/lib/kitchen-api';
import { OtpGate } from './otp-gate';

/**
 * One ticket.
 *
 * Read from two metres away on a wall tablet, so: order number and timer are the largest things
 * on the card, quantities are set in a monospace column that scans vertically, and every action
 * is at least 56 px tall.
 *
 * Urgency is never colour alone. It is colour **and** the timer's numerals **and** a progress bar
 * — a colour-blind cook and a sun-washed screen are both ordinary conditions in a kitchen, and a
 * red card that reads as grey is worse than no signal at all.
 */

const URGENCY: Record<UrgencyLevel, { colour: string; label: string }> = {
  calm: { colour: '#22C55E', label: 'On time' },
  watch: { colour: '#EAB308', label: 'Watch' },
  pressing: { colour: '#F97316', label: 'Pushing it' },
  late: { colour: '#EF4444', label: 'Late' },
};

/**
 * Urgency, graded by the **same** function the customer's tracking screen uses.
 *
 * This previously measured against the order's `promisedAt`, while the customer measured the
 * current phase's allowance — so one order could read amber on the wall and green on the phone.
 * Staff and customer disagreeing about whether food is late is worse than either answer alone.
 *
 * Orders in a non-flow state (rejected, cancelled) have no phase to grade, so they sit calm.
 */
export function urgencyOf(order: ApiOrder, now: number): { level: UrgencyLevel; ratio: number } {
  if (!isFlowStatus(order.status)) return { level: 'calm', ratio: 0 };
  const { level, ratio } = phaseUrgency(
    order.status,
    new Date(order.placedAt).getTime(),
    new Date(order.statusChangedAt ?? order.placedAt).getTime(),
    now,
  );
  return { level, ratio };
}

export function elapsedLabel(fromIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface OrderAction {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'quiet' | 'danger';
}

/**
 * Step-back control.
 *
 * Deliberately small, unlabelled-by-default and set apart from the forward actions. Undo exists
 * for the mis-tap, so it must be reachable in one touch — but a button the same size and weight
 * as "Mark ready" sitting next to it is how the *next* mis-tap happens.
 */
export interface UndoAction {
  toLabel: string;
  onClick: () => void;
}

export function KitchenOrderCard({
  order,
  now,
  actions,
  undo,
  otpGate,
  busy = false,
  blockedReason,
}: {
  order: ApiOrder;
  now: number;
  actions: OrderAction[];
  undo?: UndoAction | null;
  /** Supplied on orders awaiting handover — completion is gated on the customer's code. */
  otpGate?: { label: string; onSubmit: (otp: string) => void } | null;
  busy?: boolean;
  blockedReason?: string | null;
}) {
  const { level, ratio } = urgencyOf(order, now);
  const urgency = URGENCY[level];
  const takeaway = order.fulfilmentType === 'TAKEAWAY';
  const address = order.address;

  return (
    <article
      className="rounded-[16px] p-4"
      style={{
        background: 'var(--color-raised)',
        border: `1px solid ${urgency.colour}44`,
        // The urgency bar is a physical edge on the card, not a tint — visible at a glance and
        // from an angle, which a background wash is not.
        boxShadow: `inset 4px 0 0 0 ${urgency.colour}`,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular font-display text-lg font-bold leading-none">
            {order.orderNumber.replace(/^JS-\d+-/, '#')}
          </p>
          <p className="mt-1.5 truncate text-sm font-semibold text-[var(--color-text-secondary)]">
            {order.customerName ?? 'Guest'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className="tabular font-display text-2xl font-bold leading-none"
            style={{ color: urgency.colour }}
          >
            {elapsedLabel(order.placedAt, now)}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: urgency.colour }}>
            {urgency.label}
          </p>
        </div>
      </header>

      {/* Progress toward the promised time. The second redundant encoding of urgency. */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgb(0 0 0 / 0.4)' }}>
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.min(100, ratio * 100)}%`, background: urgency.colour }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Tag tone={takeaway ? 'violet' : 'warm'}>{takeaway ? '🥡 Takeaway' : '🛵 Delivery'}</Tag>
        {takeaway && order.pickupToken !== null && <Tag tone="violet">{order.pickupToken}</Tag>}
        {!takeaway && address !== null && (
          <Tag tone="muted">
            Block {address['block']} · {address['flatOrRoom']}
          </Tag>
        )}
        <Tag tone={order.paymentStatus === 'PAID' ? 'success' : 'warn'}>
          {order.paymentStatus === 'PAID'
            ? `✓ Paid · ${order.paymentMethod}`
            : order.paymentMethod === 'COD'
              ? '💵 Cash on delivery'
              : order.paymentStatus}
        </Tag>
      </div>

      {/* Cash still owed, stated in the size it deserves.
          A rider who hands over a COD bag without collecting has lost the whole order value, and
          the old green "✓ Paid" tag was the same size whether money had arrived or not. This is
          the one number that must not be missed on the way out of the door. */}
      {order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID' && (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-[11px] px-3.5 py-2.5"
          style={{
            background: 'rgb(234 179 8 / 0.14)',
            boxShadow: 'inset 3px 0 0 0 var(--color-warning)',
          }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'var(--color-warning)' }}
          >
            Collect on delivery
          </span>
          <span
            className="tabular font-display text-lg font-bold"
            style={{ color: 'var(--color-warning)' }}
          >
            {Money.format(toPaise(order.totalPaise))}
          </span>
        </div>
      )}

      <ul className="mt-3.5 space-y-2">
        {order.items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex gap-2.5 text-sm">
            <span
              className="tabular shrink-0 rounded-[7px] px-1.5 py-0.5 font-display text-[13px] font-bold leading-tight"
              style={{ background: 'rgb(255 107 26 / 0.16)', color: 'var(--color-orange-500)' }}
            >
              {item.quantity}×
            </span>
            <span className="min-w-0">
              <span className="font-semibold">{item.name}</span>
              {item.variantName !== '' && (
                <span className="text-[var(--color-text-secondary)]"> ({item.variantName})</span>
              )}
              {/* Customisations get their own line and their own colour. Buried in the item name
                  they are exactly what gets missed, and a missed add-on is a remake. */}
              {item.addOnNames.length > 0 && (
                <span className="block text-[13px] font-semibold text-[var(--color-purple-300)]">
                  + {item.addOnNames.join(', ')}
                </span>
              )}
              {item.note !== '' && (
                <span className="block text-[13px] italic text-[var(--color-warning)]">
                  “{item.note}”
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {order.customerNote !== null && order.customerNote.length > 0 && (
        <p
          className="mt-3 rounded-[10px] px-3 py-2 text-[13px] leading-snug"
          style={{ background: 'rgb(245 158 11 / 0.12)', color: 'var(--color-warning)' }}
        >
          <strong>Note:</strong> {order.customerNote}
        </p>
      )}

      <div
        className="mt-3.5 flex items-baseline justify-between border-t pt-3"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {new Date(order.placedAt).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })}
        </span>
        <span className="tabular font-display text-base font-bold">
          {Money.format(toPaise(order.totalPaise))}
        </span>
      </div>

      {blockedReason !== null && blockedReason !== undefined && (
        <p className="mt-3 text-center text-xs font-semibold text-[var(--color-text-tertiary)]">
          {blockedReason}
        </p>
      )}

      {otpGate !== null && otpGate !== undefined && (
        <OtpGate onSubmit={otpGate.onSubmit} busy={busy} label={otpGate.label} />
      )}

      {undo !== null && undo !== undefined && (
        <button
          type="button"
          onClick={undo.onClick}
          disabled={busy}
          title={`Move this order back to ${undo.toLabel}`}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] text-xs font-semibold transition-colors duration-150 disabled:opacity-40"
          style={{ background: 'var(--color-inset)', color: 'var(--color-text-tertiary)' }}
        >
          <span aria-hidden>↶</span> Back to {undo.toLabel}
        </button>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              disabled={busy}
              className="flex min-h-[56px] flex-1 items-center justify-center rounded-[12px] font-display text-sm font-bold transition-transform duration-100 active:scale-[0.97] disabled:opacity-40"
              style={
                action.tone === 'danger'
                  ? { background: 'rgb(239 68 68 / 0.14)', color: 'var(--color-danger)' }
                  : action.tone === 'quiet'
                    ? { background: 'var(--color-inset)', color: 'var(--color-text-secondary)' }
                    : { background: 'var(--gradient-brand)', color: '#fff' }
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'warm' | 'violet' | 'muted' | 'success' | 'warn';
}) {
  const palette = {
    warm: ['rgb(255 107 26 / 0.14)', 'var(--color-orange-500)'],
    violet: ['rgb(168 85 247 / 0.14)', 'var(--color-purple-300)'],
    muted: ['var(--color-inset)', 'var(--color-text-secondary)'],
    success: ['rgb(34 197 94 / 0.14)', 'var(--color-success)'],
    warn: ['rgb(245 158 11 / 0.14)', 'var(--color-warning)'],
  }[tone];

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: palette[0], color: palette[1] }}
    >
      {children}
    </span>
  );
}
