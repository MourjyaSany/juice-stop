import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service.js';
import { parseEnv, type Env } from './env.schema.js';

export const ENV = Symbol('ENV');

/**
 * Global configuration. Parses and validates the environment exactly once, at bootstrap.
 * If validation fails the process never reaches a listening state.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => parseEnv() },
    { provide: AppConfigService, useFactory: (env: Env) => new AppConfigService(env), inject: [ENV] },
  ],
  exports: [AppConfigService, ENV],
})
export class AppConfigModule {}
