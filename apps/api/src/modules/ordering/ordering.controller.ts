import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { OrderingService, type OrderLineInput } from './ordering.service.js';
import { ValidationError } from '../../core/errors/app-error.js';
import { BLOCKS } from './blocks.js';

const LineSchema = z.object({
  itemId: z.string().min(1),
  variantId: z.string().min(1),
  addOnIds: z.array(z.string()).default([]),
  quantity: z.number().int().min(1).max(30),
  note: z.string().max(140).optional(),
});

const AddressSchema = z.object({
  label: z.string().min(1).max(24),
  // The delivery area is not a free-text field. An address outside Abode Valley is not a slow
  // delivery — it is a delivery that cannot happen, so the API refuses it outright.
  block: z.enum(BLOCKS),
  flatOrRoom: z.string().min(1).max(24),
  floor: z.string().max(8).optional(),
  landmark: z.string().max(80).optional(),
  contactName: z.string().min(2).max(60),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
});

const PlaceOrderSchema = z
  .object({
    lines: z.array(LineSchema).min(1).max(30),
    fulfilmentType: z.enum(['DELIVERY', 'TAKEAWAY']).default('DELIVERY'),
    address: AddressSchema.optional(),
    // Cash on delivery is gone. Every method here settles before the kitchen sees the ticket,
    // which removes the entire cash-reconciliation surface along with it.
    paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET']),
    customerNote: z.string().max(140).optional(),
    userId: z.string().optional(),
    // Takeaway has no address to borrow a name from, and a ticket with no name is a bag nobody
    // can be called up for.
    customerName: z.string().min(1).max(60).optional(),
    customerPhone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  })
  // Address is required for delivery and rejected for takeaway. Enforced here rather than in the
  // service so a malformed request never reaches the pricing path at all.
  .superRefine((value, ctx) => {
    if (value.fulfilmentType === 'DELIVERY' && value.address === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'A delivery address is required for delivery orders.',
      });
    }
    if (value.fulfilmentType === 'TAKEAWAY' && value.address !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'Takeaway orders must not carry a delivery address.',
      });
    }
  });

const EditOrderSchema = z.object({ lines: z.array(LineSchema).min(1).max(30) });

@Controller('orders')
export class OrderingController {
  constructor(private readonly ordering: OrderingService) {}

  @Post()
  async place(@Body() body: unknown) {
    const parsed = PlaceOrderSchema.safeParse(body);
    if (!parsed.success) throw toValidationError(parsed.error);

    const input = parsed.data;
    return this.ordering.placeOrder({
      lines: input.lines as OrderLineInput[],
      fulfilmentType: input.fulfilmentType,
      ...(input.address !== undefined ? { address: input.address } : {}),
      paymentMethod: input.paymentMethod,
      ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
      ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone } : {}),
    });
  }

  @Get()
  async list(@Query('userId') userId?: string) {
    return { orders: await this.ordering.listOrders(userId) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.ordering.getOrder(id);
  }

  /** Change an order inside the 10-minute grace window. */
  @Patch(':id')
  async edit(@Param('id') id: string, @Body() body: unknown) {
    const parsed = EditOrderSchema.safeParse(body);
    if (!parsed.success) throw toValidationError(parsed.error);
    return this.ordering.editOrder(id, parsed.data.lines as OrderLineInput[]);
  }
}

function toValidationError(error: z.ZodError): ValidationError {
  return new ValidationError('Some of the submitted values are invalid.', {
    fieldErrors: error.issues.map((i) => ({
      field: i.path.join('.'),
      code: i.code.toUpperCase(),
      message: i.message,
    })),
  });
}
