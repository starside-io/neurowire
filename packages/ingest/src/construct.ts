import {
  type Construct,
  type ConstructMember,
  type Mesh,
  type NeurowireFeed,
  isConstructRef,
  mergeFeeds,
} from '@neurowire/core'
import type { ConditionalCache } from './fetch'
import { type FetchMeshOptions, fetchMesh } from './mesh'

/**
 * Resolve a mesh reference (by name) to a real {@link Mesh}, or undefined when
 * the name is unknown. Constructs only carry references; the caller supplies the
 * lookup (a config directory, an installed mesh pack, an in-memory map), so core
 * and ingest stay free of any filesystem or registry assumptions.
 */
export type MeshResolver = (ref: string) => Mesh | undefined

export interface FetchConstructOptions {
  signal?: AbortSignal
  /** Keep only the newest N entries within each mesh. */
  limit?: number
  /** A conditional response cache shared by every source in every mesh. */
  cache?: ConditionalCache
  /** Resolve `{ ref }` members to real meshes. Required when a construct has refs. */
  resolver?: MeshResolver
  /**
   * How many meshes to fetch at once. A construct of many meshes would otherwise
   * open every source of every mesh in parallel (dozens of connections), and the
   * burst makes slow hosts time out and drop whole meshes. Default 2. Sources
   * within a mesh are still fetched together.
   */
  concurrency?: number
  /** Per-attempt fetch deadline in milliseconds. Default 15000. Set 0 to disable. */
  timeoutMs?: number
  /** Max additional fetch attempts after the first. Default 2. */
  retries?: number
  /** Base delay in milliseconds for exponential backoff with jitter. Default 500. */
  backoffMs?: number
  /**
   * Called for each source (within any mesh) that failed to fetch. Defaults to a
   * one-line warning on stderr. A failed source is always skipped, never fatal
   * (unless every source in its mesh fails, which then skips the whole mesh).
   */
  onSourceError?: FetchMeshOptions['onSourceError']
  /**
   * Called for each mesh that failed to fetch entirely (no source succeeded).
   * Defaults to a one-line warning on stderr. A failed mesh is skipped, never
   * fatal (unless every mesh fails).
   */
  onMeshError?: (mesh: Mesh, error: unknown) => void
}

/** Default per-mesh failure handler: a non-fatal warning on stderr. */
function warnMeshError(mesh: Mesh, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  process.stderr.write(`neurowire: construct mesh "${mesh.name}" failed: ${reason}\n`)
}

/** One mesh of a fetched construct, paired with the single feed it merged into. */
export interface ConstructPart {
  mesh: Mesh
  feed: NeurowireFeed
}

/** A fetched construct: its name plus one merged feed per mesh, grouping preserved. */
export interface FetchedConstruct {
  name: string
  parts: ConstructPart[]
}

export interface FlattenConstructOptions {
  /** Keep only the newest N entries in the flattened feed. */
  limit?: number
}

function resolveMember(member: ConstructMember, resolver?: MeshResolver): Mesh {
  if (!isConstructRef(member)) return member
  if (!resolver) {
    throw new Error(`Construct references mesh "${member.ref}" but no resolver was provided`)
  }
  const mesh = resolver(member.ref)
  if (!mesh) throw new Error(`Construct references unknown mesh "${member.ref}"`)
  return mesh
}

/**
 * Resolve every member of a construct to a concrete {@link Mesh}. Inline meshes
 * pass through unchanged; `{ ref }` members are looked up with `resolver`. Throws
 * if a ref has no resolver or resolves to nothing.
 */
export function resolveConstructMembers(construct: Construct, resolver?: MeshResolver): Mesh[] {
  return construct.meshes.map((member) => resolveMember(member, resolver))
}

/**
 * Run `tasks` with at most `limit` in flight at once, preserving input order in
 * the returned settled results. A bounded Promise.allSettled.
 */
async function settledPool<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const size = Math.max(1, Math.min(limit, tasks.length))
  await Promise.all(Array.from({ length: size }, worker))
  return results
}

/**
 * Fetch every mesh in a construct into its own merged feed, preserving the mesh
 * grouping. Meshes are fetched with bounded concurrency (see
 * {@link FetchConstructOptions.concurrency}) so a large construct does not open
 * every source at once. Meshes that fail to fetch are skipped; throws only if
 * none succeed. Use {@link flattenConstruct} to collapse the result into a single
 * feed for the standard serializers.
 */
export async function fetchConstruct(
  construct: Construct,
  options: FetchConstructOptions = {},
): Promise<FetchedConstruct> {
  const meshes = resolveConstructMembers(construct, options.resolver)
  const meshOptions: FetchMeshOptions = {
    signal: options.signal,
    limit: options.limit,
    cache: options.cache,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    backoffMs: options.backoffMs,
    onSourceError: options.onSourceError,
  }
  const onMeshError = options.onMeshError ?? warnMeshError
  const results = await settledPool(
    meshes.map(
      (mesh) => async (): Promise<ConstructPart> => ({
        mesh,
        feed: await fetchMesh(mesh, meshOptions),
      }),
    ),
    options.concurrency ?? 2,
  )

  const parts: ConstructPart[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      parts.push(result.value)
    } else {
      // Partial failure: log which mesh failed and why, then skip it (non-fatal).
      onMeshError(meshes[index], result.reason)
    }
  })
  if (!parts.length) {
    throw new Error(`Construct "${construct.name}": no meshes could be fetched`)
  }
  return { name: construct.name, parts }
}

/**
 * Flatten a fetched construct into one merged feed, tagging every entry with the
 * mesh it came from. Drops the per-mesh grouping (Atom/JSON Feed/nwf cannot
 * express it), so this is the path the feed serializers and the API use.
 */
export function flattenConstruct(
  construct: FetchedConstruct,
  options: FlattenConstructOptions = {},
): NeurowireFeed {
  return mergeFeeds(
    construct.name,
    construct.parts.map((part) => ({ feed: part.feed, source: { name: part.mesh.name } })),
    { limit: options.limit },
  )
}
