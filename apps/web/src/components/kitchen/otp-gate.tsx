'use client';

import { useState } from 'react';

/**
 * Delivery confirmation, gated on the customer's code.
 *
 * The rider works from this same dashboard — there is no separate rider site, and building one to
 * hold a single button would mean a second deployment, a second login and a second thing to keep
 * in sync for nothing the kitchen tablet cannot already do.
 *
 * The code is **not displayed anywhere in this app**. It exists on the customer's order screen and
 * in a sha256 on the server, and the rider has to read it off the customer's phone. A code the
 * dashboard could show would confirm nothing — the entire point is that possession of it proves
 * someone was standing at the door.
 *
 * "Delivered" stays unpressable until four digits are entered, so the failure mode is a disabled
 * button rather than a rejected request the rider has to interpret in the rain.
 */
export function OtpGate({
  onSubmit,
  busy,
  label = 'Delivered',
}: {
  onSubmit: (otp: string) => void;
  busy: boolean;
  label?: string;
}) {
  const [otp, setOtp] = useState('');
  const complete = /^\d{4}$/.test(otp);

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
        Ask the customer for their 4-digit code
      </p>
      <div className="flex gap-2">
        <input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="0000"
          aria-label="Customer's delivery code"
          className="tabular h-14 w-24 shrink-0 rounded-[12px] text-center font-display text-2xl font-bold tracking-[0.2em] outline-none"
          style={{
            background: 'var(--color-inset)',
            border: `1px solid ${complete ? 'var(--color-success)' : 'var(--color-border-subtle)'}`,
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="button"
          onClick={() => onSubmit(otp)}
          disabled={!complete || busy}
          className="flex min-h-[56px] flex-1 items-center justify-center rounded-[12px] font-display text-sm font-bold transition-transform duration-100 active:scale-[0.97] disabled:opacity-35"
          style={
            complete
              ? { background: 'var(--color-success)', color: '#06210f' }
              : { background: 'var(--color-inset)', color: 'var(--color-text-tertiary)' }
          }
        >
          {label}
        </button>
      </div>
    </div>
  );
}
