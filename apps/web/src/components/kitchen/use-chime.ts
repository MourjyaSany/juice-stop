'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MUTE_KEY = 'js.kitchen.muted';

/**
 * New-order chime.
 *
 * Synthesised with WebAudio rather than loaded from a file: nothing to fetch, nothing to 404, and
 * it still works on a tablet that has lost its connection — which is exactly when a cook most
 * needs to hear that an order arrived.
 *
 * Two guards on top of the mute toggle:
 *   · One AudioContext for the page. Constructing one per chime leaks contexts, and browsers cap
 *     how many a document may hold — the sound simply stops working after a busy hour.
 *   · A minimum gap between plays. Four orders landing together should sound like one
 *     acknowledgement, not a fire alarm. The brief asks for a subtle sound that does not repeat
 *     continuously; this is the part that enforces "does not repeat".
 */
const MIN_GAP_MS = 3000;

export function useChime(): { play: () => void; muted: boolean; toggleMute: () => void } {
  const [muted, setMuted] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const lastPlayed = useRef(0);

  // Read the preference after mount. Reading sessionStorage during render would make the server
  // and client disagree on first paint.
  useEffect(() => {
    setMuted(window.localStorage.getItem(MUTE_KEY) === '1');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const play = useCallback(() => {
    if (muted) return;

    const now = Date.now();
    if (now - lastPlayed.current < MIN_GAP_MS) return;
    lastPlayed.current = now;

    try {
      context.current ??= new AudioContext();
      const ctx = context.current;
      // Autoplay policy suspends contexts created before a user gesture. By the time a cook has
      // signed in they have gestured, so resuming here is enough — and failing quietly is right
      // if it is not.
      if (ctx.state === 'suspended') void ctx.resume();

      // A rising two-note figure. Short, soft, and pitched to cut through extraction-fan noise
      // without being the loudest thing in the room.
      [880, 1174.7].forEach((frequency, index) => {
        const at = ctx.currentTime + index * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        // Exponential ramps, never linear: loudness is perceived logarithmically, and a linear
        // fade audibly clicks at the tail.
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.32);
      });
    } catch {
      // No audio device, blocked context, ancient browser — none of which is worth an error on a
      // screen whose job is to show orders.
    }
  }, [muted]);

  return { play, muted, toggleMute };
}
