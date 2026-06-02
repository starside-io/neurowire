import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Mesh, MeshSchema } from '@neurowire/core'

/** Built-in meshes, so `?src=ai-news` works with no setup. */
const BUNDLED: Record<string, Mesh> = {
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

function meshDirs(): string[] {
  const dirs = (process.env.NEUROWIRE_MESHES ?? '')
    .split(/[:,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  dirs.push(join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'neurowire', 'meshes'))
  return dirs
}

/**
 * Resolve a named mesh: user mesh directories first (NEUROWIRE_MESHES, then
 * ~/.config/neurowire/meshes), then the bundled defaults. Names are simple
 * identifiers; anything path-like is rejected to avoid directory traversal.
 */
export function resolveMesh(name: string): Mesh | undefined {
  if (!/^[\w.-]+$/.test(name) || name.includes('..')) return undefined
  for (const dir of meshDirs()) {
    for (const file of [`${name}.mesh.json`, `${name}.json`]) {
      const path = join(dir, file)
      if (existsSync(path)) return MeshSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    }
  }
  return BUNDLED[name]
}

/** Names of all available meshes (bundled plus any found in the mesh directories). */
export function listMeshNames(): string[] {
  const names = new Set(Object.keys(BUNDLED))
  for (const dir of meshDirs()) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      const match = file.match(/^(.+?)(?:\.mesh)?\.json$/)
      if (match?.[1]) names.add(match[1])
    }
  }
  return [...names].sort()
}
