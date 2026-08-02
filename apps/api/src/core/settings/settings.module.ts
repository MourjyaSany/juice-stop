import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';

/** Global: settings are cross-cutting configuration, not a feature any one module owns. */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
