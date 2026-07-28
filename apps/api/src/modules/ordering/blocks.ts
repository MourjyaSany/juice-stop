/**
 * Valid delivery blocks inside Abode Valley Complex.
 *
 * Mirrors `apps/web/src/data/blocks.ts`. Duplicated deliberately: the API must reject an invalid
 * block whether or not the request came from our own frontend, and a server that trusts the
 * client's idea of what is deliverable is not validating anything.
 *
 * I, O, U and X are absent by design — routinely skipped in Indian apartment blocks because I and
 * O read as 1 and 0 on a door plate.
 */
export const BLOCKS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L',
  'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y', 'Z',
] as const;

export type Block = (typeof BLOCKS)[number];

export const COMPLEX_NAME = 'Abode Valley Complex' as const;
