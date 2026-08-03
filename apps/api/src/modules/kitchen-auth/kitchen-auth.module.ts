import { Module } from '@nestjs/common';
import { KitchenAuthService } from './kitchen-auth.service.js';
import { StaffService } from './staff.service.js';
import { StaffController } from './staff.controller.js';
import { KitchenAuthController } from './kitchen-auth.controller.js';
import { KitchenAuthGuard } from './kitchen-auth.guard.js';

/**
 * Staff identity: accounts, passwords, sessions.
 *
 * No longer "development authentication" in the credential sense — accounts live in the database
 * with scrypt-hashed passwords and are managed by the owner. What is still provisional is the
 * *session*: a signed, self-expiring HMAC with no revocation list, so removing an account stops the
 * next sign-in rather than the tab someone already has open.
 *
 * Exported so kitchen controllers can apply the guard.
 */
@Module({
  controllers: [KitchenAuthController, StaffController],
  providers: [KitchenAuthService, StaffService, KitchenAuthGuard],
  exports: [KitchenAuthService, StaffService, KitchenAuthGuard],
})
export class KitchenAuthModule {}
