import { Prisma, PrismaClient } from '../generated/client/index.js';

export interface PrismaClientOptions {
  databaseUrl: string;
  /** Emit query timings. Development only — noisy, and it costs latency. */
  logQueries?: boolean;
  /** Abort any statement running longer than this. Prevents one bad query exhausting the pool. */
  statementTimeoutMs?: number;
}

/**
 * Build the constructor options for a Prisma client.
 *
 * Exposed separately from {@link createPrismaClient} so NestJS can pass them straight to
 * `super()` in a `PrismaService extends PrismaClient` — constructing a second client and copying
 * its internals across would leave two connection pools, one of them orphaned.
 *
 * The statement timeout is not optional in spirit: without it, a single unindexed query during
 * service can hold a connection until the pool is exhausted and order placement starts failing.
 */
export function buildPrismaOptions(options: PrismaClientOptions): Prisma.PrismaClientOptions {
  const { databaseUrl, logQueries = false, statementTimeoutMs = 10_000 } = options;

  const url = new URL(databaseUrl);
  url.searchParams.set('statement_timeout', String(statementTimeoutMs));

  const log: Prisma.LogLevel[] = logQueries ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'];

  return {
    datasources: { db: { url: url.toString() } },
    log,
    errorFormat: 'pretty',
  };
}

/**
 * A standalone client, for seeds, migrations and one-off scripts.
 *
 * Note on money: values are `bigint` paise (ADR-003) and `JSON.stringify` throws on `bigint`.
 * We deliberately do NOT patch `BigInt.prototype.toJSON` globally — that would silently coerce
 * money to a string in every payload everywhere. Serialisation happens explicitly at the API
 * boundary instead, so the type stays honest.
 */
export function createPrismaClient(options: PrismaClientOptions): PrismaClient {
  return new PrismaClient(buildPrismaOptions(options));
}
