'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { kitchen, kitchenSession } from '@/lib/kitchen-api';

/**
 * Owner sign-in.
 *
 * ⚠️  Development credentials — see `apps/api/src/modules/kitchen-auth`. The same login endpoint
 * serves both staff roles; the server decides which one these credentials are and puts it in the
 * signed token. This page never decides anything about permissions.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token, session } = await kitchen.login(username.trim(), password);
      kitchenSession.set(token);
      // Sending a cook to the owner dashboard would only show them a "restricted" wall. Land them
      // where their account actually works.
      router.replace(session.role === 'ADMIN' ? '/admin' : '/kitchen');
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not reach the server. Check the connection and try again.',
      );
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-5" style={{ background: 'var(--color-canvas)' }}>
      <div className="w-full max-w-[26rem]">
        <div className="text-center">
          <p className="font-display text-[13px] font-bold tracking-[0.24em]">JUICE STOP</p>
          <div
            className="mx-auto mt-2 h-[2px] w-10 rounded-full"
            style={{ background: 'linear-gradient(90deg, #A855F7, #FF6B1A)' }}
          />
          <h1 className="mt-6 font-display text-3xl font-bold tracking-[-0.02em]">Owner</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Revenue, reports and operations.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="glass-strong mt-8 rounded-[22px] p-6"
          style={{ border: '1px solid var(--color-border-subtle)' }}
        >
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus />
          <div className="mt-4">
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
            />
          </div>

          {error !== null && (
            <p
              role="alert"
              className="mt-4 rounded-[12px] px-3.5 py-3 text-sm"
              style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || username.length === 0 || password.length === 0}
            className="mt-6 flex h-[3.5rem] w-full items-center justify-center rounded-[14px] font-display text-[15px] font-bold text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #A855F7 0%, #FF3D81 55%, #FF6B1A 100%)' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p
          className="mt-5 rounded-[12px] px-4 py-3 text-center text-xs leading-relaxed"
          style={{ background: 'rgb(245 158 11 / 0.10)', color: 'var(--color-warning)' }}
        >
          Development build — owner is <strong>owner</strong> / <strong>owner123</strong>.
          <br />
          Kitchen staff sign in at <strong>/kitchen/login</strong>.
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="mt-2 h-[3.25rem] w-full rounded-[12px] px-3.5 text-[15px] outline-none"
        style={{
          background: 'var(--color-inset)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        }}
      />
    </label>
  );
}
