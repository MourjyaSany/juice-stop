'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Customer profile and address book.
 *
 * Persisted to localStorage for now. In M1 this becomes the server-owned profile behind
 * phone-OTP auth, and this store keeps only the hydrated copy — the shape here is deliberately
 * the shape of the API response so that swap is a fetch, not a rewrite.
 *
 * Nothing sensitive is stored: no tokens, no payment details. Access tokens live in memory only
 * and refresh tokens in httpOnly cookies (01-system-architecture.md §10).
 */

export interface SavedAddress {
  id: string;
  label: string;
  buildingId: string;
  flatOrRoom: string;
  floor: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
  isDefault: boolean;
}

export interface ProfileState {
  fullName: string;
  phone: string;
  email: string;
  addresses: SavedAddress[];

  setIdentity: (identity: { fullName?: string; phone?: string; email?: string }) => void;
  addAddress: (address: Omit<SavedAddress, 'id' | 'isDefault'> & { isDefault?: boolean }) => string;
  updateAddress: (id: string, patch: Partial<Omit<SavedAddress, 'id'>>) => void;
  removeAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
  reset: () => void;
}

const newId = () =>
  `addr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      fullName: '',
      phone: '',
      email: '',
      addresses: [],

      setIdentity: (identity) =>
        set((s) => ({
          fullName: identity.fullName ?? s.fullName,
          phone: identity.phone ?? s.phone,
          email: identity.email ?? s.email,
        })),

      addAddress: (address) => {
        const id = newId();
        set((s) => {
          // The first address saved is always the default — otherwise a customer can end up
          // with addresses but no deliverable one, and checkout silently has nowhere to go.
          const makeDefault = address.isDefault === true || s.addresses.length === 0;
          const next: SavedAddress = { ...address, id, isDefault: makeDefault };
          return {
            addresses: makeDefault
              ? [...s.addresses.map((a) => ({ ...a, isDefault: false })), next]
              : [...s.addresses, next],
          };
        });
        return id;
      },

      updateAddress: (id, patch) =>
        set((s) => ({
          addresses: s.addresses.map((a) => (a.id === id ? { ...a, ...patch, id } : a)),
        })),

      removeAddress: (id) =>
        set((s) => {
          const remaining = s.addresses.filter((a) => a.id !== id);
          // Removing the default promotes the next address rather than leaving none.
          if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
            remaining[0] = { ...remaining[0]!, isDefault: true };
          }
          return { addresses: remaining };
        }),

      setDefaultAddress: (id) =>
        set((s) => ({
          addresses: s.addresses.map((a) => ({ ...a, isDefault: a.id === id })),
        })),

      reset: () => set({ fullName: '', phone: '', email: '', addresses: [] }),
    }),
    {
      name: 'juice-stop:profile',
      version: 1,
      partialize: (s) => ({
        fullName: s.fullName,
        phone: s.phone,
        email: s.email,
        addresses: s.addresses,
      }),
    },
  ),
);

/* ── Derived checks ─────────────────────────────────────────────────────────────────────────── */

export interface ProfileReadiness {
  ready: boolean;
  missing: string[];
  defaultAddress: SavedAddress | null;
}

/** Indian mobile numbers: 10 digits starting 6–9. */
export const isValidIndianPhone = (phone: string): boolean =>
  /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));

/**
 * What still has to be filled in before an order can be placed.
 *
 * Returns the specific gaps rather than a boolean so the UI can name them. "Add your phone
 * number" is actionable; "profile incomplete" is not.
 */
export function checkProfileReadiness(state: {
  fullName: string;
  phone: string;
  addresses: SavedAddress[];
}): ProfileReadiness {
  const missing: string[] = [];

  if (state.fullName.trim().length < 2) missing.push('your name');
  if (!isValidIndianPhone(state.phone)) missing.push('a valid phone number');
  if (state.addresses.length === 0) missing.push('a delivery address');

  const defaultAddress =
    state.addresses.find((a) => a.isDefault) ?? state.addresses[0] ?? null;

  return { ready: missing.length === 0, missing, defaultAddress };
}
