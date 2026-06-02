import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultTapsDir, loadTaps, registerAllTaps } from './index'

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('tap loaders', () => {
  it('loadTaps reads every .json file in a directory (single objects and arrays)', () => {
    const hosts = loadTaps(fixturePath('')).map((tap) => tap.host)
    expect(hosts).toContain('example.dev') // custom-tap.json (single object)
    expect(hosts).toContain('one.example') // taps-array.json (array)
    expect(hosts).toContain('two.example')
  })

  it('defaultTapsDir falls back to the home config dir', () => {
    vi.stubEnv('XDG_CONFIG_HOME', undefined)
    expect(defaultTapsDir().endsWith(join('neurowire', 'taps'))).toBe(true)
  })

  it('registerAllTaps skips a missing default directory', () => {
    vi.stubEnv('XDG_CONFIG_HOME', join(tmpdir(), 'nw-does-not-exist-xyz'))
    vi.stubEnv('NEUROWIRE_TAPS', undefined)
    expect(registerAllTaps().user).toEqual([])
  })

  it('registerAllTaps loads the default dir, the env var, and extra paths', () => {
    const base = mkdtempSync(join(tmpdir(), 'nw-'))
    const tapsDir = join(base, 'neurowire', 'taps')
    mkdirSync(tapsDir, { recursive: true })
    writeFileSync(
      join(tapsDir, 'd.json'),
      JSON.stringify({ host: 'from-dir.example', item: '.post', title: 'h2', link: 'a' }),
    )
    vi.stubEnv('XDG_CONFIG_HOME', base)
    vi.stubEnv('NEUROWIRE_TAPS', fixturePath('custom-tap.json'))
    try {
      const hosts = registerAllTaps([fixturePath('taps-array.json')]).user.map((tap) => tap.host)
      expect(hosts).toContain('from-dir.example') // default dir
      expect(hosts).toContain('example.dev') // env var (file)
      expect(hosts).toContain('one.example') // extra path (array file)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
