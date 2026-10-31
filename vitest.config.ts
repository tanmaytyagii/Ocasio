import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // tests/edge needs live edge functions: `npm run test:edge`.
    exclude: ['e2e/**', 'tests/edge/**'],
    // RLS tests share one database; running files in parallel makes failures
    // non-deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
