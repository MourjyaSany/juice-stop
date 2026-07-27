'use client';

import { useEffect, useRef, useState } from 'react';
import { BUILDINGS, BUILDING_TYPE_LABEL } from '@/data/buildings';
import { isValidIndianPhone, useProfile, type SavedAddress } from '@/store/profile';
import { Button, Field, Input, Select } from './ui';

interface Draft {
  label: string;
  buildingId: string;
  flatOrRoom: string;
  floor: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
}

const EMPTY: Draft = {
  label: 'Home',
  buildingId: '',
  flatOrRoom: '',
  floor: '',
  landmark: '',
  contactName: '',
  contactPhone: '',
};

/**
 * Add / edit a delivery address.
 *
 * Building is chosen from the curated catalogue rather than typed free-hand (ADR-004): free-text
 * addresses get riders lost, blow out delivery times and make zone assignment guesswork. The
 * catalogue also carries gate instructions and per-building ETA adjustments.
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

  // Seed the form when the sheet opens, and prefill contact details from the profile so a
  // returning customer is not retyping their own name and number.
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setDraft(
      editing !== null
        ? {
            label: editing.label,
            buildingId: editing.buildingId,
            flatOrRoom: editing.flatOrRoom,
            floor: editing.floor,
            landmark: editing.landmark,
            contactName: editing.contactName,
            contactPhone: editing.contactPhone,
          }
        : {
            ...EMPTY,
            contactName: profile.fullName,
            contactPhone: profile.phone,
          },
    );
  }, [open, editing, profile.fullName, profile.phone]);

  // Escape closes. Focus moves into the sheet so keyboard and screen-reader users are not
  // stranded behind it.
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
    buildingId: draft.buildingId.length === 0 ? 'Pick your building' : '',
    flatOrRoom: draft.flatOrRoom.trim().length === 0 ? 'Room or flat number is required' : '',
    contactName: draft.contactName.trim().length < 2 ? 'Who should the rider ask for?' : '',
    contactPhone: !isValidIndianPhone(draft.contactPhone)
      ? 'Enter a 10-digit Indian mobile number'
      : '',
  };
  const valid = Object.values(errors).every((e) => e.length === 0);

  const submit = () => {
    setTouched(true);
    if (!valid) return;

    if (editing !== null) {
      profile.updateAddress(editing.id, draft);
    } else {
      profile.addAddress(draft);
    }
    onClose();
  };

  const show = (key: keyof typeof errors) => (touched ? errors[key] : '');

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={editing !== null ? 'Edit address' : 'Add address'}
        tabIndex={-1}
        className="glass-strong relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pb-8 pt-3 focus:outline-none"
        style={{ animation: 'rise 0.32s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <div
          aria-hidden
          className="mx-auto h-1 w-10 rounded-full"
          style={{ background: 'var(--color-border-strong)' }}
        />

        <h2 className="mt-4 font-display text-xl font-semibold">
          {editing !== null ? 'Edit address' : 'New address'}
        </h2>

        <div className="mt-5 space-y-4">
          <Field label="Label" htmlFor="label" hint="Home, Hostel, Friend's place…">
            <Input
              id="label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Home"
              maxLength={24}
            />
          </Field>

          <Field label="Building" htmlFor="building" required error={show('buildingId')}>
            <Select
              id="building"
              value={draft.buildingId}
              onChange={(e) => setDraft({ ...draft, buildingId: e.target.value })}
            >
              <option value="">Select your building…</option>
              {BUILDINGS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {BUILDING_TYPE_LABEL[b.type]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Room / flat" htmlFor="flat" required error={show('flatOrRoom')}>
              <Input
                id="flat"
                value={draft.flatOrRoom}
                onChange={(e) => setDraft({ ...draft, flatOrRoom: e.target.value })}
                placeholder="412"
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
            />
          </Field>

          <Field
            label="Contact phone"
            htmlFor="contactPhone"
            required
            error={show('contactPhone')}
            hint="The rider calls this number on arrival"
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
            />
          </Field>
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="flex-[1.6]" onClick={submit}>
            {editing !== null ? 'Save changes' : 'Save address'}
          </Button>
        </div>
      </div>
    </div>
  );
}
