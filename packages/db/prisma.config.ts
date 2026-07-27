import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env when a config file is present, and the monorepo keeps a single
// .env at the repository root rather than one per package. Load it explicitly.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join(here, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(here, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
});
