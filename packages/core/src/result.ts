/**
 * Result — explicit success/failure without exceptions.
 *
 * Used in domain code (pricing, state transitions, coupon evaluation) where a failure is an
 * expected outcome rather than an exceptional one. "This coupon expired" is not an exception;
 * it is an answer, and the type system should force the caller to handle it.
 *
 * Exceptions remain correct for genuinely unexpected conditions (DB down, invariant violated).
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Unwrap, throwing if the result is an error. Only for call sites that have already checked. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`Called unwrap() on an error result: ${JSON.stringify(r.error)}`);
}

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);

export const map = <T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  r.ok ? ok(fn(r.value)) : r;

export const flatMap = <T, U, E>(r: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> =>
  r.ok ? fn(r.value) : r;

/** Collect many results; the first error wins. */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}

/**
 * A domain failure carrying a stable machine-readable `code`.
 *
 * `code` is a contract — clients switch on it and it never changes.
 * `message` is human copy and may change freely. See 04-api-spec.md §2.
 */
export interface DomainError {
  readonly code: string;
  readonly message: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export const domainError = (
  code: string,
  message: string,
  meta?: Record<string, unknown>,
): DomainError => (meta === undefined ? { code, message } : { code, message, meta });
