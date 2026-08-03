'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { tapFeedback, type HapticPattern } from '@/lib/haptics';

/**
 * A link that buzzes.
 *
 * The app's main calls to action — "Start your order", "See the menu", "Checkout" — are
 * `<Link>`s, not `<button>`s, because they navigate. That is correct for accessibility and for
 * middle-click, and it also meant they were the only large primary controls in the app with no
 * physical response: every real button got one from `TactileButton`, and the biggest targets on
 * the landing page got nothing.
 *
 * Same rule as everywhere else — fired on press-down, so the buzz lands with the finger rather
 * than after it. Navigation is a `commit` by default: these are the taps a customer wants to be
 * sure they made.
 */
export function HapticLink({
  haptic = 'commit',
  onPointerDown,
  ...rest
}: ComponentProps<typeof Link> & { haptic?: HapticPattern | false }) {
  return (
    <Link
      onPointerDown={(event) => {
        if (haptic !== false) tapFeedback(haptic);
        onPointerDown?.(event);
      }}
      {...rest}
    />
  );
}
