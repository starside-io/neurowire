import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Shebang so the published `neurowire-api` bin is runnable. Node strips it on import.
  banner: { js: '#!/usr/bin/env node' },
  // Sourcemaps in dev (watch) only, never in the published build.
  sourcemap: Boolean(options.watch),
}))
