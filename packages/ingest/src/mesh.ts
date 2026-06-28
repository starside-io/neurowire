import { type Mesh, type NeurowireFeed, mergeFeeds } from '@neurowire/core'
import type { ConditionalCache } from './fetch'
import { type FetchFeedOptions, fetchFeed } from './ingest'

export interface FetchMeshOptions {
  signal?: AbortSignal
  /** Keep only the newest N merged entries. */
  limit?: number
  /** A conditional response cache shared by every mesh source. */
  cache?: ConditionalCache
  /** Per-attempt fetch deadline in milliseconds. Default 15000. Set 0 to disable. */
  timeoutMs?: number
  /** Max additional fetch attempts after the first. Default 2. */
  retries?: number
  /** Base delay in milliseconds for exponential backoff with jitter. Default 500. */
  backoffMs?: number
  /**
   * Called for each source that failed to fetch. Defaults to a one-line warning
   * on stderr (source name + reason). Pass a custom handler to silence or
   * redirect it. A failed source is always skipped, never fatal (unless all
   * fail).
   */
  onSourceError?: (source: { name: string; url: string }, error: unknown) => void
}

/** Shorten an error to a single human-readable line for logging. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Default partial-failure handler: a non-fatal warning on stderr. */
function warnSourceError(source: { name: string; url: string }, error: unknown): void {
  process.stderr.write(
    `neurowire: mesh source "${source.name}" (${source.url}) failed: ${describeError(error)}\n`,
  )
}

interface MeshPart {
  feed: NeurowireFeed
  source: { name: string; url: string }
}

/**
 * Fetch every source in a mesh (in parallel) and merge them into one feed.
 * Sources that fail to fetch are skipped; throws only if none succeed.
 */
export async function fetchMesh(
  mesh: Mesh,
  options: FetchMeshOptions = {},
): Promise<NeurowireFeed> {
  const fetchOptions: FetchFeedOptions = {
    signal: options.signal,
    cache: options.cache,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    backoffMs: options.backoffMs,
  }
  const onSourceError = options.onSourceError ?? warnSourceError
  const results = await Promise.allSettled(
    mesh.sources.map(
      async (source): Promise<MeshPart> => ({
        feed: await fetchFeed(source.url, fetchOptions),
        source: { name: source.name, url: source.url },
      }),
    ),
  )

  const parts: MeshPart[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      parts.push(result.value)
    } else {
      // Partial failure: log which source failed and why, then skip it (non-fatal).
      const source = mesh.sources[index]
      onSourceError({ name: source.name, url: source.url }, result.reason)
    }
  })
  if (!parts.length) {
    throw new Error(`Mesh "${mesh.name}": no sources could be fetched`)
  }
  return mergeFeeds(mesh.name, parts, { limit: options.limit })
}
