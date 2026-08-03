'use client';

/**
 * The order-confirmed chime.
 *
 * Sibling to the kitchen's new-order chime and built the same way — synthesised with WebAudio
 * rather than fetched, so there is no file to 404, nothing to preload, and it still plays on a
 * phone that has just lost signal at the exact moment the confirmation arrives.
 *
 * The figure is different on purpose. The kitchen's is a two-note *alert* that has to cut through
 * an extraction fan; this is a three-note **resolution** — a rising major triad that lands and
 * decays. It plays once, when an order becomes real, and it is the only sound the customer app
 * makes. A confirmation is a small moment of relief, and it should sound like one.
 *
 * Quieter than the kitchen's, too. That one competes with a working kitchen; this one is a phone
 * held in bed at one in the morning.
 */

/** A–C♯–E: a major triad, rising. Resolves rather than alerts. */
const NOTES = [880, 1108.7, 1318.5];

const PEAK_GAIN = 0.16;

let context: AudioContext | null = null;
let lastPlayed = 0;

/**
 * Once per order, and never twice in quick succession.
 *
 * The tracking screen re-renders on every poll and the confirmation page can remount on a back
 * navigation, so "play when confirmed" would otherwise fire repeatedly for one event. The caller
 * keys on the order; this is the backstop.
 */
const MIN_GAP_MS = 4000;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function playConfirmChime(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = now;

  // Reduced motion is the closest signal the platform gives for "don't surprise me". Someone who
  // has asked for a calmer interface has not asked for their phone to start playing music.
  if (prefersReducedMotion()) return;

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;

    // One context for the page. Constructing one per play leaks them, and browsers cap how many a
    // document may hold — the sound simply stops working after a while.
    context ??= new Ctor();
    const ctx = context;

    // Autoplay policy suspends contexts created before a gesture. Placing an order *is* a gesture,
    // so by the time this fires the page has one; resuming quietly is enough if it does not.
    if (ctx.state === 'suspended') void ctx.resume();

    NOTES.forEach((frequency, index) => {
      const at = ctx.currentTime + index * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Triangle rather than sine: a touch more harmonic content, so it stays audible through a
      // phone speaker without needing to be louder.
      osc.type = index === NOTES.length - 1 ? 'sine' : 'triangle';
      osc.frequency.value = frequency;

      // Exponential ramps, never linear — loudness is perceived logarithmically, and a linear fade
      // audibly clicks at the tail. The final note rings longer, which is what makes the phrase
      // land instead of stopping.
      const tail = index === NOTES.length - 1 ? 0.75 : 0.28;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + tail);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + tail + 0.02);
    });
  } catch {
    // No audio device, a blocked context, an old browser. None of it is worth an error on the
    // screen that is telling somebody their food is on the way.
  }
}
