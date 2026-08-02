'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { kitchen, kitchenSession } from '@/lib/kitchen-api';
import { ApiError } from '@/lib/api';

/**
 * Kitchen sign-in.
 *
 * ⚠️  Development credentials — see `apps/api/src/modules/kitchen-auth`. This page knows a
 * username and a password field and nothing else; it does not know what a valid credential looks
 * like, which is why swapping in real identity does not touch it.
 */
export default function KitchenLoginPage() {
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
      const { token } = await kitchen.login(username.trim(), password);
      kitchenSession.set(token);
      // replace, not push — the back button must not land a signed-in cook on the login form.
      router.replace('/kitchen');
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
    <main
      className="grid min-h-dvh place-items-center px-5"
      style={{ background: 'var(--color-canvas)' }}
    >
      <div className="w-full max-w-[26rem]">
        <div className="text-center">
          <p className="font-display text-[13px] font-bold tracking-[0.24em]">JUICE STOP</p>
          <div
            className="mx-auto mt-2 h-[2px] w-10 rounded-full"
            style={{ background: 'var(--gradient-brand)' }}
          />
          <h1 className="mt-6 font-display text-3xl font-bold tracking-[-0.02em]">Kitchen</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Sign in to start tonight&rsquo;s service.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="glass-strong mt-8 rounded-[22px] p-6"
          style={{ border: '1px solid var(--color-border-subtle)' }}
        >
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            autoFocus
          />
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
            style={{ background: 'var(--gradient-brand)' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Shown because these credentials are already public in the brief and this build is not
            production. The banner is also the reminder that they must not survive to one. */}
        <p
          className="mt-5 rounded-[12px] px-4 py-3 text-center text-xs leading-relaxed"
          style={{ background: 'rgb(245 158 11 / 0.10)', color: 'var(--color-warning)' }}
        >
          Development build — sign in with <strong>cook</strong> / <strong>cook123</strong>.
          <br />
          This login is replaced by the production identity system.
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
        className="mt-2 h-[3.25rem] w-full rounded-[12px] px-3.5 text-[15px] outline-none transition-colors duration-150 focus:border-[var(--color-orange-500)]"
        style={{
          background: 'var(--color-inset)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        }}
      />
    </label>
  );
}
