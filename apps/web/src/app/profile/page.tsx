'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CheckIcon,
  ChevronRightIcon,
  EditIcon,
  MapPinIcon,
  PhoneIcon,
  SettingsIcon,
  TrashIcon,
  UserIcon,
} from '@/components/icons';
import { Button, Card, EmptyState, Field, Input, SectionLabel, Skeleton, useHydrated } from '@/components/ui';
import { AddressSheet } from '@/components/address-sheet';
import { COMPLEX_NAME, blockLabel } from '@/data/blocks';
import { checkProfileReadiness, isValidIndianPhone, useProfile, type SavedAddress } from '@/store/profile';

export default function ProfilePage() {
  const hydrated = useHydrated();
  const profile = useProfile();
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const readiness = checkProfileReadiness(profile);
  const phoneInvalid = profile.phone.length > 0 && !isValidIndianPhone(profile.phone);

  return (
    <main className="page-in relative min-h-dvh">
      <Backdrop />

      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold tracking-[-0.02em]">Profile</h1>
          <Link
            href="/profile/settings"
            aria-label="Settings"
            className="pressable flex h-11 w-11 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <SettingsIcon size={20} />
          </Link>
        </header>

        {!hydrated ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full rounded-[18px]" />
            <Skeleton className="h-40 w-full rounded-[18px]" />
          </div>
        ) : (
          <>
            {/* Readiness gate. Names the specific gaps — "add your phone number" is actionable,
                "profile incomplete" is not. */}
            <div className="mt-5">
              <ReadinessCard missing={readiness.missing} ready={readiness.ready} />
            </div>

            {/* ── Identity ────────────────────────────────────────────────────────────── */}
            <section className="mt-8">
              <SectionLabel>Your details</SectionLabel>
              <Card className="mt-3 space-y-4 p-4">
                <Field label="Full name" htmlFor="fullName" required hint="The rider will ask for this">
                  <Input
                    id="fullName"
                    value={profile.fullName}
                    onChange={(e) => profile.setIdentity({ fullName: e.target.value })}
                    placeholder="Rahul Sharma"
                    autoComplete="name"
                  />
                </Field>

                <Field
                  label="Phone"
                  htmlFor="phone"
                  required
                  error={phoneInvalid ? 'Enter a 10-digit Indian mobile number' : undefined}
                  hint="We only use this for delivery updates"
                >
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={profile.phone}
                    onChange={(e) =>
                      profile.setIdentity({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                    }
                    placeholder="9876543210"
                    autoComplete="tel-national"
                    invalid={phoneInvalid}
                    aria-describedby={phoneInvalid ? 'phone-error' : undefined}
                  />
                </Field>

                <Field label="Email" htmlFor="email" hint="Optional — for receipts">
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => profile.setIdentity({ email: e.target.value })}
                    placeholder="you@srmist.edu.in"
                    autoComplete="email"
                  />
                </Field>
              </Card>
            </section>

            {/* ── Addresses ───────────────────────────────────────────────────────────── */}
            <section className="mt-8">
              <div className="flex items-center justify-between">
                <SectionLabel>Delivery addresses</SectionLabel>
                {profile.addresses.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(null);
                      setSheetOpen(true);
                    }}
                  >
                    Add new
                  </Button>
                )}
              </div>

              {profile.addresses.length === 0 ? (
                <Card className="mt-3">
                  <EmptyState
                    icon={<MapPinIcon size={26} />}
                    title="No address yet"
                    body="We deliver around Abode Valley, SRM hostels and nearby PGs. Pick your building and we'll handle the rest."
                    action={
                      <Button
                        onClick={() => {
                          setEditing(null);
                          setSheetOpen(true);
                        }}
                      >
                        Add an address
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <ul className="mt-3 space-y-3">
                  {profile.addresses.map((address) => (
                    <li key={address.id}>
                      <AddressRow
                        address={address}
                        onEdit={() => {
                          setEditing(address);
                          setSheetOpen(true);
                        }}
                        onDelete={() => profile.removeAddress(address.id)}
                        onMakeDefault={() => profile.setDefaultAddress(address.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="mt-8 text-center text-xs leading-relaxed text-[var(--color-text-tertiary)]">
              Saved on this device for now. Sign-in and sync arrive with accounts.
            </p>
          </>
        )}
      </div>

      <AddressSheet
        open={sheetOpen}
        editing={editing}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
      />
    </main>
  );
}

function ReadinessCard({ missing, ready }: { missing: string[]; ready: boolean }) {
  if (ready) {
    return (
      <Card className="flex items-center gap-3 p-4" weight="subtle">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgb(34 197 94 / 0.15)', color: 'var(--color-success)' }}
        >
          <CheckIcon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <p className="font-display text-sm font-semibold">You&apos;re set to order</p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Name, phone and address all saved.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4" style={{ borderColor: 'rgb(255 107 26 / 0.3)' }}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgb(255 107 26 / 0.15)', color: 'var(--color-orange-500)' }}
        >
          <UserIcon size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold">Finish your profile to order</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            We still need {missing.join(', ')}.
          </p>
        </div>
      </div>
    </Card>
  );
}

function AddressRow({
  address,
  onEdit,
  onDelete,
  onMakeDefault,
}: {
  address: SavedAddress;
  onEdit: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-sm font-semibold">{address.label}</p>
            {address.isDefault && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'rgb(168 85 247 / 0.18)', color: 'var(--color-purple-300)' }}
              >
                Default
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgb(255 107 26 / 0.16)', color: 'var(--color-orange-500)' }}
            >
              {blockLabel(address.block)}
            </span>
          </div>

          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {address.flatOrRoom}
            {address.floor.length > 0 && `, Floor ${address.floor}`}
            <br />
            {COMPLEX_NAME}
            {address.landmark.length > 0 && ` · ${address.landmark}`}
          </p>

          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <PhoneIcon size={13} />
            {address.contactName} · {address.contactPhone}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${address.label}`}
            className="pressable flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <EditIcon size={17} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${address.label}`}
            className="pressable flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
          >
            <TrashIcon size={17} />
          </button>
        </div>
      </div>

      {!address.isDefault && (
        <button
          type="button"
          onClick={onMakeDefault}
          className="mt-3 flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-xs font-medium"
          style={{ background: 'var(--color-inset)', color: 'var(--color-text-secondary)' }}
        >
          Set as default
          <ChevronRightIcon size={14} />
        </button>
      )}
    </Card>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute -top-[15%] right-[-20%] h-[45vh] w-[65vw] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgb(168 85 247 / 0.16), transparent 65%)' }}
      />
      <div
        className="absolute -top-[25%] left-[-20%] h-[40vh] w-[60vw] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgb(255 107 26 / 0.13), transparent 65%)' }}
      />
    </div>
  );
}
