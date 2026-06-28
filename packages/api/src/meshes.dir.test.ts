import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listMeshNames, resolveMesh } from './meshes'

let dir: string
const prev = process.env.NEUROWIRE_MESHES

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nw-meshes-'))
  process.env.NEUROWIRE_MESHES = dir
})

afterEach(() => {
  // delete is the only way to truly unset an env var (assigning undefined
  // coerces to the string "undefined").
  // biome-ignore lint/performance/noDelete: restoring an unset env var
  if (prev === undefined) delete process.env.NEUROWIRE_MESHES
  else process.env.NEUROWIRE_MESHES = prev
  rmSync(dir, { recursive: true, force: true })
})

const mesh = (name: string) => JSON.stringify({ name, sources: [{ name: 's', url: 'https://s' }] })

describe('resolveMesh from a directory', () => {
  it('resolves a <name>.json file', () => {
    writeFileSync(join(dir, 'custom.json'), mesh('Custom'))
    expect(resolveMesh('custom')?.name).toBe('Custom')
  })

  it('resolves a <name>.mesh.json file', () => {
    writeFileSync(join(dir, 'mine.mesh.json'), mesh('Mine'))
    expect(resolveMesh('mine')?.name).toBe('Mine')
  })

  it('still falls back to a bundled mesh when nothing on disk matches', () => {
    expect(resolveMesh('ai-news')?.name).toBe('AI News')
  })
})

describe('listMeshNames from a directory', () => {
  it('includes both bundled and on-disk meshes, sorted and de-duplicated', () => {
    writeFileSync(join(dir, 'alpha.json'), mesh('Alpha'))
    writeFileSync(join(dir, 'beta.mesh.json'), mesh('Beta'))
    writeFileSync(join(dir, 'notes.txt'), 'ignored')
    const names = listMeshNames()
    expect(names).toContain('alpha')
    expect(names).toContain('beta')
    expect(names).toContain('ai-news')
    expect(names).not.toContain('notes')
    expect([...names]).toEqual([...names].sort())
  })

  it('skips a non-existent directory without throwing', () => {
    process.env.NEUROWIRE_MESHES = join(dir, 'does-not-exist')
    expect(listMeshNames()).toContain('ai-news')
  })
})
