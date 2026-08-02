import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  Money,
  toBusinessDate,
  COMMERCIAL_TERMS,
  UNAMBIGUOUS_ALPHABET,
  formatOrderNumber,
  formatPickupToken,
  type FulfilmentType,
  type Paise,
  type PaymentMethod,
} from '@juice-stop/core';
import { PrismaService } from '../../core/database/prisma.service.js';
import { RealtimeService } from '../../core/events/realtime.service.js';
import { InventoryService } from '../kitchen/inventory.service.js';
import {
  ConflictError,
  ErrorCode,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from '../../core/errors/app-error.js';
import {
  canTransition,
  isTerminal,
  previousStatus,
  KITCHEN_ACTIVE,
  type ActorRole,
  type OrderStatus,
} from './order-state-machine.js';

export const EDIT_WINDOW_MS = 10 * 60 * 1000;

export interface OrderLineInput {
  itemId: string;
  variantId: string;
  addOnIds: string[];
  quantity: number;
  note?: string;
}

// Both defined once in @juice-stop/core and re-exported so existing importers keep working.
export type { PaymentMethod, FulfilmentType };

export interface DeliveryAddressInput {
  label: string;
  block: string;
  flatOrRoom: string;
  // Explicit `| undefined`: exactOptionalPropertyTypes separates "absent" from "present and
  // undefined", and Zod's `.optional()` produces the latter.
  floor?: string | undefined;
  landmark?: string | undefined;
  contactName: string;
  contactPhone: string;
}

export interface PlaceOrderInput {
  lines: OrderLineInput[];
  fulfilmentType: FulfilmentType;
  /** Required for DELIVERY, absent for TAKEAWAY. Enforced by the controller schema. */
  address?: DeliveryAddressInput | undefined;
  paymentMethod: PaymentMethod;
  customerNote?: string;
  userId?: string;
  /** Shown on the kitchen ticket. Falls back to the delivery contact for delivery orders. */
  customerName?: string | undefined;
  customerPhone?: string | undefined;
}

interface PricedLine {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  addOnNames: string[];
  unitPaise: Paise;
  quantity: number;
  linePaise: Paise;
  note: string;
  prepSeconds: number;
}

@Injectable()
export class OrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Price a set of lines **from the database**.
   *
   * The client never supplies prices — it supplies identifiers, and the server looks up what
   * they actually cost. Anything else is an open invitation to buy a ₹499 combo for ₹1, and it
   * is the single most common serious flaw in hand-rolled checkout code.
   */
  private async priceLines(lines: OrderLineInput[]): Promise<PricedLine[]> {
    if (lines.length === 0) throw new ValidationError('An order needs at least one item.');

    const products = await this.prisma.product.findMany({
      where: { id: { in: lines.map((l) => l.itemId) }, deletedAt: null },
      include: { variants: true, addOns: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return lines.map((line) => {
      const product = byId.get(line.itemId);
      if (product === undefined) {
        throw new UnprocessableError(
          ErrorCode.VALIDATION_FAILED,
          'One of the items is no longer on the menu.',
          { meta: { itemId: line.itemId } },
        );
      }
      if (!product.inStock) {
        throw new ConflictError(
          ErrorCode.ORDER_ITEM_OUT_OF_STOCK,
          `${product.name} is sold out for tonight.`,
          { meta: { itemId: product.id, name: product.name } },
        );
      }

      const variant = product.variants.find((v) => v.id === line.variantId);
      if (variant === undefined) {
        throw new UnprocessableError(
          ErrorCode.VALIDATION_FAILED,
          `That size of ${product.name} is not available.`,
        );
      }
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 30) {
        throw new ValidationError('Quantity must be between 1 and 30.');
      }

      const chosenAddOns = product.addOns.filter((a) => line.addOnIds.includes(a.id));
      const addOnTotal = Money.sum(
        chosenAddOns.map((a) => {
          if (a.priceByVariantJson !== null) {
            const map = JSON.parse(a.priceByVariantJson) as Record<string, string>;
            const raw = map[variant.id];
            return raw !== undefined ? Money.paise(BigInt(raw)) : Money.ZERO;
          }
          return a.pricePaise !== null ? Money.paise(a.pricePaise) : Money.ZERO;
        }),
      );

      const unitPaise = Money.add(Money.paise(variant.pricePaise), addOnTotal);

      return {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        variantName: product.variants.length > 1 ? variant.name : '',
        addOnNames: chosenAddOns.map((a) => a.name),
        unitPaise,
        quantity: line.quantity,
        linePaise: Money.multiply(unitPaise, line.quantity),
        note: line.note ?? '',
        prepSeconds: product.prepTimeSeconds,
      };
    });
  }

  private totalsFor(priced: PricedLine[]) {
    const subtotalPaise = Money.sum(priced.map((p) => p.linePaise));
    const deliveryFeePaise = COMMERCIAL_TERMS.deliveryFeePaise;
    const handlingFeePaise = COMMERCIAL_TERMS.handlingFeePaise;
    const taxableBase = Money.add(subtotalPaise, Money.add(deliveryFeePaise, handlingFeePaise));
    const taxPaise = Money.percentOf(taxableBase, COMMERCIAL_TERMS.gstRateBps);

    return {
      subtotalPaise,
      deliveryFeePaise,
      handlingFeePaise,
      taxPaise,
      totalPaise: Money.add(taxableBase, taxPaise),
      // The kitchen cooks in parallel, so the slowest item sets the pace — summing would quote
      // 40 minutes for four things that finish together.
      prepSeconds: priced.reduce((max, p) => Math.max(max, p.prepSeconds), 0),
    };
  }

  async placeOrder(input: PlaceOrderInput) {
    const priced = await this.priceLines(input.lines);
    const totals = this.totalsFor(priced);

    if (totals.subtotalPaise < COMMERCIAL_TERMS.minOrderPaise) {
      throw new UnprocessableError(
        ErrorCode.VALIDATION_FAILED,
        `Minimum order is ${Money.format(COMMERCIAL_TERMS.minOrderPaise)}.`,
        { meta: { shortfallPaise: (COMMERCIAL_TERMS.minOrderPaise - totals.subtotalPaise).toString() } },
      );
    }

    const takeaway = input.fulfilmentType === 'TAKEAWAY';

    if (!takeaway && input.address === undefined) {
      throw new ValidationError('A delivery address is required for delivery orders.');
    }

    const now = new Date();
    const editableUntil = new Date(now.getTime() + EDIT_WINDOW_MS);

    // Cooking starts when the order stops being changeable, so the promise is honest rather than
    // optimistic by exactly the length of the edit window. Takeaway skips travel entirely — the
    // customer is the courier — which is the whole reason it arrives sooner.
    const travelSeconds = takeaway ? 0 : 7 * 60;
    const etaSeconds = Math.round((totals.prepSeconds + 120 + travelSeconds) * 1.2);
    const promisedAt = new Date(editableUntil.getTime() + etaSeconds * 1000);

    const otp = String(randomInt(1000, 10_000));
    // Server-minted: a client-generated collection code proves nothing at the counter, exactly
    // like the delivery OTP. Ambiguous characters are excluded so it can be read aloud over a
    // noisy counter without "is that a zero or an O?".
    const pickupToken = takeaway ? mintPickupToken() : null;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          outletId: 'outlet-main',
          orderNumber: makeOrderNumber(now),
          businessDate: toBusinessDate(now),
          userId: input.userId ?? null,
          status: 'PLACED',
          fulfilmentType: input.fulfilmentType,
          addressJson: takeaway ? null : JSON.stringify(input.address),
          pickupToken,
          subtotalPaise: totals.subtotalPaise,
          deliveryFeePaise: totals.deliveryFeePaise,
          handlingFeePaise: totals.handlingFeePaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          paymentMethod: input.paymentMethod,
          // With cash removed, every order is settled before the kitchen sees it.
          paymentStatus: 'PAID',
          placedAt: now,
          editableUntil,
          promisedAt,
          prepSeconds: totals.prepSeconds,
          // The address contact is the fallback rather than the source: takeaway has no address,
          // and the kitchen must never have to parse an address blob to read a name off a ticket.
          customerName: input.customerName ?? input.address?.contactName ?? null,
          customerPhone: input.customerPhone ?? input.address?.contactPhone ?? null,
          customerNote: input.customerNote ?? null,
          // Only the hash is stored — the plaintext goes to the customer and nowhere else.
          otpHash: sha256(otp),
          items: {
            create: priced.map((p) => ({
              productId: p.productId,
              variantId: p.variantId,
              nameSnapshot: p.name,
              variantNameSnapshot: p.variantName,
              addOnsJson: JSON.stringify(p.addOnNames),
              unitPricePaise: p.unitPaise,
              quantity: p.quantity,
              lineTotalPaise: p.linePaise,
              note: p.note,
            })),
          },
          events: { create: { toStatus: 'PLACED', actorRole: 'CUSTOMER' } },
        },
        include: { items: true },
      });

      // Written inside the transaction (ADR-006) — a socket event must never fire for a
      // transaction that later rolls back, or the kitchen cooks a ghost order.
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'order',
          aggregateId: created.id,
          eventType: 'order.placed',
          payload: JSON.stringify({ orderId: created.id, orderNumber: created.orderNumber }),
        },
      });

      return created;
    });

    // Both of these run *after* the commit, deliberately. An outbox row inside the transaction is
    // what guarantees the event is not lost (ADR-006); this is the fast path that makes the
    // kitchen light up immediately, and it must never be able to roll the order back.
    const serialised = serialiseOrder(order);
    this.realtime.publish('order.placed', order.id, { order: serialised });
    await this.inventory.consume(
      priced.map((p) => ({ productId: p.productId, quantity: p.quantity })),
    );

    // OTP and pickup token are returned once, here, and never stored in plaintext or re-served.
    return { order: serialised, otp, pickupToken };
  }

  /** Apply an edit inside the grace window. */
  async editOrder(orderId: string, lines: OrderLineInput[]) {
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (existing === null) throw new NotFoundError('Order not found.');

    // Checked server-side, not just in the UI — a tab left open past the deadline would
    // otherwise still be able to change an order the kitchen has already started.
    if (Date.now() >= existing.editableUntil.getTime()) {
      throw new ConflictError(
        ErrorCode.ORDER_TRANSITION_INVALID,
        'The edit window has closed — this order is already being prepared.',
        { meta: { editableUntil: existing.editableUntil.toISOString() } },
      );
    }
    if (isTerminal(existing.status)) {
      throw new ConflictError(ErrorCode.ORDER_TRANSITION_INVALID, 'This order is already closed.');
    }

    const priced = await this.priceLines(lines);
    const totals = this.totalsFor(priced);

    if (totals.subtotalPaise < COMMERCIAL_TERMS.minOrderPaise) {
      throw new UnprocessableError(
        ErrorCode.VALIDATION_FAILED,
        `Minimum order is ${Money.format(COMMERCIAL_TERMS.minOrderPaise)}.`,
      );
    }

    const etaSeconds = Math.round((totals.prepSeconds + 120 + 7 * 60) * 1.2);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId } });
      return tx.order.update({
        where: { id: orderId },
        data: {
          subtotalPaise: totals.subtotalPaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          prepSeconds: totals.prepSeconds,
          // Re-quoted: adding a pizza to a Maggi order genuinely changes when it can arrive.
          promisedAt: new Date(existing.editableUntil.getTime() + etaSeconds * 1000),
          editCount: { increment: 1 },
          version: { increment: 1 },
          items: {
            create: priced.map((p) => ({
              productId: p.productId,
              variantId: p.variantId,
              nameSnapshot: p.name,
              variantNameSnapshot: p.variantName,
              addOnsJson: JSON.stringify(p.addOnNames),
              unitPricePaise: p.unitPaise,
              quantity: p.quantity,
              lineTotalPaise: p.linePaise,
              note: p.note,
            })),
          },
        },
        include: { items: true },
      });
    });

    return serialiseOrder(updated);
  }

  async listOrders(userId?: string) {
    const orders = await this.prisma.order.findMany({
      ...(userId !== undefined ? { where: { userId } } : {}),
      orderBy: { placedAt: 'desc' },
      take: 50,
      include: { items: true },
    });
    return orders.map(serialiseOrder);
  }

  async getOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (order === null) throw new NotFoundError('Order not found.');
    return serialiseOrder(order);
  }

  /** The kitchen queue — everything still needing work, oldest first. */
  async kitchenQueue() {
    const orders = await this.prisma.order.findMany({
      // Spread because the shared constant is readonly — that immutability is the point, since a
      // caller mutating the queue definition would silently change what every other caller sees.
      where: { status: { in: [...KITCHEN_ACTIVE] } },
      orderBy: { placedAt: 'asc' },
      include: { items: true },
    });
    return orders.map(serialiseOrder);
  }

  /**
   * Tonight's finished orders, newest first.
   *
   * Keyed on `businessDate` rather than a timestamp range, so the list does not reset at midnight
   * in the middle of a shift (ADR-010).
   */
  async kitchenCompleted(limit = 40) {
    const orders = await this.prisma.order.findMany({
      where: {
        businessDate: toBusinessDate(new Date()),
        status: { in: ['OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { items: true },
    });
    return orders.map(serialiseOrder);
  }

  /**
   * Step an order back one phase.
   *
   * Routed through `transition` like every other move, so an undo is subject to the same legality
   * check and writes the same audit row. It is a correction, not an erasure — "READY at 01:12,
   * back to PREPARING at 01:12" is exactly the history a shift review needs to see.
   */
  async revert(orderId: string, actor: ActorRole) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (order === null) throw new NotFoundError('Order not found.');

    const target = previousStatus(order.status);
    if (target === undefined) {
      throw new ConflictError(
        ErrorCode.ORDER_TRANSITION_INVALID,
        `A ${order.status.toLowerCase()} order cannot be moved back.`,
        { meta: { currentStatus: order.status } },
      );
    }

    return this.transition(orderId, target, actor, 'UNDO');
  }

  /**
   * Customer closes their own edit window early — "I'm sure, cook it now".
   *
   * The kitchen is blocked from starting while an order can still change, and that block is
   * enforced server-side. So a customer confirming early has to move the server's deadline, not
   * just the one in their browser; otherwise the cook keeps staring at a countdown for an order
   * the customer has already committed to.
   */
  async confirmNow(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (order === null) throw new NotFoundError('Order not found.');
    if (isTerminal(order.status)) {
      throw new ConflictError(ErrorCode.ORDER_TRANSITION_INVALID, 'This order is already closed.');
    }

    const now = new Date();
    // Idempotent: confirming twice, or after the window has lapsed on its own, is a no-op rather
    // than an error. A double-tap on a phone must not produce a red banner.
    if (order.editableUntil.getTime() <= now.getTime()) {
      return serialiseOrder(
        await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }),
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { editableUntil: now, version: { increment: 1 } },
      include: { items: true },
    });

    const serialised = serialiseOrder(updated);
    // Status has not changed, but what the kitchen may *do* has. Without this the board would sit
    // on a stale countdown until its next 15-second reconcile.
    this.realtime.publish('order.status_changed', orderId, {
      order: serialised,
      from: order.status,
      to: order.status,
      actor: 'CUSTOMER',
      reason: 'EDIT_WINDOW_CLOSED',
    });

    return serialised;
  }

  /**
   * Complete a delivery, against the customer's code.
   *
   * The rider has to read the OTP off the customer's phone and type it here. That is the whole
   * point: "Delivered" pressed from a scooter two streets away is the single easiest way for an
   * order to be marked complete and never arrive, and a button alone cannot tell the difference.
   *
   * Only the sha256 is stored, so this compares hashes — the plaintext exists on the customer's
   * device and nowhere on the server. Comparison is constant-time; a four-digit code is small
   * enough that a timing oracle would meaningfully help.
   */
  async completeWithOtp(orderId: string, otp: string, actor: ActorRole) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { otpHash: true, status: true },
    });
    if (order === null) throw new NotFoundError('Order not found.');

    const supplied = Buffer.from(sha256(otp.trim()));
    const expected = Buffer.from(order.otpHash);
    const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);

    if (!matches) {
      throw new UnprocessableError(
        ErrorCode.VALIDATION_FAILED,
        'That code does not match. Ask the customer to read it from their order screen.',
      );
    }

    return this.transition(orderId, 'DELIVERED', actor);
  }

  /** Move an order through the lifecycle. The only path that writes `status`. */
  async transition(orderId: string, to: OrderStatus, actor: ActorRole, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (order === null) throw new NotFoundError('Order not found.');

    const check = canTransition(order.status, to, actor);
    if (!check.ok) {
      throw new ConflictError(ErrorCode.ORDER_TRANSITION_INVALID, check.reason ?? 'Invalid move.', {
        meta: { currentStatus: order.status, attempted: to },
      });
    }

    // The kitchen must not start cooking something the customer can still change.
    if (to === 'PREPARING' && Date.now() < order.editableUntil.getTime()) {
      throw new ConflictError(
        ErrorCode.ORDER_TRANSITION_INVALID,
        'This order is still inside the customer edit window.',
        { meta: { editableUntil: order.editableUntil.toISOString() } },
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: orderId },
        data: {
          status: to,
          version: { increment: 1 },
          // The customer's countdown restarts from this instant on every phase change, so it is
          // stamped here — in the one method that writes `status` — and can never drift from it.
          statusChangedAt: new Date(),
          ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
        include: { items: true },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: to,
          actorRole: actor,
          reason: reason ?? null,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'order',
          aggregateId: orderId,
          eventType: 'order.status_changed',
          payload: JSON.stringify({ orderId, from: order.status, to, actor }),
        },
      });

      return next;
    });

    const serialised = serialiseOrder(updated);
    this.realtime.publish('order.status_changed', orderId, {
      order: serialised,
      from: order.status,
      to,
      actor,
    });
    return serialised;
  }
}

