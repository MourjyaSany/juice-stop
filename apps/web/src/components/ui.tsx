'use client';

import { useEffect, useState } from 'react';
import { tapFeedback } from '@/lib/haptics';

/**
 * Shared UI primitives.
 *
 * Small and local for now; these graduate to `packages/ui` (with Storybook and axe tests) once a
 * second app needs them. Building the design-system package before there is a second consumer
 * would be ceremony, not architecture.
 */

/* ── Hydration ──────────────────────────────────────────────────────────────────────────────── */

/**
 * True only after the client has mounted.
 *
 * The profile store is persisted to localStorage, which does not exist during SSR. Rendering
 * persisted values on the first client pass would mismatch the server HTML and React would
 * discard the tree. Gate on this and render a skeleton until hydrated.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/* ── Button ─────────────────────────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-[10px]',
  md: 'h-11 px-5 text-sm rounded-[12px]',
  lg: 'h-14 px-6 text-base rounded-[14px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  style,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const base =
    'pressable inline-flex items-center justify-center gap-2 font-display font-semibold disabled:pointer-events-none disabled:opacity-40';

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? { background: 'var(--gradient-brand)', color: '#fff', boxShadow: 'var(--glow-orange)' }
      : variant === 'secondary'
        ? {
            background: 'var(--color-raised)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-strong)',
          }
        : variant === 'danger'
          ? { background: 'rgb(239 68 68 / 0.14)', color: 'var(--color-danger)' }
          : { background: 'transparent', color: 'var(--color-text-secondary)' };

  return (
    <button
      className={`${base} ${SIZES[size]} ${variant === 'primary' ? 'sheen' : ''} ${className}`}
      style={{ ...variantStyle, ...style }}
      {...props}
      // Spread first, then this: otherwise a caller's own `onPointerDown` would silently replace
      // the haptic rather than run alongside it. Both fire, caller's second.
      //
      // Haptics live on the shared button rather than at each call site, so "Add · ₹240" in the
      // item sheet, "Place order" at checkout and every other primary action feel identical
      // without anyone having to remember. Primary is a commitment; the quieter variants are not.
      onPointerDown={(event) => {
        if (props.disabled !== true) tapFeedback(variant === 'primary' ? 'commit' : 'select');
        props.onPointerDown?.(event);
      }}
    >
      {children}
    </button>
  );
}

/* ── Form field ─────────────────────────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  // `| undefined` is explicit because exactOptionalPropertyTypes distinguishes "absent" from
  // "present and undefined", and callers pass these conditionally: error={invalid ? '…' : undefined}
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: React.ReactNode;
  htmlFor?: string | undefined;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-baseline gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]"
      >
        {label}
        {required && (
          <span style={{ color: 'var(--color-orange-500)' }} aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {/* Errors are linked by aria-describedby at the input, and never carried by colour alone. */}
      {error !== undefined && error.length > 0 ? (
        <p
          id={htmlFor !== undefined ? `${htmlFor}-error` : undefined}
          className="mt-1.5 text-xs"
          style={{ color: 'var(--color-danger)' }}
        >
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className = '',
  invalid = false,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      // 16px minimum on mobile is not a style choice: iOS Safari auto-zooms below it, which
      // breaks the layout mid-form.
      className={`h-12 w-full rounded-[12px] border bg-[var(--color-inset)] px-4 text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none ${className}`}
      style={{ borderColor: invalid ? 'var(--color-danger)' : undefined }}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  className = '',
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-12 w-full appearance-none rounded-[12px] border bg-[var(--color-inset)] px-4 text-base text-[var(--color-text-primary)] focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────────────────────────────── */

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
      {children}
    </h2>
  );
}

export function Card({
  className = '',
  weight = 'base',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { weight?: 'subtle' | 'base' | 'strong' }) {
  const glass =
    weight === 'subtle' ? 'glass-subtle' : weight === 'strong' ? 'glass-strong' : 'glass';
  return (
    <div className={`${glass} rounded-[18px] ${className}`} {...props}>
      {children}
    </div>
  );
}

/** Empty states always offer an action — never a dead end. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'var(--gradient-glow)', color: 'var(--color-text-secondary)' }}
      >
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {body}
      </p>
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
