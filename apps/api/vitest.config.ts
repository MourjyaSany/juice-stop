import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests run against real Postgres + Redis via Testcontainers and have their own
    // config — they must never be mixed into the fast unit run.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.int.test.ts'],
  },
});