/* ── Helpers ────────────────────────────────────────────────────────────────────────────────── */

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Six-character collection code, e.g. `JS-4KQ9`.
 *
 * The alphabet omits I, O, 0, 1, S and 5 — a code read aloud across a busy counter must not
 * hinge on whether that was a zero or an O. Same reasoning as the block letters we skip.
 */
function mintPickupToken(): string {
  // randomInt is cryptographically strong; the shared formatter owns the alphabet so the server
  // and the storefront can never drift on which characters are legible.
  return formatPickupToken(() => randomInt(0, UNAMBIGUOUS_ALPHABET.length) / UNAMBIGUOUS_ALPHABET.length);
}

const makeOrderNumber = (at: Date): string => formatOrderNumber(at, randomInt(1000, 10_000));

/** Money leaves as decimal strings of paise — `bigint` has no JSON representation (ADR-003). */
function serialiseOrder(order: {
  id: string;
  orderNumber: string;
  businessDate: string;
  status: string;
  fulfilmentType: string;
  addressJson: string | null;
  pickupToken: string | null;
  subtotalPaise: bigint;
  deliveryFeePaise: bigint;
  handlingFeePaise: bigint;
  taxPaise: bigint;
  totalPaise: bigint;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: Date;
  statusChangedAt: Date;
  editableUntil: Date;
  promisedAt: Date;
  prepSeconds: number;
  editCount: number;
  customerName: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  items?: Array<{
    nameSnapshot: string;
    variantNameSnapshot: string | null;
    addOnsJson: string;
    unitPricePaise: bigint;
    quantity: number;
    lineTotalPaise: bigint;
    note: string | null;
  }>;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    businessDate: order.businessDate,
    status: order.status,
    fulfilmentType: order.fulfilmentType,
    // Null for takeaway — there is no address, and emitting an empty object would make every
    // consumer guess whether the delivery details simply failed to load.
    address:
      order.addressJson !== null
        ? (JSON.parse(order.addressJson) as Record<string, string>)
        : null,
    pickupToken: order.pickupToken,
    subtotalPaise: order.subtotalPaise.toString(),
    deliveryFeePaise: order.deliveryFeePaise.toString(),
    handlingFeePaise: order.handlingFeePaise.toString(),
    taxPaise: order.taxPaise.toString(),
    totalPaise: order.totalPaise.toString(),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt.toISOString(),
    statusChangedAt: order.statusChangedAt.toISOString(),
    editableUntil: order.editableUntil.toISOString(),
    promisedAt: order.promisedAt.toISOString(),
    prepSeconds: order.prepSeconds,
    editCount: order.editCount,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerNote: order.customerNote,
    items: (order.items ?? []).map((i) => ({
      name: i.nameSnapshot,
      variantName: i.variantNameSnapshot ?? '',
      addOnNames: JSON.parse(i.addOnsJson) as string[],
      unitPricePaise: i.unitPricePaise.toString(),
      quantity: i.quantity,
      lineTotalPaise: i.lineTotalPaise.toString(),
      note: i.note ?? '',
    })),
  };
}
