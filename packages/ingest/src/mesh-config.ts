import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Mesh, MeshSchema } from '@neurowire/core'
import type { MeshResolver } from './construct'

export interface ConfigResolverOptions {
  /** Extra directories searched before the defaults. */
  dirs?: string[]
  /** Env var holding ':'/',' separated directories. Default: NEUROWIRE_MESHES. */
  envVar?: string
  /** Sub-path under ~/.config (XDG_CONFIG_HOME). Default: neurowire/meshes. */
  subdir?: string
}

/**
 * Directories searched for named mesh files: explicit `dirs`, then the env var
 * (NEUROWIRE_MESHES by default), then ~/.config/neurowire/meshes. The same shape
 * the CLI taps loader and the API use, so a mesh dropped there resolves anywhere.
 */
export function meshConfigDirs(options: ConfigResolverOptions = {}): string[] {
  const envVar = options.envVar ?? 'NEUROWIRE_MESHES'
  const dirs = [...(options.dirs ?? [])]
  dirs.push(
    ...(process.env[envVar] ?? '')
      .split(/[:,]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  dirs.push(join(base, ...(options.subdir ?? 'neurowire/meshes').split('/')))
  return dirs
}

/** Read a mesh by name from the config directories. Returns undefined when absent. */
export function loadMeshFromConfig(
  name: string,
  options?: ConfigResolverOptions,
): Mesh | undefined {
  if (!/^[\w.-]+$/.test(name) || name.includes('..')) return undefined
  for (const dir of meshConfigDirs(options)) {
    for (const file of [`${name}.mesh.json`, `${name}.json`]) {
      const path = join(dir, file)
      if (existsSync(path)) return MeshSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    }
  }
  return undefined
}

/**
 * A {@link MeshResolver} backed by the config directories, for resolving the
 * `{ ref }` members of a construct (e.g. published mesh packs dropped into
 * ~/.config/neurowire/meshes). Pass to `fetchConstruct({ resolver })`.
 */
export function createConfigMeshResolver(options?: ConfigResolverOptions): MeshResolver {
  return (ref) => loadMeshFromConfig(ref, options)
}
