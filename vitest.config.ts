import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/__fixtures__/**',
        '**/test-fixtures.ts',
        // Thin process/server entrypoints: argv parsing, fs, network, and serve()
        // orchestration. Their pure logic is extracted and tested (pipeline.ts,
        // cli-helpers.ts, app.ts); the entrypoints themselves are out of scope.
        'packages/api/src/index.ts',
        'packages/cli/src/index.ts',
        'packages/web/src/cli.ts',
      ],
      thresholds: {
        // core and taps are held at full statement / line / function coverage.
        'packages/core/src/**': { statements: 100, functions: 100, lines: 100 },
        'packages/taps/src/**': { statements: 100, functions: 100, lines: 100 },
        'packages/ingest/src/**': { statements: 90, functions: 95, lines: 90 },
        // The runnable surfaces, gated modestly (ratchet up later).
        'packages/api/src/**': { statements: 85, functions: 85, lines: 85 },
        'packages/cli/src/**': { statements: 80, functions: 85, lines: 80 },
        'packages/web/src/**': { statements: 85, functions: 85, lines: 85 },
      },
    },
  },
})
