import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './core/config/config.module.js';
import { LoggingModule } from './core/logging/logging.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { CacheModule } from './core/cache/cache.module.js';
import { HealthModule } from './core/health/health.module.js';
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { OrderingModule } from './modules/ordering/ordering.module.js';

/**
 * Root module.
 *
 * `core/*` is cross-cutting infrastructure with no domain knowledge. Domain modules (identity,
 * catalog, ordering, kitchen, …) are added from M1 onward and may depend on `core` and on other
 * modules' public service interfaces only — never on their repositories. That boundary is
 * enforced in CI, not by convention (05-folder-structure.md §3).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    CacheModule,
    HealthModule,
    CatalogModule,
    OrderingModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
