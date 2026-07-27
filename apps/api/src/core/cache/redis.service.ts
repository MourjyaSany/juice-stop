import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../config/config.service.js';

/**
 * Redis client.
 *
 * Redis is a **cache and coordination layer, never a source of truth** (README §3 invariant 9).
 * Every consumer must tolerate it being unavailable: cache misses fall through to Postgres,
 * rate limiting falls back to in-memory per-instance counters, sockets degrade to polling.
 * Losing Redis must degrade the service, not stop it.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  private available = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisService.name);

    this.client = new Redis(this.config.redis.url, {
      keyPrefix: `${this.config.redis.keyPrefix}:`,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      // Back off quickly at first, then settle — a tight retry loop against a dead Redis
      // burns CPU we need for order placement.
      retryStrategy: (times) => Math.min(times * 200, 5_000),
      reconnectOnError: (err) => err.message.includes('READONLY'),
    });

    this.client.on('ready', () => {
      this.available = true;
      this.logger.info('Redis connected');
    });
    this.client.on('error', (err: Error) => {
      if (this.available) this.logger.warn({ err }, 'Redis error — degrading gracefully');
      this.available = false;
    });
    this.client.on('close', () => {
      this.available = false;
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      this.available = false;
      this.logger.error({ err: error }, 'Redis unavailable at boot — running in degraded mode');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  get isAvailable(): boolean {
    return this.available;
  }

  async isHealthy(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const started = performance.now();
    try {
      await this.client.ping();
      this.available = true;
      return { healthy: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      this.available = false;
      return {
        healthy: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      };
    }
  }

  /**
   * Read-through cache helper. **Never throws on a Redis failure** — it falls through to the
   * loader, so a Redis outage costs latency rather than availability.
   */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    if (this.available) {
      try {
        const hit = await this.client.get(key);
        if (hit !== null) return JSON.parse(hit) as T;
      } catch (error) {
        this.logger.warn({ err: error, key }, 'Cache read failed — falling through to source');
      }
    }

    const value = await loader();

    if (this.available) {
      try {
        await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch (error) {
        this.logger.warn({ err: error, key }, 'Cache write failed — continuing');
      }
    }

    return value;
  }
}
