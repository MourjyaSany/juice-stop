'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { admin, type MenuCategoryOption } from '@/lib/kitchen-api';

/**
 * Add a menu item.
 *
 * Kept to the fields an owner can answer without thinking: name, category, price, veg or not. Prep
 * time and description are optional and default sensibly — a form that demands nine fields for a
 * ₹20 side is a form that gets abandoned, and the item never gets added at all.
 *
 * Price is entered in **rupees** because that is what an owner thinks in. It converts to paise at
 * the API boundary, exactly once (ADR-003).
 */
export function AddItemForm({ onCreated }: { onCreated?: () => void }) {
  const [categories, setCategories] = useState<MenuCategoryOption[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [rupees, setRupees] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (!open || categories.length > 0) return;
    void admin
      .menuCategories()
      .then((r) => {
        setCategories(r.categories);
        setCategoryId((current) => (current === '' ? (r.categories[0]?.id ?? '') : current));
      })
      .catch(() => setError('Could not load categories.'));
  }, [open, categories.length]);

  const price = Number(rupees);
  const valid = name.trim().length >= 2 && categoryId !== '' && Number.isFinite(price) && price > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const item = await admin.createMenuItem({
        name: name.trim(),
        categoryId,
        rupees: price,
        isVeg,
        ...(description.trim().length > 0 ? { description: description.trim() } : {}),
      });
      setCreated(item.name);
      // Clear the fields but keep the form open — adding one item usually means adding three.
      setName('');
      setRupees('');
      setDescription('');
      onCreated?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add that item.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] font-display text-sm font-bold"
        style={{ background: 'rgb(168 85 247 / 0.14)', color: 'var(--color-purple-300)' }}
      >
        <span aria-hidden>＋</span> Add a menu item
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ opacity: busy ? 0.6 : 1 }}>
      {created !== null && (
        <p
          role="status"
          className="mb-3 rounded-[11px] px-3.5 py-2.5 text-sm"
          style={{ background: 'rgb(34 197 94 / 0.12)', color: 'var(--color-success)' }}
        >
          <strong>{created}</strong> is on the menu now — customers see it without refreshing.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Item name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Paneer Kathi Roll"
            maxLength={60}
            autoFocus
            className="h-12 w-full rounded-[11px] px-3.5 text-sm outline-none"
            style={inputStyle}
          />
        </Field>

        <Field label="Price (₹)">
          <input
            value={rupees}
            onChange={(e) => setRupees(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="120"
            className="tabular h-12 w-full rounded-[11px] px-3.5 text-sm outline-none"
            style={inputStyle}
          />
        </Field>

        <Field label="Category">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-12 w-full rounded-[11px] px-3 text-sm outline-none"
            style={inputStyle}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Diet">
          <div className="flex h-12 gap-2">
            {[
              { veg: true, label: 'Veg', colour: '#22C55E' },
              { veg: false, label: 'Non-veg', colour: '#EF4444' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setIsVeg(option.veg)}
                aria-pressed={isVeg === option.veg}
                className="flex-1 rounded-[11px] text-sm font-semibold"
                style={{
                  background: isVeg === option.veg ? `${option.colour}22` : 'var(--color-inset)',
                  color:
                    isVeg === option.veg ? option.colour : 'var(--color-text-secondary)',
                  boxShadow: isVeg === option.veg ? `inset 0 0 0 1px ${option.colour}55` : 'none',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Description (optional)">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Spiced paneer, onions, mint chutney"
            maxLength={160}
            className="h-12 w-full rounded-[11px] px-3.5 text-sm outline-none"
            style={inputStyle}
          />
        </Field>
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCreated(null);
            setError(null);
          }}
          className="h-12 flex-1 rounded-[11px] text-sm font-semibold"
          style={{ background: 'var(--color-inset)', color: 'var(--color-text-secondary)' }}
        >
          Done
        </button>
        <button
          type="submit"
          disabled={!valid || busy}
          className="h-12 flex-[2] rounded-[11px] font-display text-sm font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--gradient-brand)' }}
        >
          {busy ? 'Adding…' : 'Add to the menu'}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-inset)',
  border: '1px solid var(--color-border-subtle)',
  color: 'var(--color-text-primary)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
