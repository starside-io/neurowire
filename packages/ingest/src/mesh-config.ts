import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  type Construct,
  ConstructSchema,
  type Mesh,
  MeshSchema,
  isConstructRef,
} from '@neurowire/core'
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

/**
 * Resolve `${VAR}` placeholders in per-source header values from `env`. Mesh
 * files hold references like `"authorization": "Bearer ${GITHUB_TOKEN}"`, never
 * the token itself. Throws when a referenced variable is unset or empty, so a
 * missing secret fails at load rather than as a confusing 401 later.
 *
 * Call this only on meshes read from trusted local config. Never on a mesh
 * supplied by a remote caller (an HTTP body or an MCP tool input), or the caller
 * could read the process environment through a URL they control.
 */
export function resolveMeshEnv(mesh: Mesh, env: NodeJS.ProcessEnv = process.env): Mesh {
  const sources = mesh.sources.map((source) => {
    if (!source.headers) return source
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(source.headers)) {
      headers[key] = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
        const resolved = env[name]
        if (!resolved) {
          throw new Error(
            `Mesh "${mesh.name}": source "${source.name}" header "${key}" references ` +
              `unset environment variable ${name}`,
          )
        }
        return resolved
      })
    }
    return { ...source, headers }
  })
  return { ...mesh, sources }
}

/**
 * Parse a mesh file's contents and resolve its header placeholders. The one
 * entry point for every loader that reads mesh JSON from local config (the CLI,
 * the API, and the MCP server), so they all agree on the file format.
 */
export function parseMeshFile(text: string, env: NodeJS.ProcessEnv = process.env): Mesh {
  return resolveMeshEnv(MeshSchema.parse(JSON.parse(text)), env)
}

/** {@link resolveMeshEnv} applied to every inline mesh of a construct; refs pass through. */
export function resolveConstructEnv(
  construct: Construct,
  env: NodeJS.ProcessEnv = process.env,
): Construct {
  return {
    ...construct,
    meshes: construct.meshes.map((member) =>
      isConstructRef(member) ? member : resolveMeshEnv(member, env),
    ),
  }
}

/** Parse a construct file's contents and resolve header placeholders in its inline meshes. */
export function parseConstructFile(text: string, env: NodeJS.ProcessEnv = process.env): Construct {
  return resolveConstructEnv(ConstructSchema.parse(JSON.parse(text)), env)
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
      if (existsSync(path)) return parseMeshFile(readFileSync(path, 'utf8'))
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
