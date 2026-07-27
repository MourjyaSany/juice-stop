import { orderingBlockedMessage, type StoreStatus } from '@juice-stop/core';

/**
 * Explains why ordering is unavailable, wherever the customer is in the app.
 *
 * The important property is that browsing is never interrupted — this is an inline notice, not
 * a modal or a blocking screen. A customer reading the menu at 16:00 is doing something useful;
 * getting in their way to tell them the shop is shut would be actively counterproductive.
 */
export function OrderingBanner({ status }: { status: StoreStatus }) {
  const message = orderingBlockedMessage(status);
  if (message === null) return null;

  const isCapacity = status.orderingBlockedReason === 'CAPACITY_PAUSED';

  return (
    <div
      role="status"
      className="glass flex items-start gap-3 rounded-[14px] px-4 py-3"
      style={{
        borderColor: isCapacity ? 'rgb(239 68 68 / 0.35)' : 'rgb(255 107 26 / 0.30)',
      }}
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-base">
        {isCapacity ? '🔥' : '🌙'}
      </span>
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
        <span className="font-medium text-[var(--color-text-primary)]">
          {isCapacity ? 'Orders paused' : 'Menu open · ordering from 7 PM'}
        </span>
        <br />
        {message}
      </p>
    </div>
  );
}
