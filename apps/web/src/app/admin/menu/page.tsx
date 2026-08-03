'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Money } from '@juice-stop/core';
import { ApiError } from '@/lib/api';
import { admin, toPaise, type ManageableItem } from '@/lib/kitchen-api';
import { AdminShell } from '@/components/admin/shell';
import { PizzaLoader } from '@/components/pizza-loader';
import { StaffPanel } from '@/components/staff/glass';
import { AddItemForm } from '@/components/admin/add-item';

/**
 * The owner's control over what the shop sells.
 *
 * Three jobs on one screen because they are one decision made in one sitting — "what are we
 * pushing tonight": run an offer, choose what the landing page shouts about, and take off anything
 * that has stopped earning its place.
 *
 * Everything here writes through the API and is announced over realtime, so a customer with the
 * menu open sees the change without refreshing. That is the point of doing it here rather than in
 * a config file: the owner is standing in the shop at 21:00, not running a deploy.
 */

const DURATIONS = [
  { hours: 3, label: '3 hours' },
  { hours: 6, label: 'Tonight' },
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: 'A week' },
  { hours: null, label: 'Until I remove it' },
] as const;

export default function AdminMenuPage() {
  const [items, setItems] = useState<ManageableItem[]>([]);
  const [popularIds, setPopularIds] = useState<string[]>([]);
  const [maxPopular, setMaxPopular] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await admin.menuItems();
      setItems(r.items);
      setPopularIds(r.popularIds);
      setMaxPopular(r.maxPopular);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) return;
      setError('Could not load the menu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deals = useMemo(() => items.filter((i) => i.isDeal), [items]);
  const regular = useMemo(() => items.filter((i) => !i.isDeal), [items]);

  const remove = async (item: ManageableItem) => {
    // A destructive, customer-visible change gets one deliberate pause. Not a modal — a modal here
    // would be four taps for something an owner does repeatedly — but not a bare single tap either.
    if (!window.confirm(`Take "${item.name}" off the menu? Customers will stop seeing it.`)) return;
    setBusyId(item.id);
    try {
      await admin.removeMenuItem(item.id);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove that.');
    } finally {
      setBusyId(null);
    }
  };

  const togglePopular = async (id: string) => {
    const next = popularIds.includes(id)
      ? popularIds.filter((x) => x !== id)
      : [...popularIds, id];

    if (next.length > maxPopular) {
      setError(`Popular tonight holds ${maxPopular} items. Remove one first.`);
      return;
    }

    // Optimistic: the checkbox must feel instant, and the server is the authority either way — a
    // rejection reloads the truth below.
    setPopularIds(next);
    try {
      await admin.setPopular(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that line-up.');
      void load();
    }
  };

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
          <h1 className="font-display text-lg font-bold">Menu &amp; deals</h1>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Changes reach customers immediately — no refresh on their side
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

      {loading ? (
        <div className="py-16"><PizzaLoader size={84} /></div>
      ) : (
        <div className="space-y-4">
          <DealsPanel deals={deals} now={now} busyId={busyId} onCreated={load} onRemove={remove} />

          <PopularPanel
            items={items}
            popularIds={popularIds}
            maxPopular={maxPopular}
            onToggle={togglePopular}
          />

          <Panel
            title={`Everything on the menu · ${regular.length}`}
            hint="Removing an item hides it from customers. Past orders keep their record of it."
          >
            <div className="mb-3">
              <AddItemForm onCreated={() => void load()} />
            </div>
            <ItemTable items={regular} busyId={busyId} onRemove={remove} now={now} />
          </Panel>
        </div>
      )}
    </AdminShell>
  );
}

/* ── Deals ──────────────────────────────────────────────────────────────────────────────────── */

