import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { KitchenAuthService } from './kitchen-auth.service.js';
import { StaffService } from './staff.service.js';
import {
  KitchenAuthGuard,
  KitchenPublic,
  type RequestWithKitchenSession,
} from './kitchen-auth.guard.js';
import { ErrorCode, UnauthorizedError, ValidationError } from '../../core/errors/app-error.js';
import { Throttle } from '../../core/security/rate-limit.guard.js';

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

@Controller('kitchen/auth')
@UseGuards(KitchenAuthGuard)
export class KitchenAuthController {
  constructor(
    private readonly auth: KitchenAuthService,
    private readonly staff: StaffService,
  ) {}

  @Post('login')
  @KitchenPublic()
  // Two known usernames and a short password: unthrottled, this is a free brute-force target.
  @Throttle(8, 300)
  async login(@Body() body: unknown) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Enter a username and password.');

    const { username, password } = parsed.data;
    const account = await this.staff.verify(username, password);
    if (account === null) {
      // One message for both wrong-user and wrong-password. Distinguishing them turns the login
      // form into a username oracle.
      throw new UnauthorizedError(
        ErrorCode.AUTH_CREDENTIALS_INVALID,
        'Those credentials are not recognised.',
      );
    }

    return this.auth.issueToken(username.trim().toLowerCase(), account.role);
  }

  /** Lets the dashboard confirm a stored token is still good before rendering. */
  @Get('session')
  session(@Req() request: RequestWithKitchenSession) {
    return { session: request.kitchenSession };
  }
}
