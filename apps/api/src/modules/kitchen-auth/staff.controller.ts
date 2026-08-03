import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { StaffService } from './staff.service.js';
import {
  KitchenAuthGuard,
  RequireRole,
  type RequestWithKitchenSession,
} from './kitchen-auth.guard.js';
import { ValidationError } from '../../core/errors/app-error.js';
import { Throttle } from '../../core/security/rate-limit.guard.js';

const CreateStaffSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(8).max(128),
  role: z.enum(['KITCHEN', 'ADMIN']),
});

const ResetSchema = z.object({
  password: z.string().min(8).max(128),
});

/**
 * Staff registration — owner only.
 *
 * `@RequireRole('ADMIN')` on the controller, so a cook cannot create themselves an owner account
 * by finding the URL. That is the whole reason this is not on the kitchen board: the ability to
 * mint logins is the ability to reach revenue.
 *
 * Every write lands in `AuditLog` with the acting username. Passwords never appear there, in a log
 * line, or in any response — the only way one leaves this server is the moment the owner types it.
 */
@Controller('admin/staff')
@UseGuards(KitchenAuthGuard)
@RequireRole('ADMIN')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  async list() {
    return this.staff.list();
  }

  @Post()
  // Hashing is deliberately slow, so this is also the endpoint that would hurt most under a loop.
  @Throttle(20, 300)
  async create(@Body() body: unknown, @Req() request: RequestWithKitchenSession) {
    const parsed = CreateStaffSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? 'Check the username and password.',
      );
    }
    const username = request.kitchenSession?.username;
    return this.staff.create(parsed.data, username !== undefined ? { username } : {});
  }

  @Post(':id/password')
  @Throttle(20, 300)
  async resetPassword(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithKitchenSession,
  ) {
    const parsed = ResetSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Use at least 8 characters.');
    }
    const username = request.kitchenSession?.username;
    return this.staff.resetPassword(
      id,
      parsed.data.password,
      username !== undefined ? { username } : {},
    );
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string, @Req() request: RequestWithKitchenSession) {
    const username = request.kitchenSession?.username;
    return this.staff.deactivate(id, username !== undefined ? { username } : {});
  }
}
