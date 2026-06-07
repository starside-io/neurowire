import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConfigMeshResolver, loadMeshFromConfig, meshConfigDirs } from './mesh-config'

const dir = mkdtempSync(join(tmpdir(), 'nw-meshes-'))
writeFileSync(
  join(dir, 'ai-news.json'),
  JSON.stringify({ name: 'AI News', sources: [{ name: 'a', url: 'https://a' }] }),
)
writeFileSync(
  join(dir, 'security.mesh.json'),
  JSON.stringify({ name: 'Security', sources: [{ name: 's', url: 'https://s' }] }),
)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('loadMeshFromConfig', () => {
  it('reads <name>.json and <name>.mesh.json from the dirs', () => {
    expect(loadMeshFromConfig('ai-news', { dirs: [dir] })?.name).toBe('AI News')
    expect(loadMeshFromConfig('security', { dirs: [dir] })?.name).toBe('Security')
  })

  it('returns undefined for missing names and rejects traversal', () => {
    expect(loadMeshFromConfig('nope', { dirs: [dir] })).toBeUndefined()
    expect(loadMeshFromConfig('../secret', { dirs: [dir] })).toBeUndefined()
    expect(loadMeshFromConfig('/etc/passwd', { dirs: [dir] })).toBeUndefined()
  })
})

describe('meshConfigDirs', () => {
  it('combines explicit dirs, the env var, and the default config dir', () => {
    vi.stubEnv('NEUROWIRE_MESHES', '/a:/b')
    vi.stubEnv('XDG_CONFIG_HOME', '/cfg')
    const dirs = meshConfigDirs({ dirs: ['/first'] })
    expect(dirs[0]).toBe('/first')
    expect(dirs).toContain('/a')
    expect(dirs).toContain('/b')
    expect(dirs.at(-1)).toBe('/cfg/neurowire/meshes')
  })

  it('honors a custom env var and subdir', () => {
    vi.stubEnv('MY_MESHES', '/x')
    vi.stubEnv('XDG_CONFIG_HOME', '/cfg')
    const dirs = meshConfigDirs({ envVar: 'MY_MESHES', subdir: 'custom/dir' })
    expect(dirs).toContain('/x')
    expect(dirs.at(-1)).toBe('/cfg/custom/dir')
  })
})

describe('createConfigMeshResolver', () => {
  it('returns a resolver bound to the dirs', () => {
    const resolve = createConfigMeshResolver({ dirs: [dir] })
    expect(resolve('ai-news')?.name).toBe('AI News')
    expect(resolve('nope')).toBeUndefined()
  })
})
