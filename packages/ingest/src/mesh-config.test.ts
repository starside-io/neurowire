import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConfigMeshResolver,
  loadMeshFromConfig,
  meshConfigDirs,
  parseConstructFile,
  parseMeshFile,
  resolveConstructEnv,
  resolveMeshEnv,
} from './mesh-config'

const dir = mkdtempSync(join(tmpdir(), 'nw-meshes-'))
writeFileSync(
  join(dir, 'ai-news.json'),
  JSON.stringify({ name: 'AI News', sources: [{ name: 'a', url: 'https://a' }] }),
)
writeFileSync(
  join(dir, 'security.mesh.json'),
  JSON.stringify({ name: 'Security', sources: [{ name: 's', url: 'https://s' }] }),
)

writeFileSync(
  join(dir, 'private.json'),
  JSON.stringify({
    name: 'Private',
    sources: [
      { name: 'p', url: 'https://p', headers: { authorization: 'Bearer ${NW_TEST_TOKEN}' } },
    ],
  }),
)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveMeshEnv', () => {
  const mesh = {
    name: 'M',
    sources: [
      {
        name: 'a',
        url: 'https://a',
        headers: { authorization: 'Bearer ${TOKEN}', 'x-two': '${ONE}-${TWO}', plain: 'v' },
      },
      { name: 'b', url: 'https://b' },
    ],
  }

  it('substitutes ${VAR} in header values from the given env', () => {
    const out = resolveMeshEnv(mesh, { TOKEN: 't', ONE: '1', TWO: '2' })
    expect(out.sources[0].headers).toEqual({
      authorization: 'Bearer t',
      'x-two': '1-2',
      plain: 'v',
    })
    expect(out.sources[1]).toEqual({ name: 'b', url: 'https://b' })
    // The input is not mutated: the file's placeholder form stays intact.
    expect(mesh.sources[0]?.headers?.authorization).toBe('Bearer ${TOKEN}')
  })

  it('throws naming the mesh, source, header, and variable when one is unset', () => {
    expect(() => resolveMeshEnv(mesh, { TOKEN: 't', ONE: '1' })).toThrow(
      /Mesh "M": source "a" header "x-two" references unset environment variable TWO/,
    )
    expect(() => resolveMeshEnv(mesh, { TOKEN: '', ONE: '1', TWO: '2' })).toThrow(/TOKEN/)
  })

  it('defaults to process.env', () => {
    vi.stubEnv('TOKEN', 'from-process')
    vi.stubEnv('ONE', '1')
    vi.stubEnv('TWO', '2')
    expect(resolveMeshEnv(mesh).sources[0].headers?.authorization).toBe('Bearer from-process')
  })
})

describe('resolveConstructEnv and parseConstructFile', () => {
  it('resolves inline meshes and leaves refs alone', () => {
    const construct = {
      name: 'C',
      meshes: [
        { ref: 'news' },
        { name: 'M', sources: [{ name: 'a', url: 'https://a', headers: { k: '${T}' } }] },
      ],
    }
    const out = resolveConstructEnv(construct, { T: 'x' })
    expect(out.meshes[0]).toEqual({ ref: 'news' })
    expect(out.meshes[1]).toEqual({
      name: 'M',
      sources: [{ name: 'a', url: 'https://a', headers: { k: 'x' } }],
    })
    expect(() => resolveConstructEnv(construct, {})).toThrow(/unset environment variable T/)
    expect(parseConstructFile(JSON.stringify(construct), { T: 'y' }).meshes[1]).toEqual({
      name: 'M',
      sources: [{ name: 'a', url: 'https://a', headers: { k: 'y' } }],
    })
    expect(() => parseConstructFile('{"name":"C"}', {})).toThrow()
  })

  it('defaults to process.env', () => {
    vi.stubEnv('T', 'p')
    const out = resolveConstructEnv({
      name: 'C',
      meshes: [{ name: 'M', sources: [{ name: 'a', url: 'https://a', headers: { k: '${T}' } }] }],
    })
    const inline = out.meshes[0]
    expect(inline && !('ref' in inline) ? inline.sources[0]?.headers : undefined).toEqual({
      k: 'p',
    })
    expect(parseConstructFile(JSON.stringify(out)).name).toBe('C')
  })
})

describe('parseMeshFile', () => {
  it('parses and resolves in one step', () => {
    const text = JSON.stringify({
      name: 'M',
      sources: [{ name: 'a', url: 'https://a', headers: { authorization: '${T}' } }],
    })
    expect(parseMeshFile(text, { T: 'x' }).sources[0].headers).toEqual({ authorization: 'x' })
    expect(() => parseMeshFile(text, {})).toThrow(/unset environment variable T/)
    expect(() => parseMeshFile('{"name":"M"}', {})).toThrow()
  })
})

describe('loadMeshFromConfig', () => {
  it('reads <name>.json and <name>.mesh.json from the dirs', () => {
    expect(loadMeshFromConfig('ai-news', { dirs: [dir] })?.name).toBe('AI News')
    expect(loadMeshFromConfig('security', { dirs: [dir] })?.name).toBe('Security')
  })

  it('resolves header placeholders from the environment, failing loud when unset', () => {
    vi.stubEnv('NW_TEST_TOKEN', 'abc')
    expect(loadMeshFromConfig('private', { dirs: [dir] })?.sources[0].headers).toEqual({
      authorization: 'Bearer abc',
    })
    vi.stubEnv('NW_TEST_TOKEN', '')
    expect(() => loadMeshFromConfig('private', { dirs: [dir] })).toThrow(/NW_TEST_TOKEN/)
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
