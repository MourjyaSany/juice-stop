'use client';

import { create } from 'zustand';
import { useEffect } from 'react';

/**
 * How many modal surfaces are currently open.
 *
 * The bottom navigation is `position: fixed` and sat at `z-[10000]` — high enough to punch
 * straight through the item sheet and the cart drawer, which is why the customisation panel and
 * the cart were both losing their bottom edge to it.
 *
 * Restacking alone would not be enough. A nav that merely sits *behind* a sheet is still
 * focusable, still announced to screen readers, and still visible through the sheet's translucent
 * edges. A modal is meant to be the only thing you can interact with, so the nav withdraws for as
 * long as one is open.
 *
 * A count rather than a boolean because sheets stack: the item sheet can open the cart drawer over
 * itself, and the first one to close must not bring the nav back underneath the second.
 */
interface OverlayState {
  count: number;
  open: () => void;
  close: () => void;
}

export const useOverlay = create<OverlayState>()((set) => ({
  count: 0,
  open: () => set((s) => ({ count: s.count + 1 })),
  close: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

/**
 * Register a modal for as long as it is mounted.
 *
 * Tied to mount rather than to an `isOpen` prop so an overlay that unmounts without animating out
 * — a route change mid-transition, an error boundary — cannot leave the nav hidden forever.
 */
export function useRegisterOverlay(active = true): void {
  const open = useOverlay((s) => s.open);
  const close = useOverlay((s) => s.close);

  useEffect(() => {
    if (!active) return;
    open();
    return close;
  }, [active, open, close]);
}

export const useOverlayOpen = (): boolean => useOverlay((s) => s.count > 0);
