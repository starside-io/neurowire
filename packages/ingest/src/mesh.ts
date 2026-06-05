import { type Mesh, type NeurowireFeed, mergeFeeds } from '@neurowire/core'
import type { ConditionalCache } from './fetch'
import { type FetchFeedOptions, fetchFeed } from './ingest'

export interface FetchMeshOptions {
  signal?: AbortSignal
  /** Keep only the newest N merged entries. */
  limit?: number
  /** A conditional response cache shared by every mesh source. */
  cache?: ConditionalCache
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
  const fetchOptions: FetchFeedOptions = { signal: options.signal, cache: options.cache }
  const results = await Promise.allSettled(
    mesh.sources.map(
      async (source): Promise<MeshPart> => ({
        feed: await fetchFeed(source.url, fetchOptions),
        source: { name: source.name, url: source.url },
      }),
    ),
  )

  const parts: MeshPart[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') parts.push(result.value)
  }
  if (!parts.length) {
    throw new Error(`Mesh "${mesh.name}": no sources could be fetched`)
  }
  return mergeFeeds(mesh.name, parts, { limit: options.limit })
}
