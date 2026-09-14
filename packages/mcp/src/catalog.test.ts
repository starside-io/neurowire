import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCatalog } from './catalog'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'nw-mcp-catalog-'))
  const extraMeshes = join(root, 'extra-meshes')
  mkdirSync(extraMeshes)
  mkdirSync(join(root, 'neurowire', 'meshes'), { recursive: true })
  mkdirSync(join(root, 'neurowire', 'constructs'), { recursive: true })
  const mesh = (name: string) =>
    JSON.stringify({ name, sources: [{ name: 'S', url: 'https://s.test/' }] })
  writeFileSync(join(extraMeshes, 'mine.mesh.json'), mesh('Mine'))
  writeFileSync(join(root, 'neurowire', 'meshes', 'plain.json'), mesh('Plain'))
  writeFileSync(join(root, 'neurowire', 'meshes', 'notes.txt'), 'ignored')
  writeFileSync(
    join(root, 'neurowire', 'constructs', 'weekly.construct.json'),
    JSON.stringify({ name: 'Weekly', meshes: [{ ref: 'mine' }] }),
  )
  return createCatalog({ env: { XDG_CONFIG_HOME: root, NEUROWIRE_MESHES: `${extraMeshes},` } })
}

describe('catalog', () => {
  it('lists user meshes, bundled meshes, and taps-pack themes', () => {
    const names = setup().meshNames()
    expect(names).toEqual(expect.arrayContaining(['mine', 'plain', 'ai-news', 'anime']))
    expect(names).toEqual([...names].sort())
  })

  it('resolves meshes from the env dirs, the config dir, the bundle, then themes', async () => {
    const catalog = setup()
    expect((await catalog.mesh('mine'))?.name).toBe('Mine')
    expect((await catalog.mesh('plain'))?.name).toBe('Plain')
    expect((await catalog.mesh('ai-news'))?.name).toBe('AI News')
    expect((await catalog.mesh('anime'))?.sources.length).toBeGreaterThan(0)
    expect(await catalog.mesh('missing')).toBeUndefined()
  })

  it('rejects path-like names', async () => {
    const catalog = setup()
    expect(await catalog.mesh('../etc')).toBeUndefined()
    expect(await catalog.mesh('a..b')).toBeUndefined()
    expect(catalog.construct('../x')).toBeUndefined()
  })

  it('lists and resolves constructs, user dir first then the bundle', () => {
    const catalog = setup()
    expect(catalog.constructNames()).toEqual(['daily', 'weekly'])
    expect(catalog.construct('weekly')?.name).toBe('Weekly')
    expect(catalog.construct('daily')?.name).toBe('Daily Brief')
    expect(catalog.construct('nope')).toBeUndefined()
  })

  it('defaults to process.env and tolerates missing directories', () => {
    const catalog = createCatalog({ env: { XDG_CONFIG_HOME: join(tmpdir(), 'nw-mcp-absent') } })
    expect(catalog.constructNames()).toEqual(['daily'])
    expect(createCatalog().meshNames()).toContain('ai-news')
  })
})