function DealsPanel({
  deals,
  now,
  busyId,
  onCreated,
  onRemove,
}: {
  deals: ManageableItem[];
  now: number;
  busyId: string | null;
  onCreated: () => Promise<void>;
  onRemove: (item: ManageableItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rupees, setRupees] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [durationHours, setDurationHours] = useState<number | null>(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = Number(rupees);
  const valid = name.trim().length >= 2 && Number.isFinite(price) && price > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await admin.createDeal({
        name: name.trim(),
        ...(description.trim().length > 0 ? { description: description.trim() } : {}),
        rupees: price,
        isVeg,
        durationHours,
      });
      setName('');
      setDescription('');
      setRupees('');
      await onCreated();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create that deal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={`Tonight's deals · ${deals.filter((d) => !d.expired).length} running`}
      hint="A deal is an ordinary menu item with an end time — it prices, cooks and reports like everything else."
    >
      {deals.length === 0 ? (
        <p className="mb-3 rounded-[12px] px-4 py-6 text-center text-sm text-[var(--color-text-tertiary)]"
           style={{ border: '1px dashed var(--color-border-subtle)' }}>
          No deals yet. A time-limited offer is the fastest way to move a slow night.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {deals.map((deal) => (
            <li
              key={deal.id}
              className="flex flex-wrap items-center gap-3 rounded-[12px] px-3.5 py-3"
              style={{
                background: 'var(--color-inset)',
                boxShadow: `inset 3px 0 0 0 ${deal.expired ? 'var(--color-text-tertiary)' : '#EAB308'}`,
                opacity: deal.expired ? 0.55 : 1,
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold">
                  {deal.name}
                  <span className="ml-2 tabular font-normal text-[var(--color-text-secondary)]">
                    {Money.format(toPaise(deal.pricePaise))}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                  {deal.availableUntil === null
                    ? 'Runs until you remove it'
                    : deal.expired
                      ? 'Ended — customers can no longer see this'
                      : `Ends in ${remaining(deal.availableUntil, now)}`}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === deal.id}
                onClick={() => onRemove(deal)}
                className="h-10 shrink-0 rounded-[10px] px-3.5 text-xs font-bold disabled:opacity-50"
                style={{ background: 'rgb(239 68 68 / 0.14)', color: 'var(--color-danger)' }}
              >
                {busyId === deal.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] font-display text-sm font-bold"
          style={{ background: 'rgb(234 179 8 / 0.16)', color: 'var(--color-warning)' }}
        >
          <span aria-hidden>🔥</span> Create a deal
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-[12px] p-3.5" style={{ background: 'var(--color-inset)' }}>
          <Field label="Deal name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Midnight combo"
              className="h-12 w-full rounded-[10px] border-0 bg-[var(--color-raised)] px-3.5 text-base"
            />
          </Field>

          <Field label="What's in it" hint="Shown to customers under the name.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="Any burger + fries + a shake"
              className="h-12 w-full rounded-[10px] border-0 bg-[var(--color-raised)] px-3.5 text-base"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)">
              <input
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
                inputMode="decimal"
                placeholder="249"
                className="tabular h-12 w-full rounded-[10px] border-0 bg-[var(--color-raised)] px-3.5 text-base"
              />
            </Field>
            <Field label="Veg?">
              <div className="flex h-12 gap-2">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setIsVeg(v)}
                    aria-pressed={isVeg === v}
                    className="flex-1 rounded-[10px] text-sm font-bold"
                    style={{
                      background: isVeg === v ? 'rgb(34 197 94 / 0.16)' : 'var(--color-raised)',
                      color: isVeg === v ? 'var(--color-success)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {v ? 'Veg' : 'Non-veg'}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Runs for" hint="It disappears from the menu by itself when the time is up.">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setDurationHours(d.hours)}
                  aria-pressed={durationHours === d.hours}
                  className="h-10 rounded-[9px] px-3 text-xs font-semibold"
                  style={{
                    background:
                      durationHours === d.hours ? 'rgb(168 85 247 / 0.16)' : 'var(--color-raised)',
                    color:
                      durationHours === d.hours
                        ? 'var(--color-purple-300)'
                        : 'var(--color-text-secondary)',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>

          {error !== null && (
            <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!valid || busy}
              className="h-12 flex-1 rounded-[11px] font-display text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--gradient-brand)' }}
            >
              {busy ? 'Creating…' : 'Put it live'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 rounded-[11px] px-4 text-sm font-semibold text-[var(--color-text-secondary)]"
              style={{ background: 'var(--color-raised)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}

/* ── Popular tonight ────────────────────────────────────────────────────────────────────────── */

function PopularPanel({
  items,
  popularIds,
  maxPopular,
  onToggle,
}: {
  items: ManageableItem[];
  popularIds: string[];
  maxPopular: number;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  const chosen = popularIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is ManageableItem => i !== undefined);

  const matches =
    query.trim().length < 2
      ? []
      : items
          .filter(
            (i) =>
              !i.expired &&
              !popularIds.includes(i.id) &&
              i.name.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .slice(0, 8);

  return (
    <Panel
      title={`Popular tonight · ${chosen.length}/${maxPopular}`}
      hint="The rail on the landing page. Leave it empty and the app falls back to the catalogue's own bestseller tags."
    >
      {chosen.length === 0 ? (
        <p
          className="rounded-[12px] px-4 py-5 text-center text-sm text-[var(--color-text-tertiary)]"
          style={{ border: '1px dashed var(--color-border-subtle)' }}
        >
          Nothing pinned — customers see the default bestsellers.
        </p>
      ) : (
        <ol className="space-y-2">
          {chosen.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-[11px] px-3.5 py-2.5"
              style={{ background: 'var(--color-inset)' }}
            >
              {/* Position is shown because it is what the customer sees: the first pick is the
                  first card on the rail. */}
              <span
                className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold"
                style={{ background: 'rgb(168 85 247 / 0.18)', color: 'var(--color-purple-300)' }}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
              <span className="tabular shrink-0 text-xs text-[var(--color-text-tertiary)]">
                {Money.format(toPaise(item.pricePaise))}
              </span>
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-label={`Remove ${item.name} from Popular tonight`}
                className="h-9 shrink-0 rounded-[9px] px-3 text-xs font-bold"
                style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
              >
                Unpin
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu to pin something…"
          className="h-12 w-full rounded-[11px] border-0 bg-[var(--color-inset)] px-3.5 text-base"
        />
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {matches.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onToggle(item.id);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-left"
                  style={{ background: 'var(--color-raised)' }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <span className="tabular shrink-0 text-xs text-[var(--color-text-tertiary)]">
                    {Money.format(toPaise(item.pricePaise))}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-[var(--color-purple-300)]">
                    Pin
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ── All items ──────────────────────────────────────────────────────────────────────────────── */

function ItemTable({
  items,
  busyId,
  onRemove,
  now,
}: {
  items: ManageableItem[];
  busyId: string | null;
  onRemove: (item: ManageableItem) => void;
  now: number;
}) {
  const [query, setQuery] = useState('');
  const filtered =
    query.trim().length === 0
      ? items
      : items.filter((i) =>
          `${i.name} ${i.categoryName}`.toLowerCase().includes(query.trim().toLowerCase()),
        );

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search 200 items…"
        className="mb-3 h-12 w-full rounded-[11px] border-0 bg-[var(--color-inset)] px-3.5 text-base"
      />
      {/* Capped and scrollable: 200 rows rendered flat turns this page into a scroll marathon on
          the phone an owner is actually holding. */}
      <ul className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
        {filtered.slice(0, 60).map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5"
            style={{ background: 'var(--color-inset)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {item.name}
                {!item.inStock && (
                  <span className="ml-2 text-[11px] font-bold" style={{ color: 'var(--color-danger)' }}>
                    sold out
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                {item.categoryName} · {Money.format(toPaise(item.pricePaise))}
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => onRemove(item)}
              className="h-9 shrink-0 rounded-[9px] px-3 text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgb(239 68 68 / 0.12)', color: 'var(--color-danger)' }}
            >
              {busyId === item.id ? '…' : 'Remove'}
            </button>
          </li>
        ))}
      </ul>
      {filtered.length > 60 && (
        <p className="mt-2 text-center text-[11px] text-[var(--color-text-tertiary)]">
          Showing 60 of {filtered.length} — narrow the search to find the rest.
        </p>
      )}
      {/* `now` keeps this component re-rendering in step with the deal countdowns above, so the
          two never disagree about what time it is. */}
      <span className="hidden">{now}</span>
    </>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────────────────────────── */

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <StaffPanel className="p-4" accent="rgb(168 85 247 / 0.13)">
      <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
        {title}
      </h2>
      {hint !== undefined && (
        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[var(--color-text-tertiary)]">
          {hint}
        </p>
      )}
      <div className={hint === undefined ? 'mt-3' : ''}>{children}</div>
    </StaffPanel>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      {children}
      {hint !== undefined && (
        <span className="mt-1 block text-[11px] text-[var(--color-text-tertiary)]">{hint}</span>
      )}
    </label>
  );
}

/** `2h 14m` / `9m` — coarse on purpose. A deal ending in three hours does not need seconds. */
function remaining(untilIso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((Date.parse(untilIso) - now) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}
