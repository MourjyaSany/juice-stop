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

/** Packaging charge, per order. */
export const PACKAGING_FEE_PAISE: Paise = paise(500);

/** GST on restaurant service: 5.00% expressed in basis points. */
export const GST_RATE_BPS = 500;

export interface CommercialTerms {
  deliveryFeePaise: Paise;
  minOrderPaise: Paise;
  packagingFeePaise: Paise;
  gstRateBps: number;
  freeDeliveryAlways: boolean;
}

export const COMMERCIAL_TERMS: CommercialTerms = {
  deliveryFeePaise: DELIVERY_FEE_PAISE,
  minOrderPaise: MIN_ORDER_PAISE,
  packagingFeePaise: PACKAGING_FEE_PAISE,
  gstRateBps: GST_RATE_BPS,
  freeDeliveryAlways: true,
};

/** Is the cart above the minimum order value? */
export function meetsMinimumOrder(subtotalPaise: Paise, terms = COMMERCIAL_TERMS): boolean {
  return subtotalPaise >= terms.minOrderPaise;
}

/** How much more is needed to reach the minimum. Zero when already met. */
export function shortfallToMinimum(subtotalPaise: Paise, terms = COMMERCIAL_TERMS): Paise {
  const gap = terms.minOrderPaise - subtotalPaise;
  return paise(gap > 0n ? gap : 0n);
}
