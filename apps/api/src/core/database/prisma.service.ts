import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { buildPrismaOptions, PrismaClient } from '@juice-stop/db';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../config/config.service.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private connected = false;

  constructor(config: AppConfigService, private readonly logger: PinoLogger) {
    super(
      buildPrismaOptions({
        databaseUrl: config.database.url,
        logQueries: config.isDevelopment,
        statementTimeoutMs: config.database.statementTimeoutMs,
      }),
    );
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.info('Database connected');
    } catch (error) {
      // Deliberately non-fatal.
      //
      // If Postgres is briefly unavailable during a deploy we want the process to start and
      // report NOT READY on /health/ready so the load balancer holds traffic — rather than
      // crash-loop, which turns a 20-second blip into a restart storm.
      this.connected = false;
      this.logger.error(
        { err: error },
        'Database unavailable at boot — starting in NOT READY state',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.connected = false;
  }

  /** Cheap probe used by /health/ready. */
  async isHealthy(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const started = performance.now();
    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      return { healthy: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      this.connected = false;
      return {
        healthy: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
