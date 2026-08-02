'use client';

import { useEffect, useState } from 'react';
import { kitchen, kitchenSession, type KitchenStats } from '@/lib/kitchen-api';
import { KitchenShell } from '@/components/kitchen/shell';
import { useChime } from '@/components/kitchen/use-chime';

/**
 * Kitchen settings.
 *
 * Deliberately small. Everything that changes how the *business* behaves — service hours,
 * capacity thresholds, pricing — is configuration the API owns and validates at boot, not a
 * toggle on a tablet a cook could nudge mid-rush. What lives here is what belongs to this
 * screen: sound, and the session.
 */
export default function KitchenSettingsPage() {
  const { muted, toggleMute, play } = useChime();
  const [stats, setStats] = useState<KitchenStats | null>(null);
  const [session, setSession] = useState<{ username: string; expiresAt: string } | null>(null);

  useEffect(() => {
    void kitchen.stats().then(setStats).catch(() => undefined);
    void kitchen
      .session()
      .then((r) => setSession(r.session))
      .catch(() => undefined);
  }, []);

  return (
    <KitchenShell
      header={
        <header
          className="sticky top-0 z-20 border-b px-4 py-4 lg:px-6"
          style={{
            borderColor: 'var(--color-border-subtle)',
            background: 'color-mix(in srgb, var(--color-canvas) 88%, transparent)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h1 className="font-display text-lg font-bold">Kitchen settings</h1>
        </header>
      }
    >
      <div className="max-w-2xl space-y-4">
        <Panel title="Sound">
          <Row
            label="New order chime"
            hint="Plays once when a ticket arrives. Repeats are suppressed for three seconds so a rush sounds like one alert."
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={play}
                className="h-12 rounded-[11px] px-4 text-sm font-semibold"
                style={{ background: 'var(--color-inset)', color: 'var(--color-text-secondary)' }}
              >
                Test
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={!muted}
                className="h-12 w-32 rounded-[11px] text-sm font-bold"
                style={
                  muted
                    ? { background: 'rgb(239 68 68 / 0.16)', color: 'var(--color-danger)' }
                    : { background: 'rgb(34 197 94 / 0.16)', color: 'var(--color-success)' }
                }
              >
                {muted ? 'Muted' : 'Sound on'}
              </button>
            </div>
          </Row>
        </Panel>

        <Panel title="Service">
          <Row label="Status" hint="Set by the service window, not by this screen.">
            <span className="font-display text-sm font-bold">
              {stats === null ? '—' : stats.acceptingOrders ? 'Open · taking orders' : 'Closed'}
            </span>
          </Row>
          <Row label="Business date" hint="The service night. Rolls over at 05:00 IST, not midnight.">
            <span className="tabular font-mono text-sm">{stats?.businessDate ?? '—'}</span>
          </Row>
          <Row label="Average prep tonight" hint="Measured from Accept to Ready.">
            <span className="tabular font-display text-sm font-bold">
              {stats?.averagePrepMinutes != null ? `${stats.averagePrepMinutes} min` : 'No data yet'}
            </span>
          </Row>
        </Panel>

        <Panel title="Session">
          <Row label="Signed in as" hint="Development credentials.">
            <span className="font-mono text-sm">{session?.username ?? '—'}</span>
          </Row>
          <Row label="Expires" hint="Sessions end when the tab closes.">
            <span className="tabular font-mono text-sm">
              {session === null
                ? '—'
                : new Date(session.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </span>
          </Row>
        </Panel>

        <p
          className="rounded-[12px] px-4 py-3 text-xs leading-relaxed"
          style={{ background: 'rgb(245 158 11 / 0.10)', color: 'var(--color-warning)' }}
        >
          This build uses development authentication (<strong>cook</strong> / <strong>cook123</strong>),
          isolated in <code>modules/kitchen-auth</code> on the API. It refuses to start in
          production — replace it with the real identity system before deploying.
        </p>

        <button
          type="button"
          onClick={() => {
            kitchenSession.clear();
            window.location.href = '/kitchen/login';
          }}
          className="h-14 w-full rounded-[12px] font-display text-sm font-bold"
          style={{ background: 'rgb(239 68 68 / 0.14)', color: 'var(--color-danger)' }}
        >
          Log out
        </button>
      </div>
    </KitchenShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[16px] p-4"
      style={{ background: 'var(--color-raised)', border: '1px solid var(--color-border-subtle)' }}
    >
      <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-tertiary)]">{hint}</p>
      </div>
      {children}
    </div>
  );
}
