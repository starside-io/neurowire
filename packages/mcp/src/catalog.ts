import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Construct, ConstructSchema, type Mesh, MeshSchema } from '@neurowire/core'
import { resolveConstructEnv, resolveMeshEnv } from '@neurowire/ingest'
import { THEME_KEYS, type ThemeKey, loadTheme, themeMesh } from '@neurowire/taps-pack'

/** Built-in meshes, so `ai-news` works with no setup. Mirrors the api package. */
const BUNDLED_MESHES: Record<string, Mesh> = {
  'ai-news': {
    name: 'AI News',
    sources: [
      {
        name: 'Claude Code Releases',
        url: 'https://github.com/anthropics/claude-code/releases.atom',
      },
      { name: 'Claude Blog', url: 'https://claude.com/blog' },
      { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
    ],
  },
}

/** Built-in constructs, so `daily` works with no setup. Mirrors the api package. */
const BUNDLED_CONSTRUCTS: Record<string, Construct> = {
  daily: {
    name: 'Daily Brief',
    meshes: [
      {
        name: 'Models',
        sources: [
          { name: 'Claude Blog', url: 'https://claude.com/blog' },
          { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
        ],
      },
      {
        name: 'Releases',
        sources: [
          {
            name: 'Claude Code Releases',
            url: 'https://github.com/anthropics/claude-code/releases.atom',
          },
        ],
      },
    ],
  },
}

/** Where named meshes and constructs come from. Injectable so tests stay offline. */
export interface Catalog {
  meshNames(): string[]
  mesh(name: string): Promise<Mesh | undefined>
  constructNames(): string[]
  construct(name: string): Construct | undefined
}

export interface CatalogOptions {
  /** Environment to read directories from. Default: `process.env`. */
  env?: Record<string, string | undefined>
}

const SAFE_NAME = /^[\w.-]+$/

function configDirs(env: CatalogOptions['env'], envVar: string, subdir: string): string[] {
  const vars = env ?? {}
  const dirs = (vars[envVar] ?? '')
    .split(/[:,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  dirs.push(join(vars.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'neurowire', subdir))
  return dirs
}

function namesIn(dirs: string[], suffix: string): string[] {
  const names: string[] = []
  const pattern = new RegExp(`^(.+?)(?:\\.${suffix})?\\.json$`)
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      const match = file.match(pattern)
      if (match?.[1]) names.push(match[1])
    }
  }
  return names
}

function readNamed<T>(
  dirs: string[],
  name: string,
  suffix: string,
  parse: (data: unknown) => T,
): T | undefined {
  for (const dir of dirs) {
    for (const file of [`${name}.${suffix}.json`, `${name}.json`]) {
      const path = join(dir, file)
      if (existsSync(path)) return parse(JSON.parse(readFileSync(path, 'utf8')))
    }
  }
  return undefined
}

function isThemeKey(name: string): name is ThemeKey {
  return (THEME_KEYS as string[]).includes(name)
}

/**
 * The operator's catalog. Meshes resolve from `NEUROWIRE_MESHES` then
 * `~/.config/neurowire/meshes`, then the bundled defaults, then the taps-pack
 * themes by key. Constructs resolve from `NEUROWIRE_CONSTRUCTS` then
 * `~/.config/neurowire/constructs`, then the bundled defaults. Path-like names
 * are rejected so a name can never escape its directory.
 */
export function createCatalog(options: CatalogOptions = {}): Catalog {
  const env = options.env ?? process.env
  const meshDirs = () => configDirs(env, 'NEUROWIRE_MESHES', 'meshes')
  const constructDirs = () => configDirs(env, 'NEUROWIRE_CONSTRUCTS', 'constructs')

  return {
    meshNames() {
      const names = new Set([
        ...namesIn(meshDirs(), 'mesh'),
        ...Object.keys(BUNDLED_MESHES),
        ...THEME_KEYS,
      ])
      return [...names].sort()
    },
    async mesh(name) {
      if (!SAFE_NAME.test(name) || name.includes('..')) return undefined
      const own = readNamed(meshDirs(), name, 'mesh', (data) =>
        resolveMeshEnv(MeshSchema.parse(data), env),
      )
      if (own) return own
      if (BUNDLED_MESHES[name]) return BUNDLED_MESHES[name]
      return isThemeKey(name) ? themeMesh(await loadTheme(name)) : undefined
    },
    constructNames() {
      const names = new Set([
        ...namesIn(constructDirs(), 'construct'),
        ...Object.keys(BUNDLED_CONSTRUCTS),
      ])
      return [...names].sort()
    },
    construct(name) {
      if (!SAFE_NAME.test(name) || name.includes('..')) return undefined
      const own = readNamed(constructDirs(), name, 'construct', (data) =>
        resolveConstructEnv(ConstructSchema.parse(data), env),
      )
      return own ?? BUNDLED_CONSTRUCTS[name]
    },
  }
}
