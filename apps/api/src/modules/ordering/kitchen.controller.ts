import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { OrderingService } from './ordering.service.js';
import { ValidationError } from '../../core/errors/app-error.js';
import { KitchenAuthGuard } from '../kitchen-auth/kitchen-auth.guard.js';

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

  @Post('orders/:id/delivered')
  async delivered(@Param('id') id: string) {
    return this.ordering.transition(id, 'DELIVERED', 'RIDER');
  }
}
