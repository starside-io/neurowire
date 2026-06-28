import { fetchFeed } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { THEME_KEYS, type ThemeKey, loadTheme } from './index'

// Opt-in live validation (network). Run with NEUROWIRE_LIVE=1, e.g. `pnpm test:live`.
// Every source in every theme is fetched and must resolve to at least one entry.
// This is the end-to-end check that all catalog "deployments" actually work; it
// is gated so the default offline suite stays deterministic.
const live = describe.skipIf(!process.env.NEUROWIRE_LIVE)

live('taps-pack catalog (live)', () => {
  for (const key of THEME_KEYS) {
    describe(`theme: ${key}`, () => {
      it('every source resolves to a feed with entries', async () => {
        const theme = await loadTheme(key as ThemeKey)
        const failures: string[] = []

        for (const src of theme.sources) {
          try {
            const feed = await fetchFeed(src.url, src.tap ? { template: src.tap } : undefined)
            if (feed.entries.length === 0) {
              failures.push(`${src.name} (${src.url}): 0 entries`)
            }
          } catch (err) {
            failures.push(`${src.name} (${src.url}): ${(err as Error).message}`)
          }
        }

        expect(failures, `\n${failures.join('\n')}`).toEqual([])
      }, 120_000)
    })
  }
})
