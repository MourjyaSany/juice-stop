import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { OrderingService } from './ordering.service.js';
import { ValidationError } from '../../core/errors/app-error.js';

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
 * Auth: currently open. RBAC (`kitchen:*` permissions) lands with M1's identity module; this is
 * flagged rather than quietly ignored.
 */
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly ordering: OrderingService) {}

  /** Everything still needing kitchen work, oldest first. */
  @Get('queue')
  async queue() {
    const orders = await this.ordering.kitchenQueue();
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
