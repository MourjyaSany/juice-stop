'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeftIcon, MoonIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { Button, Card, SectionLabel, useHydrated } from '@/components/ui';
import { useProfile } from '@/store/profile';

type Theme = 'system' | 'dark' | 'light';

export default function SettingsPage() {
  const hydrated = useHydrated();
  const profile = useProfile();
  const [theme, setTheme] = useState<Theme>('system');
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Theme lives outside the profile store: it is device preference, not account data, and should
  // not sync across a user's devices when accounts arrive.
  useEffect(() => {
    const saved = (localStorage.getItem('juice-stop:theme') as Theme | null) ?? 'system';
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    localStorage.setItem('juice-stop:theme', next);
    applyTheme(next);
  };

  return (
    <main className="page-in relative min-h-dvh">
      <div className="pb-nav mx-auto w-full max-w-lg px-5 pt-6">
        <header className="flex items-center gap-3">
          <Link
            href="/profile"
            aria-label="Back to profile"
            className="pressable flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: 'var(--color-raised)', color: 'var(--color-text-secondary)' }}
          >
            <ChevronLeftIcon size={19} />
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em]">Settings</h1>
        </header>

        {/* ── Appearance ────────────────────────────────────────────────────────────────── */}
        <section className="mt-8">
          <SectionLabel>Appearance</SectionLabel>
          <Card className="mt-3 p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgb(168 85 247 / 0.15)', color: 'var(--color-purple-300)' }}
              >
                <MoonIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold">Theme</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Dark is the default — we mostly live at night.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {(['system', 'dark', 'light'] as const).map((option) => {
                const active = theme === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => changeTheme(option)}
                    aria-pressed={active}
                    className="pressable rounded-[10px] py-2.5 text-xs font-semibold capitalize"
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
                    {option}
                  </button>
                );
              })}
            </div>
          </Card>
        </section>

        {/* ── Notifications ─────────────────────────────────────────────────────────────── */}
        <section className="mt-8">
          <SectionLabel>Notifications</SectionLabel>
          <Card className="mt-3 p-4">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgb(255 107 26 / 0.15)', color: 'var(--color-orange-500)' }}
              >
                <SparkIcon size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold">Order updates</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  Push notifications for accepted, cooking, out-for-delivery and delivered.
                  Arrives once ordering is live.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* ── Data ──────────────────────────────────────────────────────────────────────── */}
        <section className="mt-8">
          <SectionLabel>Your data</SectionLabel>
          <Card className="mt-3 p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {hydrated
                ? `${profile.addresses.length} saved ${profile.addresses.length === 1 ? 'address' : 'addresses'} on this device.`
                : 'Loading…'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-tertiary)]">
              Stored locally in your browser. Nothing has been sent to a server yet.
            </p>

            {confirmingReset ? (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfirmingReset(false)}
                >
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    profile.reset();
                    setConfirmingReset(false);
                  }}
                >
                  Yes, erase
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                size="sm"
                className="mt-4 w-full"
                onClick={() => setConfirmingReset(true)}
              >
                <TrashIcon size={15} />
                Erase saved data
              </Button>
            )}
          </Card>
        </section>

        {/* ── About ─────────────────────────────────────────────────────────────────────── */}
        <section className="mt-8">
          <SectionLabel>About</SectionLabel>
          <Card className="mt-3 divide-y divide-[var(--color-border-subtle)]">
            <Row label="Delivery area" value="Abode Valley · SRM hostels · nearby PGs" />
            <Row label="Hours" value="7:00 PM – 4:00 AM, every night" />
            <Row label="Delivery fee" value="Free, always" />
            <Row label="Minimum order" value="₹100" />
          </Card>
        </section>

        <p className="mt-8 text-center text-xs text-[var(--color-text-tertiary)]">
          Juice Stop · Kattankulathur
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
