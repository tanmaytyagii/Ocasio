import { defineConfig } from 'vitest/config';

/**
 * The live edge-function suite (tests/edge). Separate from `npm test` because it
 * needs `supabase functions serve` running — see docs/CI_CD.md. It fails, rather
 * than skips, when the functions are not being served.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/edge/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
