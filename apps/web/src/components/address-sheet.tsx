'use client';

import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { BLOCKS, COMPLEX_NAME, blockLabel } from '@/data/blocks';
import { isValidIndianPhone, useProfile, type SavedAddress } from '@/store/profile';
import { CheckIcon, ChevronRightIcon, MapPinIcon } from './icons';
import { Button, Field, Input } from './ui';
import { SPRING } from './motion-provider';

interface Draft {
  label: string;
  block: string;
  flatOrRoom: string;
  floor: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
}

const EMPTY: Draft = {
  label: 'Home',
  block: '',
  flatOrRoom: '',
  floor: '',
  landmark: '',
  contactName: '',
  contactPhone: '',
};

const LABEL_PRESETS = ['Home', 'Friend', 'Other'] as const;

/**
 * Add / edit a delivery address.
 *
 * We deliver **only inside Abode Valley Complex**, so the location is not a question — it is
 * stated as a fact at the top of the form. The only variable part is the block, and that is a
 * constrained dropdown rather than free text: an address outside the complex, or in a block that
 * doesn't exist, is not a slow delivery — it is a delivery that cannot happen. The form makes
 * those states unrepresentable rather than merely discouraged.
 */
export function AddressSheet({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: SavedAddress | null;
  onClose: () => void;
}) {
  const profile = useProfile();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setDraft(
      editing !== null
        ? {
            label: editing.label,
            block: editing.block,
            flatOrRoom: editing.flatOrRoom,
            floor: editing.floor,
            landmark: editing.landmark,
            contactName: editing.contactName,
            contactPhone: editing.contactPhone,
          }
        : { ...EMPTY, contactName: profile.fullName, contactPhone: profile.phone },
    );
  }, [open, editing, profile.fullName, profile.phone]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const errors = {
    block: draft.block.length === 0 ? 'Select your block' : '',
    flatOrRoom: draft.flatOrRoom.trim().length === 0 ? 'Flat number is required' : '',
    contactName: draft.contactName.trim().length < 2 ? 'Who should the rider ask for?' : '',
    contactPhone: !isValidIndianPhone(draft.contactPhone)
      ? 'Enter a 10-digit Indian mobile number'
      : '',
  };
  const valid = Object.values(errors).every((e) => e.length === 0);
  const show = (key: keyof typeof errors) => (touched ? errors[key] : '');

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    if (editing !== null) profile.updateAddress(editing.id, draft);
    else profile.addAddress(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <m.button
        type="button"
        aria-label="Close"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />

      <m.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={editing !== null ? 'Edit address' : 'Add address'}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={SPRING.smooth}
        className="glass-strong relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pb-8 pt-3 focus:outline-none"
      >
        <div
          aria-hidden
          className="mx-auto h-1 w-10 rounded-full"
          style={{ background: 'var(--color-border-strong)' }}
        />

        <h2 className="mt-4 font-display text-xl font-bold tracking-[-0.01em]">
          {editing !== null ? 'Edit address' : 'New address'}
        </h2>

        {/* Delivery area, stated rather than asked. */}
        <div
          className="mt-4 flex items-center gap-3 rounded-[14px] px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, rgb(255 107 26 / 0.10), rgb(168 85 247 / 0.07))',
            border: '1px solid rgb(255 107 26 / 0.22)',
          }}
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--gradient-brand)', color: '#fff' }}
          >
            <MapPinIcon size={17} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold">{COMPLEX_NAME}</p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              The only area we deliver to
            </p>
          </div>
          <span className="ml-auto shrink-0" style={{ color: 'var(--color-success)' }}>
            <CheckIcon size={18} strokeWidth={2.6} />
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {/* Label as chips — three taps saved versus typing "Home" every time. */}
          <div>
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
              Label
            </p>
            <div className="flex gap-2">
              {LABEL_PRESETS.map((preset) => {
                const active = draft.label === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDraft({ ...draft, label: preset })}
                    aria-pressed={active}
                    className="pressable flex-1 rounded-[11px] py-2.5 text-sm font-semibold transition-colors duration-200"
                    style={
                      active
                        ? { background: 'var(--gradient-brand)', color: '#fff' }
                        : {
                            background: 'var(--color-inset)',
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border-subtle)',
                          }
                    }
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Block" htmlFor="block" required error={show('block')}>
            <div className="relative">
              <select
                id="block"
                value={draft.block}
                onChange={(e) => setDraft({ ...draft, block: e.target.value })}
                className="h-12 w-full appearance-none rounded-[12px] border bg-[var(--color-inset)] px-4 pr-11 text-base text-[var(--color-text-primary)] focus:outline-none"
                style={{ borderColor: show('block').length > 0 ? 'var(--color-danger)' : undefined }}
              >
                <option value="">Select your block…</option>
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {blockLabel(b)}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-[var(--color-text-tertiary)]"
              >
                <ChevronRightIcon size={16} />
              </span>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Flat number" htmlFor="flat" required error={show('flatOrRoom')}>
              <Input
                id="flat"
                value={draft.flatOrRoom}
                onChange={(e) => setDraft({ ...draft, flatOrRoom: e.target.value })}
                placeholder="412"
                invalid={show('flatOrRoom').length > 0}
              />
            </Field>
            <Field label="Floor" htmlFor="floor">
              <Input
                id="floor"
                value={draft.floor}
                onChange={(e) => setDraft({ ...draft, floor: e.target.value })}
                placeholder="4"
              />
            </Field>
          </div>

          <Field label="Landmark" htmlFor="landmark" hint="Helps the rider find you faster">
            <Input
              id="landmark"
              value={draft.landmark}
              onChange={(e) => setDraft({ ...draft, landmark: e.target.value })}
              placeholder="Near the lift"
            />
          </Field>

          <Field label="Contact name" htmlFor="contactName" required error={show('contactName')}>
            <Input
              id="contactName"
              value={draft.contactName}
              onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
              placeholder="Rahul"
              autoComplete="name"
              invalid={show('contactName').length > 0}
            />
          </Field>

          <Field
            label="Contact phone"
            htmlFor="contactPhone"
            required
            error={show('contactPhone')}
            hint="The rider calls this on arrival"
          >
            <Input
              id="contactPhone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={draft.contactPhone}
              onChange={(e) =>
                setDraft({ ...draft, contactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              placeholder="9876543210"
              autoComplete="tel-national"
              invalid={show('contactPhone').length > 0}
            />
          </Field>
        </div>

        {/* Live preview of exactly what the rider will see. */}
        {draft.block.length > 0 && draft.flatOrRoom.trim().length > 0 && (
          <m.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING.smooth}
            className="mt-5 rounded-[12px] px-4 py-3"
            style={{ background: 'var(--color-inset)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Rider will see
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-primary)]">
              {draft.flatOrRoom}
              {draft.floor.length > 0 && `, Floor ${draft.floor}`}, {blockLabel(draft.block)}
              <br />
              <span className="text-[var(--color-text-secondary)]">
                {COMPLEX_NAME}
                {draft.landmark.length > 0 && ` · ${draft.landmark}`}
              </span>
            </p>
          </m.div>
        )}

        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-[1.6]" onClick={submit}>
            {editing !== null ? 'Save changes' : 'Save address'}
          </Button>
        </div>
      </m.div>
    </div>
  );
}
