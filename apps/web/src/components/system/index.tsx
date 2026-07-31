'use client';

/**
 * The Juice Stop design system.
 *
 * One import surface so pages compose from a shared vocabulary rather than each inventing its own
 * card, heading and button. Everything here is presentation only — no business logic, no data
 * fetching, no store access.
 */

export { GeneratedImage } from './generated-image';
export { AuroraField, ParticleField, GridVeil } from './atmosphere';
export {
  StickerField,
  ColaCan,
  PizzaBox,
  GameController,
  ChipsPacket,
  CrescentMoon,
} from './stickers';
export { GlassPanel, GlowCard, AnimatedBorder, TactileButton } from './surfaces';
export { ScrollReveal, ScrollStagger, useParallax } from './reveal';

/** Small caps label. The system's quietest typographic level. */
export function Eyebrow({
  children,
  tone = 'muted',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'warm' | 'violet';
  className?: string;
}) {
  const colour =
    tone === 'warm'
      ? 'var(--color-orange-500)'
      : tone === 'violet'
        ? 'var(--color-purple-300)'
        : 'var(--color-text-tertiary)';

  return (
    <p
      className={`text-[0.6875rem] font-semibold uppercase tracking-[0.14em] ${className}`}
      style={{ color: colour }}
    >
      {children}
    </p>
  );
}

/** Section header with an eyebrow, a display title and an optional trailing slot. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  trailing,
  className = '',
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow !== undefined && <Eyebrow tone="warm">{eyebrow}</Eyebrow>}
        <h2 className="mt-1.5 font-display text-[clamp(1.4rem,5.5vw,1.9rem)] font-bold leading-[1.1] tracking-[-0.025em]">
          {title}
        </h2>
        {subtitle !== undefined && (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {trailing !== undefined && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/** Gradient text. Uses the magenta-midpoint ramp — orange→purple direct goes muddy brown. */
export function GradientText({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        background: 'linear-gradient(115deg, #FF8A3D 0%, #FF3D81 46%, #C084FC 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {children}
    </span>
  );
}

/** Status pill. Colour is always paired with a dot and a label — never colour alone. */
export function StatusPill({
  tone,
  label,
  pulse = false,
}: {
  tone: 'live' | 'warn' | 'off' | 'violet';
  label: string;
  pulse?: boolean;
}) {
  const map = {
    live: { fg: 'var(--color-success)', bg: 'rgb(34 197 94 / 0.14)' },
    warn: { fg: 'var(--color-warning)', bg: 'rgb(245 158 11 / 0.14)' },
    off: { fg: 'var(--color-text-tertiary)', bg: 'rgb(255 255 255 / 0.06)' },
    violet: { fg: 'var(--color-purple-300)', bg: 'rgb(168 85 247 / 0.16)' },
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: map.bg, color: map.fg }}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        {pulse && (
          <span
            className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full"
            style={{ background: map.fg }}
          />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: map.fg }} />
      </span>
      {label}
    </span>
  );
}
