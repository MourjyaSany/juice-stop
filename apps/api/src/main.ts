import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Load the repo-root .env before anything reads process.env.
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
loadEnv({ quiet: true }); // also honour a local .env if one exists

import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfigService } from './core/config/config.service.js';

/**
 * Bootstrap.
 *
 * One image, three process roles selected by APP_ROLE (ADR-001):
 *   api      — HTTP/REST, stateless, scales horizontally
 *   realtime — Socket.IO gateway, sticky-routed          (M3)
 *   worker   — BullMQ consumers, cron, the outbox relay  (M2)
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    // The raw body is required to verify Razorpay webhook signatures. A parsed-then-verified
    // body is not verified (ADR-005) — so we keep the original bytes.
    rawBody: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(AppConfigService);

  app.setGlobalPrefix('api/v1', {
    exclude: ['health/live', 'health/ready', 'metrics'],
  });

  // CSP is enforced in production; disabled locally so the dev tooling and Storybook can load.
  app.use(
    helmet(
      config.isProduction
        ? { crossOriginEmbedderPolicy: false }
        : { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false },
    ),
  );
  app.use(compression());

  app.enableCors({
    origin: config.http.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Guest-Token',
      'Idempotency-Key',
      'If-Match',
      'X-CSRF-Token',
    ],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 86_400,
  });

  // Drain in-flight requests on SIGTERM rather than dropping them mid-order.
  app.enableShutdownHooks();

  const port = config.http.port;
  await app.listen(port, '0.0.0.0');

  logger.log(
    `Juice Stop API · role=${config.role} · env=${config.raw.NODE_ENV} · http://localhost:${port}`,
    'Bootstrap',
  );
  logger.log(
    `Capacity bands: warn ${config.capacity.warnThreshold * 100}% · pause ${
      config.capacity.pauseThreshold * 100
    }% · strictGpsGating=${config.geo.strictGpsGating}`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  // Configuration errors land here. Print plainly — the Nest logger may not exist yet.
  console.error('\n✖ Failed to start Juice Stop API\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
