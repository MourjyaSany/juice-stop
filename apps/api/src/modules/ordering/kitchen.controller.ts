import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { OrderingService } from './ordering.service.js';
import { ValidationError } from '../../core/errors/app-error.js';
import {
  KitchenAuthGuard,
  type RequestWithKitchenSession,
} from '../kitchen-auth/kitchen-auth.guard.js';

const DeliveredSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, 'The code is four digits.'),
});

/**
 * The bank's own reference for the credit — a UTR for UPI.
 *
 * Optional on purpose. Demanding it would make the common case slow: a cook glancing at a
 * notification that says "₹359.10 received" has the fact but not the twelve-digit reference, and
 * a required field there would either stall the counter or get filled with rubbish. When it is
 * supplied it is worth a great deal at reconciliation time, so there is a place for it.
 */
const ConfirmPaymentSchema = z.object({
  providerRef: z.string().trim().min(4).max(64).optional(),
});

const RejectSchema = z.object({
  reason: z.enum(['OUT_OF_STOCK', 'TOO_BUSY', 'CLOSING_SOON', 'ITEM_ISSUE']),
});

/**
 * Kitchen dashboard API (M3).
 *
 * Every action here is a lifecycle transition, so all of them route through `OrderingService`
 * and the state machine — the controller decides *what* was asked for, never *whether it is
 * legal*. That check lives in one place and cannot be skipped by adding a new endpoint.
 *
 * Auth: `KitchenAuthGuard`, applied to the whole controller so a new endpoint cannot ship
 * unauthenticated by omission. The guard currently sits on development credentials — see
 * `modules/kitchen-auth` — and swapping in real RBAC replaces that module and nothing here.
 */
@Controller('kitchen')
@UseGuards(KitchenAuthGuard)
export class KitchenController {
  constructor(private readonly ordering: OrderingService) {}

  /** Everything still needing kitchen work, oldest first. */
  @Get('queue')
  async queue() {
    const orders = await this.ordering.kitchenQueue();
    return { orders, serverTime: new Date().toISOString() };
  }

  /**
   * Orders waiting on money.
   *
   * Not tickets, and deliberately a separate endpoint from the queue: nothing here is cooked or
   * timed, and folding them into the working columns would put unpaid rows in front of a cook
   * looking for the next thing to make.
   */
  @Get('awaiting-payment')
  async awaitingPayment() {
    const orders = await this.ordering.awaitingPayment();
    return { orders, serverTime: new Date().toISOString() };
  }

  /**
   * Confirm that a UPI payment landed, and release the order to the kitchen.
   *
   * On the direct-UPI path this is a **human assertion**: someone has seen the money arrive in the
   * shop's account and is saying so. The session's username is recorded against the order, because
   * a manual confirmation with no name attached is exactly the sort of thing that becomes an
   * argument at 03:00.
   *
   * Any signed-in staff member may confirm — the person watching the counter phone is usually the
   * cook, and routing this through the owner account would make the fast path slow. The audit trail
   * is what provides accountability here, not a role gate.
   */
  @Post('orders/:id/confirm-payment')
  async confirmPayment(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithKitchenSession,
  ) {
    const parsed = ConfirmPaymentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Check the payment reference.', {
        fieldErrors: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          code: i.code.toUpperCase(),
          message: i.message,
        })),
      });
    }

    const session = request.kitchenSession;
    return this.ordering.confirmPayment(id, session?.role === 'ADMIN' ? 'ADMIN' : 'KITCHEN', {
      confirmedBy: session?.username ?? 'staff',
      ...(parsed.data.providerRef !== undefined ? { providerRef: parsed.data.providerRef } : {}),
    });
  }

  /**
   * Tonight's finished orders — the dashboard's Completed column.
   *
   * Scoped to the business date and capped, because "completed" grows all night and the board
   * only ever shows the tail of it. Unbounded, this endpoint would get slower every hour of a
   * shift, which is the opposite of what a kitchen screen needs.
   */
  @Get('completed')
  async completed() {
    const orders = await this.ordering.kitchenCompleted();
    return { orders, serverTime: new Date().toISOString() };
  }

  @Post('orders/:id/accept')
  async accept(@Param('id') id: string) {
    return this.ordering.transition(id, 'ACCEPTED', 'KITCHEN');
  }

  @Post('orders/:id/start')
  async start(@Param('id') id: string) {
    return this.ordering.transition(id, 'PREPARING', 'KITCHEN');
  }

  @Post('orders/:id/ready')
  async ready(@Param('id') id: string) {
    return this.ordering.transition(id, 'READY', 'KITCHEN');
  }

  /**
   * Step an order back one phase.
   *
   * A single endpoint rather than one per pair: the previous phase is a property of the order's
   * current status, so letting the client name a target would be letting it get that wrong.
   */
  @Post('orders/:id/undo')
  async undo(@Param('id') id: string) {
    return this.ordering.revert(id, 'KITCHEN');
  }

  @Post('orders/:id/reject')
  async reject(@Param('id') id: string, @Body() body: unknown) {
    const parsed = RejectSchema.safeParse(body);
    if (!parsed.success) {
      // A rejection without a reason is unauditable — and rejections are exactly what you want
      // to audit, since each one is a refund and an unhappy customer.
      throw new ValidationError('A rejection reason is required.', {
        fieldErrors: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          code: i.code.toUpperCase(),
          message: i.message,
        })),
      });
    }
    return this.ordering.transition(id, 'REJECTED', 'KITCHEN', parsed.data.reason);
  }

  @Post('orders/:id/out-for-delivery')
  async dispatch(@Param('id') id: string) {
    return this.ordering.transition(id, 'OUT_FOR_DELIVERY', 'RIDER');
  }

  /**
   * Complete an order against the customer's four-digit code.
   *
   * Riders work from this same dashboard — there is no separate rider app, and adding one to hold
   * a single button would be a second deployment, a second login and a second thing to keep in
   * sync for no capability the kitchen tablet does not already have.
   */
  @Post('orders/:id/delivered')
  async delivered(@Param('id') id: string, @Body() body: unknown) {
    const parsed = DeliveredSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Enter the four-digit code from the customer.');
    }
    return this.ordering.completeWithOtp(id, parsed.data.otp, 'RIDER');
  }
}
