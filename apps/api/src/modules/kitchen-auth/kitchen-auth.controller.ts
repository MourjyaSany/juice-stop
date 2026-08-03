import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { KitchenAuthService } from './kitchen-auth.service.js';
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
  constructor(private readonly auth: KitchenAuthService) {}

  @Post('login')
  @KitchenPublic()
  // Two known usernames and a short password: unthrottled, this is a free brute-force target.
  @Throttle(8, 300)
  login(@Body() body: unknown) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Enter a username and password.');

    const { username, password } = parsed.data;
    const role = this.auth.verifyCredentials(username, password);
    if (role === null) {
      // One message for both wrong-user and wrong-password. Distinguishing them turns the login
      // form into a username oracle.
      throw new UnauthorizedError(
        ErrorCode.AUTH_CREDENTIALS_INVALID,
        'Those credentials are not recognised.',
      );
    }

    return this.auth.issueToken(username, role);
  }

  /** Lets the dashboard confirm a stored token is still good before rendering. */
  @Get('session')
  session(@Req() request: RequestWithKitchenSession) {
    return { session: request.kitchenSession };
  }
}
