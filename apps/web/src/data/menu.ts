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
