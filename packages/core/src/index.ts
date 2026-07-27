/**
 * @juice-stop/core
 *
 * Pure domain primitives. Zero runtime dependencies, no I/O, no framework.
 * Safe to import from anywhere — frontend, backend, workers, tests.
 */

export * as Money from './money.js';
export type { Paise } from './money.js';
export { MoneyError } from './money.js';

export * from './business-date.js';
export * from './store-hours.js';
export * from './result.js';
