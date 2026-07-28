import type { CartTotals } from '@/store/cart';
import type { OrderLineSnapshot, OrderTotalsSnapshot } from '@/store/orders';

/**
 * Turn priced cart totals into the snapshot an order stores.
 *
 * Shared by checkout and the edit flow so a placed order and an *edited* order can never be
 * snapshotted by two different pieces of code — which is exactly how a bill and a receipt end up
 * disagreeing.
 */
export function snapshotLines(totals: CartTotals): OrderLineSnapshot[] {
  return totals.lines.map((p) => ({
    name: p.item.name,
    variantName: p.item.variants.length > 1 ? p.variant.name : '',
    addOnNames: p.addOnNames,
    quantity: p.line.quantity,
    unitPaiseStr: p.unitPaise.toString(),
    totalPaiseStr: p.totalPaise.toString(),
    note: p.line.note,
  }));
}

export function snapshotTotals(totals: CartTotals): OrderTotalsSnapshot {
  return {
    subtotalPaiseStr: totals.subtotalPaise.toString(),
    deliveryFeePaiseStr: totals.deliveryFeePaise.toString(),
    handlingFeePaiseStr: totals.handlingFeePaise.toString(),
    taxPaiseStr: totals.taxPaise.toString(),
    totalPaiseStr: totals.totalPaise.toString(),
  };
}

/**
 * Honest ETA.
 *
 * Kitchen prep is the **max** across the cart, not the sum — a kitchen cooks in parallel, and
 * summing would quote 40 minutes for four items that finish together. Then packing, then travel
 * inside the complex, all stretched by how busy the kitchen currently is (ADR-013).
 */
export function estimateEtaSeconds(prepSeconds: number, capacityLoad: number): number {
  const PACKING = 120;
  const TRAVEL_IN_COMPLEX = 7 * 60;
  const loadFactor = 1 + capacityLoad * 0.6;
  return Math.round((prepSeconds + PACKING + TRAVEL_IN_COMPLEX) * loadFactor);
}
