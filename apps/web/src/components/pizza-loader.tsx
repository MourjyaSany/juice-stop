/**
 * The loading pizza.
 *
 * A pizza turning slowly while its slices are laid on and taken off again — the shop's own
 * iconography doing the job a generic spinner would, and the only thing on screen while a route
 * resolves.
 *
 * **Deliberately quiet.** This appears on a dark page, usually at 1am, and its whole job is to say
 * "a moment" without demanding attention. So: low opacity, warm tones borrowed from the brand
 * rather than a saturated accent, no hard white anywhere, and slow easing. A loading indicator
 * that is brighter than the content it is standing in for reads as an error state.
 *
 * Pure CSS animation on `opacity` and `transform` only, so it stays on the compositor and costs
 * nothing while the page it is covering does real work. The global reduced-motion rule in
 * `globals.css` already freezes it — the slices come to rest fully laid, which is a pizza rather
 * than a blank circle, so it degrades to a static mark rather than to nothing.
 */

/** Eight slices, so each wedge is a clean 45°. */
const SLICES = 8;

export function PizzaLoader({
  size = 96,
  label = 'Loading',
}: {
  size?: number;
  /** Announced to screen readers. The visual is decorative; this is the part that informs. */
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4"
    >
      <div
        className="pizza-loader relative"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* The base: crust ring and the sauce beneath the slices. Always present, so the shape
            reads as a pizza even at the moment no slices are showing. */}
        <span className="pizza-loader__base" />

        <span className="pizza-loader__spin">
          {Array.from({ length: SLICES }, (_, index) => (
            <span
              key={index}
              className="pizza-loader__slice"
              style={{
                // Each wedge is rotated into place and fades in on its own staggered offset, so
                // the count grows around the pie and then retreats the same way.
                transform: `rotate(${(360 / SLICES) * index}deg)`,
                animationDelay: `${index * 0.13}s`,
              }}
            />
          ))}
        </span>
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Full-screen version, for route transitions.
 *
 * Translucent rather than opaque: the page underneath stays faintly visible, which makes a fast
 * transition feel like a veil passing rather than like the app blanking and coming back.
 */
export function PizzaLoaderScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{
        background: 'color-mix(in srgb, var(--color-canvas) 72%, transparent)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <PizzaLoader size={112} label={label} />
    </div>
  );
}
