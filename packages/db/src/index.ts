/**
 * @juice-stop/db
 *
 * The Prisma client and its types. Application code imports from here, never from the generated
 * directory directly — that indirection lets us move the generator output or add client
 * extensions without touching call sites.
 */

export * from '../generated/client/index.js';
export { Prisma, PrismaClient } from '../generated/client/index.js';
export { buildPrismaOptions, createPrismaClient, type PrismaClientOptions } from './client.js';
