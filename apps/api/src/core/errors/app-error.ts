/**
 * The application error hierarchy.
 *
 * Contract (04-api-spec.md §2):
 *   · `code`   is STABLE. Clients switch on it. It never changes.
 *   · `detail` is human copy. It may change freely and must never be string-matched.
 *   · `meta`   carries machine-actionable context (which item sold out, when to retry).
 */

export const ErrorCode = {
  // 400
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  // 401
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_REFRESH_REUSED: 'AUTH_REFRESH_REUSED',
  AUTH_CREDENTIALS_INVALID: 'AUTH_CREDENTIALS_INVALID',
  // 403
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  // 404
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  // 409
  ORDER_TRANSITION_INVALID: 'ORDER_TRANSITION_INVALID',
  ORDER_ITEM_OUT_OF_STOCK: 'ORDER_ITEM_OUT_OF_STOCK',
  MENU_VERSION_STALE: 'MENU_VERSION_STALE',
  CAPACITY_EXHAUSTED: 'CAPACITY_EXHAUSTED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  // 422
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  COUPON_INVALID: 'COUPON_INVALID',
  ADDRESS_OUT_OF_ZONE: 'ADDRESS_OUT_OF_ZONE',
  STORE_CLOSED: 'STORE_CLOSED',
  INSUFFICIENT_WALLET_BALANCE: 'INSUFFICIENT_WALLET_BALANCE',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 500 / 503
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PAYMENT_GATEWAY_UNAVAILABLE: 'PAYMENT_GATEWAY_UNAVAILABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCodeValue;

  readonly meta?: Record<string, unknown>;
  readonly fieldErrors?: FieldError[];

  constructor(
    message: string,
    options: { meta?: Record<string, unknown>; fieldErrors?: FieldError[]; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    if (options.meta !== undefined) this.meta = options.meta;
    if (options.fieldErrors !== undefined) this.fieldErrors = options.fieldErrors;
    Error.captureStackTrace?.(this, new.target);
  }
}

/* ── 4xx ─────────────────────────────────────────────────────────────────────────────────────── */

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = ErrorCode.VALIDATION_FAILED;
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  constructor(
    readonly code: ErrorCodeValue = ErrorCode.AUTH_TOKEN_INVALID,
    message = 'Authentication required.',
    options?: { meta?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  constructor(
    readonly code: ErrorCodeValue = ErrorCode.PERMISSION_DENIED,
    message = 'You do not have permission to do that.',
    options?: { meta?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = ErrorCode.RESOURCE_NOT_FOUND;

  /**
   * Note the deliberate vagueness of the default message. Object-level authorisation failures
   * return 404, not 403 — a 403 confirms the resource exists, which leaks order volume and lets
   * an attacker enumerate other customers' orders (09-deployment.md §7).
   */
  constructor(message = 'Not found.', options?: { meta?: Record<string, unknown> }) {
    super(message, options);
  }
}

export class ConflictError extends AppError {
  readonly status = 409;
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    options?: { meta?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

export class UnprocessableError extends AppError {
  readonly status = 422;
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    options?: { meta?: Record<string, unknown>; fieldErrors?: FieldError[] },
  ) {
    super(message, options);
  }
}

export class RateLimitedError extends AppError {
  readonly status = 429;
  readonly code = ErrorCode.RATE_LIMITED;
  constructor(message = 'Too many requests.', readonly retryAfterSeconds = 60) {
    super(message, { meta: { retryAfterSeconds } });
  }
}

/* ── 5xx ─────────────────────────────────────────────────────────────────────────────────────── */

export class InternalError extends AppError {
  readonly status = 500;
  readonly code = ErrorCode.INTERNAL_ERROR;
  constructor(message = 'Something went wrong on our end.', options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ServiceUnavailableError extends AppError {
  readonly status = 503;
  constructor(
    readonly code: ErrorCodeValue = ErrorCode.SERVICE_UNAVAILABLE,
    message = 'Temporarily unavailable. Please try again shortly.',
    options?: { meta?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

/* ── Domain-specific helpers, so call sites read like the business rule ──────────────────────── */

export const OutOfStockError = (productName: string, availableQty = 0) =>
  new ConflictError(
    ErrorCode.ORDER_ITEM_OUT_OF_STOCK,
    `${productName} is sold out for tonight.`,
    { meta: { productName, availableQty } },
  );

export const StoreClosedError = (opensAt: string | null, reason?: string) =>
  new UnprocessableError(
    ErrorCode.STORE_CLOSED,
    reason ?? "We're closed right now.",
    { meta: { opensAt, reason } },
  );

export const OutOfZoneError = () =>
  new UnprocessableError(
    ErrorCode.ADDRESS_OUT_OF_ZONE,
    "You're a little outside our midnight kingdom 🌙",
    { meta: { canRequestExpansion: true } },
  );

export const CapacityExhaustedError = (retryAfterSeconds: number) =>
  new ConflictError(
    ErrorCode.CAPACITY_EXHAUSTED,
    "Kitchen's at capacity. Back in ~15 min 🔥",
    { meta: { retryAfterSeconds } },
  );
