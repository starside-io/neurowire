import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/themes/*.ts'],
  format: ['esm'],
  target: 'node24',
  dts: true,
  clean: true,
  // Keep theme modules separate so a per-theme import stays tree-shakeable.
  splitting: false,
  sourcemap: Boolean(options.watch),
}))
