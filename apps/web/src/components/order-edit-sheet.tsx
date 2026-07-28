'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Money, MIN_ORDER_PAISE } from '@juice-stop/core';
import { ITEMS, hasChoices, priceFrom, type MenuItem } from '@/data/menu';
import { priceCart, type CartLine } from '@/store/cart';
import { editWindow, useOrders, type PlacedOrder } from '@/store/orders';
import { estimateEtaSeconds, snapshotLines, snapshotTotals } from '@/lib/order-builder';
import { AnimatedPaise } from './animated-value';
import { BillSummary } from './bill-summary';
import { QuantityStepper } from './quantity-stepper';
import { CheckIcon, ClockIcon, DietMark, PlusIcon, SearchIcon, TrashIcon } from './icons';
import { Button } from './ui';
import { SPRING } from './motion-provider';

/**
 * Edit a placed order, inside the grace window.
 *
 * The draft is a local copy of the order's `sourceLines`, priced through the **same** `priceCart`
 * used by the cart itself. Nothing here re-implements pricing — an edited order and a fresh order
 * are costed by identical code, which is the only way a bill and a receipt stay in agreement.
 *
 * Prices come from the *current* menu on save, so an edit is honestly re-quoted rather than
 * inheriting a stale unit price for newly added items.
 */
