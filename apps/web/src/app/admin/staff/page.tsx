'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { admin, type StaffAccount } from '@/lib/kitchen-api';
import { AdminShell } from '@/components/admin/shell';
import { StaffPanel, StaffButton } from '@/components/staff/glass';

/**
 * Staff registration.
 *
 * Until now the shop had exactly two logins, both with passwords printed in a public repository.
 * This is where the owner registers the cooks they actually employ, resets a password when someone
 * forgets one mid-shift, and removes an account the day somebody leaves — which is the point of it
 * existing at all: a shared login nobody can revoke is a login that outlives the employment.
 *
 * Passwords are shown once, on creation, and never again. There is nothing to fetch them from — the
 * server keeps only an scrypt hash — so the copy says so plainly rather than letting an owner
 * assume they can look it up later.
 */
export default function AdminStaffPage() {
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff((await admin.staff()).staff);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) return;
      setError('Could not load the staff list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (account: StaffAccount) => {
    if (
      !window.confirm(
        `Remove "${account.username}"? They will not be able to sign in again.\n\n` +
          'Any tab they already have open stays signed in until their session expires.',
      )
    ) {
      return;
    }
    setBusyId(account.id);
    try {
      await admin.removeStaff(account.id);
      await load();
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove that account.');
    } finally {
      setBusyId(null);
    }
  };

  const active = staff.filter((s) => s.isActive);
  const removed = staff.filter((s) => !s.isActive);

  return (
    <AdminShell
      header={
        <header
          className="sticky top-0 z-20 border-b px-4 py-3 lg:px-6"
          style={{
            borderColor: 'var(--color-border-subtle)',
            background: 'color-mix(in srgb, var(--color-canvas) 88%, transparent)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h1 className="font-display text-lg font-bold">Staff logins</h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Who can open the kitchen board, and who can see the money
          </p>
        </header>
      }
    >
      {error !== null && (
        <p
          role="alert"
          className="mb-4 rounded-[12px] px-4 py-3 text-sm"
          style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
        >
          {error}
        </p>
      )}

      <div className="space-y-4">
        <RegisterForm onCreated={load} />

        <StaffPanel className="p-4" accent="rgb(168 85 247 / 0.13)">
          <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
            Active logins · {active.length}
          </h2>

          {loading ? (
            <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading…</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {active.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  busy={busyId === account.id}
                  onRemove={() => void remove(account)}
                  onReset={load}
                  onError={setError}
                />
              ))}
            </ul>
          )}

          {removed.length > 0 && (
            <>
              <h3 className="mt-5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                Removed · {removed.length}
              </h3>
              {/* Kept visible rather than hidden: audit rows and payment confirmations name these
                  usernames, and an owner reading "confirmed by rahul" months later should be able
                  to see who that was. */}
              <ul className="mt-2 space-y-1.5">
                {removed.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center gap-3 rounded-[10px] px-3.5 py-2 text-sm"
                    style={{ background: 'var(--color-inset)', opacity: 0.55 }}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono">{account.username}</span>
                    <span className="shrink-0 text-[11px] text-[var(--color-text-tertiary)]">
                      {account.role === 'ADMIN' ? 'Owner' : 'Kitchen'} · removed
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </StaffPanel>
      </div>
    </AdminShell>
  );
}

/* ── Rows ───────────────────────────────────────────────────────────────────────────────────── */

function AccountRow({
  account,
  busy,
  onRemove,
  onReset,
  onError,
}: {
  account: StaffAccount;
  busy: boolean;
  onRemove: () => void;
  onReset: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 8 || saving) return;
    setSaving(true);
    try {
      await admin.resetStaffPassword(account.id, password);
      setDone(true);
      setPassword('');
      setResetting(false);
      await onReset();
      setTimeout(() => setDone(false), 4000);
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'Could not reset that password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-[12px] px-3.5 py-3" style={{ background: 'var(--color-inset)' }}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm"
          style={{
            background:
              account.role === 'ADMIN' ? 'rgb(168 85 247 / 0.18)' : 'rgb(255 107 26 / 0.16)',
          }}
        >
          {account.role === 'ADMIN' ? '👑' : '👨‍🍳'}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold">{account.username}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            {account.role === 'ADMIN' ? 'Owner · sees revenue' : 'Kitchen only · no money access'}
            {account.lastLoginAt !== null
              ? ` · last in ${new Date(account.lastLoginAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : ' · never signed in'}
          </p>
        </div>

        {done && (
          <span className="text-xs font-bold" style={{ color: 'var(--color-success)' }}>
            Password changed
          </span>
        )}

        <div className="flex shrink-0 gap-2">
          <StaffButton
            tone="neutral"
            haptic="select"
            onClick={() => setResetting((v) => !v)}
            className="h-10 px-3 text-xs"
          >
            Reset password
          </StaffButton>
          <StaffButton
            tone="danger"
            onClick={onRemove}
            disabled={busy}
            className="h-10 px-3 text-xs"
          >
            {busy ? '…' : 'Remove'}
          </StaffButton>
        </div>
      </div>

      {resetting && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password — at least 8 characters"
            autoComplete="off"
            className="h-12 min-w-[12rem] flex-1 rounded-[10px] border-0 bg-[var(--color-raised)] px-3.5 text-base"
          />
          <StaffButton
            tone="primary"
            onClick={() => void submit()}
            disabled={password.length < 8 || saving}
            className="h-12 px-4 text-sm"
          >
            {saving ? 'Saving…' : 'Set it'}
          </StaffButton>
        </div>
      )}
    </li>
  );
}

/* ── Registration ───────────────────────────────────────────────────────────────────────────── */

function RegisterForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'KITCHEN' | 'ADMIN'>('KITCHEN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const valid = username.trim().length >= 3 && password.length >= 8;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await admin.createStaff({ username: username.trim().toLowerCase(), password, role });
      // Shown once, here, because the server keeps only a hash and cannot ever tell them again.
      setCreated({ username: username.trim().toLowerCase(), password });
      setUsername('');
      setPassword('');
      await onCreated();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create that login.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StaffPanel className="p-4" accent="rgb(255 107 26 / 0.13)">
      <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
        Register a login
      </h2>

      {created !== null && (
        <div
          className="mt-3 rounded-[12px] px-4 py-3"
          style={{ background: 'rgb(34 197 94 / 0.12)', border: '1px solid rgb(34 197 94 / 0.3)' }}
        >
          <p className="text-sm font-bold" style={{ color: 'var(--color-success)' }}>
            {created.username} can sign in now
          </p>
          <p className="tabular mt-1 font-mono text-sm">
            {created.username} / {created.password}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            Write this down or send it to them now — the password is stored hashed and cannot be
            shown again. If it gets lost, reset it below.
          </p>
        </div>
      )}

      {!open ? (
        <StaffButton
          tone="primary"
          onClick={() => setOpen(true)}
          className="mt-3 h-12 w-full text-sm"
        >
          <span aria-hidden>＋</span> Add a staff login
        </StaffButton>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="rahul"
              autoCapitalize="none"
              autoComplete="off"
              className="h-12 w-full rounded-[10px] border-0 bg-[var(--color-inset)] px-3.5 text-base"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              Password
            </span>
            {/* Deliberately a text input. This is an owner typing a password *for someone else* and
                reading it back to them — masking it here causes typos, not security. */}
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="off"
              className="h-12 w-full rounded-[10px] border-0 bg-[var(--color-inset)] px-3.5 text-base"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
              What they can see
            </span>
            <div className="flex gap-2">
              {(
                [
                  { id: 'KITCHEN' as const, label: 'Kitchen only', hint: 'Orders and stock' },
                  { id: 'ADMIN' as const, label: 'Owner', hint: 'Revenue, menu, staff' },
                ]
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRole(option.id)}
                  aria-pressed={role === option.id}
                  className="flex-1 rounded-[10px] px-3 py-2.5 text-left"
                  style={{
                    background:
                      role === option.id ? 'rgb(168 85 247 / 0.16)' : 'var(--color-inset)',
                    border: `1px solid ${role === option.id ? 'rgb(168 85 247 / 0.35)' : 'transparent'}`,
                  }}
                >
                  <span className="block text-sm font-bold">{option.label}</span>
                  <span className="block text-[11px] text-[var(--color-text-tertiary)]">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error !== null && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <StaffButton
              tone="primary"
              type="submit"
              disabled={!valid || busy}
              className="h-12 flex-1 text-sm"
            >
              {busy ? 'Creating…' : 'Create login'}
            </StaffButton>
            <StaffButton
              tone="neutral"
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 px-4 text-sm"
            >
              Cancel
            </StaffButton>
          </div>
        </form>
      )}
    </StaffPanel>
  );
}
