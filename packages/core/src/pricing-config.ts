/**
 * Commercial rules.
 *
 * Single source of truth for the storefront, the pricing engine and the API. These are business
 * decisions, not styling — they live in `core` so a change lands everywhere at once and cannot
 * drift between what the customer is shown and what they are charged.
 *
 * From M5 these become admin-editable `settings` rows; the shape here is what that row will hold.
 */

import { paise, type Paise } from './money.js';

/** Delivery is free on every order, in every zone. */
export const DELIVERY_FEE_PAISE: Paise = paise(0);

/** Minimum order value: ₹100. */
export const MIN_ORDER_PAISE: Paise = paise(10_000);

/** Handling / packaging: absorbed, not charged. */
export const HANDLING_FEE_PAISE: Paise = paise(0);

/**
 * GST currently absorbed — the customer pays the menu price and nothing else.
 *
 * NOTE for later: once the business crosses the GST registration threshold, tax becomes a
 * statutory obligation rather than a pricing choice. At that point this is either raised to 500
 * (5% added on top) or menu prices are treated as tax-inclusive and the tax is *extracted* with
 * `Money.taxIncludedIn` for the invoice. Either way it is a one-line change here plus an invoice
 * template — nothing downstream hardcodes the rate.
 */
export const GST_RATE_BPS = 0;

export interface CommercialTerms {
  deliveryFeePaise: Paise;
  minOrderPaise: Paise;
  handlingFeePaise: Paise;
  gstRateBps: number;
  freeDeliveryAlways: boolean;
}

export const COMMERCIAL_TERMS: CommercialTerms = {
  deliveryFeePaise: DELIVERY_FEE_PAISE,
  minOrderPaise: MIN_ORDER_PAISE,
  handlingFeePaise: HANDLING_FEE_PAISE,
  gstRateBps: GST_RATE_BPS,
  freeDeliveryAlways: true,
};

/**
 * Should a charge render as the word "FREE" rather than "₹0.00"?
 *
 * A zero rupee amount reads as an oversight; the word FREE reads as a promise. Customers scan a
 * bill for hidden costs, and this is the line that tells them there are none.
 */
export const isWaived = (amount: Paise): boolean => amount === 0n;

/** Is the cart above the minimum order value? */
export function meetsMinimumOrder(subtotalPaise: Paise, terms = COMMERCIAL_TERMS): boolean {
  return subtotalPaise >= terms.minOrderPaise;
}

/** How much more is needed to reach the minimum. Zero when already met. */
export function shortfallToMinimum(subtotalPaise: Paise, terms = COMMERCIAL_TERMS): Paise {
  const gap = terms.minOrderPaise - subtotalPaise;
  return paise(gap > 0n ? gap : 0n);
}
