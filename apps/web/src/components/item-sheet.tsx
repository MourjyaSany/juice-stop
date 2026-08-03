'use client';

import { useEffect, useMemo, useState } from 'react';
import { Money } from '@juice-stop/core';
import { addOnPrice, type MenuItem } from '@/data/menu';
import { useCart } from '@/store/cart';
import { CheckIcon, DietMark, MinusIcon, PlusIcon } from './icons';
import { tapFeedback } from '@/lib/haptics';
import { Button } from './ui';
import { useRegisterOverlay } from '@/store/overlay';

/**
 * Item detail sheet — size and add-on selection.
 *
 * The running total updates on every change and sits on the button itself, so the customer always
 * commits to a number they can see. A price that only appears in the cart is how surprise
 * charges happen.
 */
export function ItemSheet({
  item,
  open,
  onClose,
  onAdded,
}: {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  /** Optional — the floating cart already confirms the add, so most callers don't need this. */
  onAdded?: ((name: string) => void) | undefined;
}) {
  const add = useCart((s) => s.add);
  // Hides the bottom nav while the panel is up — it used to cover the size and add-on controls.
  useRegisterOverlay(open && item !== null);
  const [variantId, setVariantId] = useState('');
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || item === null) return;
    setVariantId(item.variants[0]!.id);
    setAddOnIds([]);
    setQuantity(1);
    setNote('');
  }, [open, item]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const variant = useMemo(
    () => item?.variants.find((v) => v.id === variantId) ?? item?.variants[0],
    [item, variantId],
  );

  const totalPaise = useMemo(() => {
    if (item === undefined || item === null || variant === undefined) return Money.ZERO;
    const extras = item.addOns
      .filter((a) => addOnIds.includes(a.id))
      .map((a) => addOnPrice(a, variant.id));
    return Money.multiply(Money.add(variant.pricePaise, Money.sum(extras)), quantity);
  }, [item, variant, addOnIds, quantity]);

  if (!open || item === null || variant === undefined) return null;

  const submit = () => {
    add({ itemId: item.id, variantId: variant.id, addOnIds, quantity, note: note.trim() });
    onAdded?.(item.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="glass-strong relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px]"
        style={{ animation: 'rise 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <div className="shrink-0 px-5 pt-3">
          <div
            aria-hidden
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: 'var(--color-border-strong)' }}
          />
          <div className="mt-4 flex items-start gap-2.5">
            <span className="mt-1">
              <DietMark isVeg={item.isVeg} size={15} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold leading-tight">{item.name}</h2>
              {item.description !== undefined && (
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {item.description}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                ~{Math.round(item.prepTimeSeconds / 60)} min to cook
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {item.variants.length > 1 && (
            <fieldset>
              <legend className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                Choose size <span style={{ color: 'var(--color-orange-500)' }}>*</span>
              </legend>
              <div className="space-y-2">
                {item.variants.map((v) => {
                  const active = v.id === variant.id;
                  return (
                    <label
                      key={v.id}
                      className="pressable flex cursor-pointer items-center justify-between rounded-[12px] border px-4 py-3"
                      style={{
                        borderColor: active ? 'var(--color-orange-500)' : 'var(--color-border-subtle)',
                        background: active ? 'rgb(255 107 26 / 0.08)' : 'var(--color-inset)',
                      }}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="variant"
                          className="sr-only"
                          checked={active}
                          onChange={() => setVariantId(v.id)}
                        />
                        <span
                          aria-hidden
                          className="flex h-4 w-4 items-center justify-center rounded-full border-2"
                          style={{
                            borderColor: active
                              ? 'var(--color-orange-500)'
                              : 'var(--color-border-strong)',
                          }}
                        >
                          {active && (
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: 'var(--color-orange-500)' }}
                            />
                          )}
                        </span>
                        <span className="text-sm font-medium">{v.name}</span>
                      </span>
                      <span className="tabular text-sm font-semibold">
                        {Money.format(v.pricePaise)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {item.addOns.length > 0 && (
            <fieldset className={item.variants.length > 1 ? 'mt-6' : ''}>
              <legend className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                Add-ons
              </legend>
              <div className="space-y-2">
                {item.addOns.map((a) => {
                  const active = addOnIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="pressable flex cursor-pointer items-center justify-between rounded-[12px] border px-4 py-3"
                      style={{
                        borderColor: active ? 'var(--color-purple-500)' : 'var(--color-border-subtle)',
                        background: active ? 'rgb(168 85 247 / 0.10)' : 'var(--color-inset)',
                      }}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={active}
                          onChange={() =>
                            setAddOnIds((ids) =>
                              active ? ids.filter((x) => x !== a.id) : [...ids, a.id],
                            )
                          }
                        />
                        <span
                          aria-hidden
                          className="flex h-4 w-4 items-center justify-center rounded-[4px] border-2"
                          style={{
                            borderColor: active
                              ? 'var(--color-purple-500)'
                              : 'var(--color-border-strong)',
                            background: active ? 'var(--color-purple-500)' : 'transparent',
                          }}
                        >
                          {active && <CheckIcon size={11} strokeWidth={3.5} className="text-white" />}
                        </span>
                        <span className="text-sm font-medium">{a.name}</span>
                      </span>
                      <span className="tabular text-sm font-semibold">
                        +{Money.format(addOnPrice(a, variant.id))}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-6">
            <label
              htmlFor="itemNote"
              className="mb-2 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]"
            >
              Note for the chef
            </label>
            <input
              id="itemNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="No onions, extra spicy…"
              className="h-12 w-full rounded-[12px] border bg-[var(--color-inset)] px-4 text-base placeholder:text-[var(--color-text-tertiary)] focus:outline-none"
            />
          </div>
        </div>

        <div
          className="shrink-0 border-t px-5 pt-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 shrink-0 items-center gap-1 rounded-[12px] px-1"
              style={{ background: 'var(--color-inset)', border: '1px solid var(--color-border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => {
                  tapFeedback('remove');
                  setQuantity((q) => Math.max(1, q - 1));
                }}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                className="pressable flex h-10 w-10 items-center justify-center rounded-[10px] disabled:opacity-30"
              >
                <MinusIcon size={16} strokeWidth={2.4} />
              </button>
              <span className="tabular w-6 text-center text-sm font-semibold">{quantity}</span>
              <button
                type="button"
                onClick={() => {
                  tapFeedback('add');
                  setQuantity((q) => Math.min(30, q + 1));
                }}
                aria-label="Increase quantity"
                className="pressable flex h-10 w-10 items-center justify-center rounded-[10px]"
              >
                <PlusIcon size={16} strokeWidth={2.4} />
              </button>
            </div>

            <Button size="lg" className="flex-1" onClick={submit}>
              Add · <span className="tabular">{Money.format(totalPaise)}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
