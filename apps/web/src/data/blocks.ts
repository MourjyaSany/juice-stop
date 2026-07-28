/**
 * Delivery area.
 *
 * Juice Stop delivers **only inside Abode Valley Complex**. There is no locality picker, no
 * free-text area field and no "other" option — an address outside the complex is not a slow
 * delivery, it is a delivery that cannot happen, so the UI must make it unrepresentable rather
 * than merely discouraged.
 *
 * This replaces the earlier multi-building catalogue (ADR-004 still holds: serviceability is
 * decided on the saved address, and GPS only assists).
 */

export const COMPLEX_NAME = 'Abode Valley Complex' as const;

/**
 * The valid blocks.
 *
 * Note the gaps: **I, O, U and X do not exist**. That is not an oversight — those letters are
 * routinely skipped in Indian apartment blocks because I and O read as 1 and 0 on a door plate.
 * Keeping them out of the list is the entire point of using a dropdown here.
 */
export const BLOCKS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y', 'Z',
] as const;

export type Block = (typeof BLOCKS)[number];

/** `"A"` → `"Block A"`. */
export const blockLabel = (block: string): string => `Block ${block}`;

/** Guard used by both the form and the order path — never trust a stored value. */
export const isValidBlock = (value: string): value is Block =>
  (BLOCKS as readonly string[]).includes(value);

/** Full one-line address for rider display and order snapshots. */
export function formatAddressLine(parts: {
  block: string;
  flatOrRoom: string;
  floor?: string;
}): string {
  const floor = parts.floor !== undefined && parts.floor.length > 0 ? `, Floor ${parts.floor}` : '';
  return `${parts.flatOrRoom}${floor}, ${blockLabel(parts.block)}, ${COMPLEX_NAME}`;
}
