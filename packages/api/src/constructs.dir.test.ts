import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listConstructNames, resolveConstruct } from './constructs'

let dir: string
const prev = process.env.NEUROWIRE_CONSTRUCTS

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nw-constructs-'))
  process.env.NEUROWIRE_CONSTRUCTS = dir
})

afterEach(() => {
  // delete is the only way to truly unset an env var (assigning undefined
  // coerces to the string "undefined").
  // biome-ignore lint/performance/noDelete: restoring an unset env var
  if (prev === undefined) delete process.env.NEUROWIRE_CONSTRUCTS
  else process.env.NEUROWIRE_CONSTRUCTS = prev
  rmSync(dir, { recursive: true, force: true })
})

const construct = (name: string) =>
  JSON.stringify({ name, meshes: [{ name: 'M', sources: [{ name: 's', url: 'https://s' }] }] })

describe('resolveConstruct from a directory', () => {
  it('resolves a <name>.json file', () => {
    writeFileSync(join(dir, 'weekly.json'), construct('Weekly'))
    expect(resolveConstruct('weekly')?.name).toBe('Weekly')
  })

  it('resolves a <name>.construct.json file', () => {
    writeFileSync(join(dir, 'mine.construct.json'), construct('Mine'))
    expect(resolveConstruct('mine')?.name).toBe('Mine')
  })

  it('still falls back to a bundled construct when nothing on disk matches', () => {
    expect(resolveConstruct('daily')?.name).toBe('Daily Brief')
  })
})

describe('listConstructNames from a directory', () => {
  it('includes both bundled and on-disk constructs, sorted and de-duplicated', () => {
    writeFileSync(join(dir, 'alpha.json'), construct('Alpha'))
    writeFileSync(join(dir, 'beta.construct.json'), construct('Beta'))
    writeFileSync(join(dir, 'notes.txt'), 'ignored')
    const names = listConstructNames()
    expect(names).toContain('alpha')
    expect(names).toContain('beta')
    expect(names).toContain('daily')
    expect(names).not.toContain('notes')
    expect([...names]).toEqual([...names].sort())
  })

  it('skips a non-existent directory without throwing', () => {
    process.env.NEUROWIRE_CONSTRUCTS = join(dir, 'does-not-exist')
    expect(listConstructNames()).toContain('daily')
  })
})
