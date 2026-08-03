'use client';

import { create } from 'zustand';
import {
  BROWSABLE_ITEMS,
  findItem as findStaticItem,
  type MenuItem,
  type GroupId,
} from '@juice-stop/menu';

const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '/api/v1';

/**
 * Menu items created after the app was built.
 *
 * The catalogue ships in `@juice-stop/menu` as a build-time constant, which is why the storefront
 * renders instantly and prices without a round trip. That is worth keeping — but it also meant an
 * item the owner added at 21:00 could not exist for a customer until the next deploy.
 *
 * So the static catalogue stays the fast path and this holds only what the API knows about and the
 * bundle does not. A merge rather than a replacement: the common case costs nothing, the app still
 * works if the API is unreachable, and new items appear within a poll.
 *
 * The long-term fix is the storefront reading its whole catalogue from the API (audit A11). This
 * is the seam for it — when that lands, `useBrowsableItems` keeps its signature and every caller
 * stays unchanged.
 */

interface RuntimeMenuState {
  extras: MenuItem[];
  /**
   * Bundled items the API no longer serves.
   *
   * The owner can take anything off the menu, including items baked into this build — and a
   * removed item that keeps rendering is worse than one that never existed, because a customer can
   * add it to a cart and only discover at checkout that it is gone. The API's menu is the truth;
   * the bundle is a cache of it, so anything the cache holds and the truth does not is hidden.
   *
   * Empty when the API is unreachable, which is the right degradation: the full bundle renders,
   * exactly as it did before any of this existed.
   */
  hiddenIds: Set<string>;
  apply: (extras: MenuItem[], hiddenIds: Set<string>) => void;
}

const useRuntimeMenu = create<RuntimeMenuState>()((set) => ({
  extras: [],
  hiddenIds: new Set<string>(),
  apply: (extras, hiddenIds) => set({ extras, hiddenIds }),
}));

/** The catalogue as it stands right now: bundle, minus removals, plus anything new. */
export function useBrowsableItems(): MenuItem[] {
  const extras = useRuntimeMenu((s) => s.extras);
  const hiddenIds = useRuntimeMenu((s) => s.hiddenIds);

  if (extras.length === 0 && hiddenIds.size === 0) return [...BROWSABLE_ITEMS];
  return [...BROWSABLE_ITEMS.filter((i) => !hiddenIds.has(i.id)), ...extras];
}

/**
 * Item lookup that also sees runtime items.
 *
 * Not a hook, because the cart prices lines outside React. Reading the store imperatively is the
 * point — `priceCart` must be able to resolve an item the owner added five minutes ago, and it
 * runs in a plain function.
 */
export function findItemAnywhere(id: string): MenuItem | undefined {
  const { extras, hiddenIds } = useRuntimeMenu.getState();
  // Removed items stay resolvable on purpose. The cart prices through here, and a line referencing
  // a just-removed item must still render its name and price so the customer can be told what to
  // drop — returning undefined would silently vanish the line and change the total with no
  // explanation. The server refuses the order either way.
  return extras.find((i) => i.id === id) ?? findStaticItem(id) ?? undefined;
}

/** Has the owner taken this off the menu since this build shipped? */
export function isRemovedFromMenu(id: string): boolean {
  return useRuntimeMenu.getState().hiddenIds.has(id);
}

interface ApiMenuItem {
  id: string;
  groupId: string;
  categoryId: string;
  name: string;
  description?: string;
  isVeg: boolean;
  prepTimeSeconds: number;
  tags: string[];
  inStock: boolean;
  isDeal?: boolean;
  availableUntil?: string;
  variants: Array<{ id: string; name: string; pricePaise: string }>;
  addOns: Array<{ id: string; name: string; pricePaise?: string }>;
}

/**
 * Pull the catalogue and keep only what the bundle is missing.
 *
 * Called on mount and whenever an inventory event arrives — creating an item publishes one, so a
 * customer with the menu open sees it appear without refreshing.
 */
export async function refreshRuntimeMenu(): Promise<void> {
  try {
    const response = await fetch(`${BASE}/menu`);
    if (!response.ok) return;
    const payload = (await response.json()) as { items: ApiMenuItem[] };

    const known = new Set(BROWSABLE_ITEMS.map((i) => i.id));
    const served = new Set(payload.items.map((i) => i.id));

    const extras = payload.items
      .filter((item) => !known.has(item.id) && item.variants.length > 0)
      .map(toMenuItem);

    // Anything the bundle believes in that the API no longer serves: removed by the owner, or a
    // deal whose window closed.
    const hiddenIds = new Set(BROWSABLE_ITEMS.filter((i) => !served.has(i.id)).map((i) => i.id));

    // Only write when something actually changed, so a poll on an unchanged menu does not re-render
    // a 200-row list.
    const current = useRuntimeMenu.getState();
    const sameExtras =
      current.extras.length === extras.length &&
      current.extras.every((c, i) => c.id === extras[i]?.id);
    const sameHidden =
      current.hiddenIds.size === hiddenIds.size &&
      [...hiddenIds].every((id) => current.hiddenIds.has(id));
    if (!sameExtras || !sameHidden) current.apply(extras, hiddenIds);
  } catch {
    // Offline, or the API is down. The static catalogue still renders — which is exactly the
    // degradation this design was chosen for.
  }
}

/** Wire shape → the shape every component already understands. */
function toMenuItem(item: ApiMenuItem): MenuItem {
  return {
    id: item.id,
    groupId: item.groupId as GroupId,
    categoryId: item.categoryId,
    name: item.name,
    ...(item.description !== undefined ? { description: item.description } : {}),
    isVeg: item.isVeg,
    variants: item.variants.map((v) => ({
      id: v.id,
      name: v.name,
      // Paise as bigint, never a float — the wire carries a decimal string for exactly this.
      pricePaise: BigInt(v.pricePaise),
    })),
    addOns: item.addOns.map((a) => ({
      id: a.id,
      name: a.name,
      ...(a.pricePaise !== undefined ? { pricePaise: BigInt(a.pricePaise) } : {}),
    })),
    tags: item.tags,
    prepTimeSeconds: item.prepTimeSeconds,
    inStock: item.inStock,
    ...(item.isDeal === true ? { isDeal: true } : {}),
    ...(item.availableUntil !== undefined ? { availableUntil: item.availableUntil } : {}),
  } as MenuItem;
}
