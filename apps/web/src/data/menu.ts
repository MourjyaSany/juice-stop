/**
 * The menu now lives in `@juice-stop/menu`.
 *
 * It was previously duplicated here and in the database seed, which meant a price corrected in one
 * place silently disagreed with the other — the storefront showing one number while the API and
 * kitchen board served another. One package, imported by both, makes that impossible.
 *
 * This re-export exists so the ~15 call sites in the app keep working unchanged.
 */

export * from '@juice-stop/menu';

/**
 * `findItem` is deliberately overridden here.
 *
 * An explicit export shadows a star export, so every existing caller — the cart's pricing in
 * particular — resolves items the owner added at runtime as well as the ones baked into the
 * bundle. Without this an order containing a new item would fail to price on the client while
 * pricing perfectly on the server, which is the most confusing possible split.
 */
export { findItemAnywhere as findItem, useBrowsableItems } from './menu-runtime';
