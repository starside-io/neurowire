import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  dts: true,
  clean: true,
  // Sourcemaps in dev (watch) only, never in the published build.
  sourcemap: Boolean(options.watch),
}))
