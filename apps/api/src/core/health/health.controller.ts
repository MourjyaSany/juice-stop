import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '../config/config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../cache/redis.service.js';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

const startedAt = Date.now();

/**
 * Health endpoints (04-api-spec.md §10).
 *
 * The distinction between `live` and `ready` is operationally load-bearing:
 *
 *   /health/live   — is the process alive? Touches NOTHING external. A database blip must never
 *                    trigger a container restart storm, which is exactly what happens when a
 *                    liveness probe checks the database.
 *   /health/ready  — can this instance serve traffic? Checks dependencies. A failure pulls the
 *                    instance out of the load balancer while leaving it running to recover.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live(): { status: 'ok'; role: string; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      role: this.config.role,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ok' | 'degraded';
    role: string;
    dependencies: Record<string, DependencyStatus>;
    timestamp: string;
  }> {
    const [database, redis] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);

    // /health/ready is unauthenticated (the load balancer must reach it), so the failure detail
    // must not describe our infrastructure. Driver errors name hosts and ports; that is fine in
    // development and is reconnaissance in production.
    const toStatus = (r: { healthy: boolean; latencyMs: number; error?: string }): DependencyStatus => {
      if (r.healthy) return { status: 'up', latencyMs: r.latencyMs };
      const detail = this.config.isProduction ? 'unreachable' : r.error;
      return { status: 'down', latencyMs: r.latencyMs, ...(detail ? { error: detail } : {}) };
    };

    // Postgres is required to serve traffic. Redis is not — losing it degrades us, it does not
    // stop us, so it must not remove the instance from the load balancer.
    const ready = database.healthy;

    if (!ready) res.status(503);

    return {
      status: ready ? 'ok' : 'degraded',
      role: this.config.role,
      dependencies: { database: toStatus(database), redis: toStatus(redis) },
      timestamp: new Date().toISOString(),
    };
  }
}