export function OrderEditSheet({
  order,
  open,
  onClose,
}: {
  order: PlacedOrder;
  open: boolean;
  onClose: () => void;
}) {
  const applyEdit = useOrders((s) => s.applyEdit);
  const [draft, setDraft] = useState<CartLine[]>(order.sourceLines);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(order.sourceLines);
    setAdding(false);
    setQuery('');
    setError(null);
  }, [open, order.sourceLines]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    document.body.style.overflow = 'hidden';
    return () => {
      clearInterval(t);
      document.body.style.overflow = '';
    };
  }, [open]);

  const totals = useMemo(() => priceCart(draft), [draft]);
  const window = editWindow(order, now);

  // Only single-configuration items can be added from here. Anything with sizes or add-ons needs
  // the full sheet, and silently picking a size for someone is how a customer ends up with a
  // small pizza they did not order.
  const addable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter(
      (i) => i.inStock && !hasChoices(i) && (q.length === 0 || i.name.toLowerCase().includes(q)),
    ).slice(0, 40);
  }, [query]);

  if (!open) return null;

  const setQuantity = (lineId: string, quantity: number) =>
    setDraft((lines) =>
      quantity <= 0
        ? lines.filter((l) => l.lineId !== lineId)
        : lines.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(30, quantity) } : l)),
    );

  const addItem = (item: MenuItem) =>
    setDraft((lines) => {
      const existing = lines.find((l) => l.itemId === item.id && l.addOnIds.length === 0);
      if (existing !== undefined) {
        return lines.map((l) =>
          l.lineId === existing.lineId ? { ...l, quantity: Math.min(30, l.quantity + 1) } : l,
        );
      }
      return [
        ...lines,
        {
          lineId: `ln_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
          itemId: item.id,
          variantId: item.variants[0]!.id,
          addOnIds: [],
          quantity: 1,
          note: '',
        },
      ];
    });

  const save = () => {
    if (totals.itemCount === 0) {
      setError('An order needs at least one item. Remove it from the orders list instead.');
      return;
    }
    if (!totals.meetsMinimum) {
      setError(`Add ${Money.format(totals.shortfallPaise)} more to stay above the minimum.`);
      return;
    }

    // The ETA is re-quoted from the edited cart — adding a pizza to a Maggi order genuinely
    // changes when it can arrive, and pretending otherwise is how a promise gets broken.
    const etaSeconds = estimateEtaSeconds(totals.prepSeconds, 0.4);

    const ok = applyEdit(order.id, {
      sourceLines: draft,
      lines: snapshotLines(totals),
      ...snapshotTotals(totals),
      prepSeconds: totals.prepSeconds,
      promisedAt: order.editableUntil + etaSeconds * 1000,
    });

    if (!ok) {
      setError('The edit window just closed — your order is already with the kitchen.');
      return;
    }
    onClose();
  };

  const minutes = Math.floor(window.secondsRemaining / 60);
  const seconds = window.secondsRemaining % 60;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <m.button
        type="button"
        aria-label="Close"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Edit order"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={SPRING.smooth}
        className="glass-strong relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px]"
      >
        <div className="shrink-0 px-5 pt-3">
          <div
            aria-hidden
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: 'var(--color-border-strong)' }}
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-[-0.01em]">Edit order</h2>
            <span
              className="tabular flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
              style={{
                background: window.secondsRemaining < 60
                  ? 'rgb(239 68 68 / 0.16)'
                  : 'rgb(255 107 26 / 0.16)',
                color: window.secondsRemaining < 60
                  ? 'var(--color-danger)'
                  : 'var(--color-orange-500)',
              }}
            >
              <ClockIcon size={13} />
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
          </div>

          {/* Time bar drains rather than fills — a shrinking bar reads as "running out". */}
          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--color-inset)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-linear"
              style={{
                width: `${Math.max(0, (1 - window.elapsed) * 100)}%`,
                background: window.secondsRemaining < 60
                  ? 'var(--color-danger)'
                  : 'var(--gradient-brand)',
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {totals.lines.map((p) => (
                <m.li
                  key={p.line.lineId}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                  transition={SPRING.smooth}
                  className="flex items-center gap-3 rounded-[14px] p-3"
                  style={{
                    background: 'var(--color-inset)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <span className="mt-0.5 shrink-0">
                    <DietMark isVeg={p.item.isVeg} size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.item.name}
                      {p.item.variants.length > 1 && (
                        <span className="ml-1 text-xs font-medium text-[var(--color-text-secondary)]">
                          {p.variant.name}
                        </span>
                      )}
                    </p>
                    {p.addOnNames.length > 0 && (
                      <p className="text-[11px] text-[var(--color-purple-300)]">
                        + {p.addOnNames.join(', ')}
                      </p>
                    )}
                    <AnimatedPaise
                      value={p.totalPaise}
                      className="text-xs text-[var(--color-text-secondary)]"
                    />
                  </div>

                  <QuantityStepper
                    quantity={p.line.quantity}
                    onIncrement={() => setQuantity(p.line.lineId, p.line.quantity + 1)}
                    onDecrement={() => setQuantity(p.line.lineId, p.line.quantity - 1)}
                    size="sm"
                  />

                  <button
                    type="button"
                    onClick={() => setQuantity(p.line.lineId, 0)}
                    aria-label={`Remove ${p.item.name}`}
                    className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>

          {/* Add more */}
          <div className="mt-4">
            {!adding ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="pressable flex w-full items-center justify-center gap-2 rounded-[13px] border border-dashed py-3 text-sm font-semibold"
                style={{
                  borderColor: 'rgb(255 107 26 / 0.4)',
                  color: 'var(--color-orange-500)',
                  background: 'rgb(255 107 26 / 0.05)',
                }}
              >
                <PlusIcon size={16} strokeWidth={2.6} />
                Add more items
              </button>
            ) : (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={SPRING.smooth}
                className="overflow-hidden"
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
                    <SearchIcon size={16} />
                  </span>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search items to add…"
                    aria-label="Search items to add"
                    className="h-11 w-full rounded-[12px] border bg-[var(--color-inset)] pl-10 pr-4 text-base focus:outline-none"
                  />
                </div>

                <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto">
                  {addable.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => addItem(item)}
                        className="pressable flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-left"
                        style={{ background: 'var(--color-raised)' }}
                      >
                        <DietMark isVeg={item.isVeg} size={11} />
                        <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                        <span className="tabular shrink-0 text-sm font-semibold">
                          {Money.format(priceFrom(item))}
                        </span>
                        <span style={{ color: 'var(--color-orange-500)' }}>
                          <PlusIcon size={15} strokeWidth={2.6} />
                        </span>
                      </button>
                    </li>
                  ))}
                  {addable.length === 0 && (
                    <li className="py-4 text-center text-xs text-[var(--color-text-tertiary)]">
                      Nothing matches. Items with sizes or add-ons must be added from the menu.
                    </li>
                  )}
                </ul>
              </m.div>
            )}
          </div>

          <div
            className="mt-5 rounded-[14px] p-4"
            style={{ background: 'var(--color-inset)' }}
          >
            <BillSummary
              subtotalPaise={totals.subtotalPaise}
              deliveryFeePaise={totals.deliveryFeePaise}
              handlingFeePaise={totals.handlingFeePaise}
              taxPaise={totals.taxPaise}
              totalPaise={totals.totalPaise}
            />
          </div>

          {!totals.meetsMinimum && totals.itemCount > 0 && (
            <p
              className="mt-3 rounded-[11px] px-3.5 py-2.5 text-xs"
              style={{ background: 'rgb(245 158 11 / 0.12)', color: 'var(--color-warning)' }}
            >
              {Money.format(totals.shortfallPaise)} below the {Money.format(MIN_ORDER_PAISE)}{' '}
              minimum.
            </p>
          )}

          <AnimatePresence>
            {error !== null && (
              <m.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 rounded-[11px] px-3.5 py-2.5 text-xs"
                style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
              >
                {error}
              </m.p>
            )}
          </AnimatePresence>
        </div>

        <div
          className="shrink-0 border-t px-5 pt-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-[1.6]"
              onClick={save}
              disabled={!window.open || totals.itemCount === 0}
            >
              <CheckIcon size={17} strokeWidth={2.5} />
              Save · <AnimatedPaise value={totals.totalPaise} />
            </Button>
          </div>
        </div>
      </m.div>
    </div>
  );
}
