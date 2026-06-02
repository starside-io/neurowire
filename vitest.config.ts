import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__fixtures__/**', '**/test-fixtures.ts', 'packages/web/**'],
      thresholds: {
        // core and taps are held at full statement / line / function coverage.
        'packages/core/src/**': { statements: 100, functions: 100, lines: 100 },
        'packages/taps/src/**': { statements: 100, functions: 100, lines: 100 },
        'packages/ingest/src/**': { statements: 90, functions: 95, lines: 90 },
      },
    },
  },
})
