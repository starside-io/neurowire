import { FeedTemplateSchema } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { THEME_KEYS, type ThemeKey, loadTheme, themeMesh } from './index'

// Offline, deterministic validation of the whole catalog. This is the gate that
// "validates all deployments": every theme exists, is well-formed, has at least
// 10 sources, every URL parses, and every tap is a valid FeedTemplate.

const MIN_SOURCES = 10

describe('taps-pack catalog', () => {
  it('has a stable, unique set of theme keys', () => {
    expect(new Set(THEME_KEYS).size).toBe(THEME_KEYS.length)
    expect(THEME_KEYS.length).toBeGreaterThanOrEqual(24)
  })

  for (const key of THEME_KEYS) {
    describe(`theme: ${key}`, () => {
      it('loads, matches its key, and has >= 10 well-formed sources', async () => {
        const theme = await loadTheme(key as ThemeKey)
        expect(theme.key).toBe(key)
        expect(theme.title.trim().length).toBeGreaterThan(0)
        expect(theme.sources.length).toBeGreaterThanOrEqual(MIN_SOURCES)

        const urls = new Set<string>()
        for (const src of theme.sources) {
          expect(src.name.trim().length, `${key}: empty source name`).toBeGreaterThan(0)
          // url parses and is http(s)
          const u = new URL(src.url)
          expect(['http:', 'https:']).toContain(u.protocol)
          // no duplicate urls within a theme
          expect(urls.has(src.url), `${key}: duplicate url ${src.url}`).toBe(false)
          urls.add(src.url)
          // a tap, when present, is a valid FeedTemplate
          if (src.tap) {
            expect(() => FeedTemplateSchema.parse(src.tap)).not.toThrow()
          }
        }
      })

      it('builds a valid mesh', async () => {
        const theme = await loadTheme(key as ThemeKey)
        const mesh = themeMesh(theme)
        expect(mesh.name.length).toBeGreaterThan(0)
        expect(mesh.sources.length).toBe(theme.sources.length)
      })
    })
  }
})
