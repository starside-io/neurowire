import { GENERATOR, type NeurowireEntry, type NeurowireFeed } from './model'

/** One feed plus the source label its entries should carry in a merge. */
export interface MergePart {
  feed: NeurowireFeed
  source?: { name?: string; url?: string }
}

export interface MergeOptions {
  /** Stable id for the merged feed. Defaults to a urn derived from the title. */
  id?: string
  /** Keep only the newest N entries. */
  limit?: number
}

function entryTime(entry: NeurowireEntry): number {
  const value = entry.updated ?? entry.published
  const ms = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Merge several feeds into one named feed. Each entry is tagged with its source
 * (falling back to the source feed's own title/home), entries are de-duplicated
 * by link, sorted newest first, and capped by an optional `limit`.
 */
export function mergeFeeds(
  title: string,
  parts: MergePart[],
  options: MergeOptions = {},
): NeurowireFeed {
  const seen = new Set<string>()
  const entries: NeurowireEntry[] = []

  for (const part of parts) {
    const source: { name?: string; url?: string } = {}
    const name = part.source?.name ?? part.feed.title
    const url = part.source?.url ?? part.feed.home
    if (name) source.name = name
    if (url) source.url = url

    for (const entry of part.feed.entries) {
      const key = entry.link || entry.id
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ ...entry, source: { ...source } })
    }
  }

  entries.sort((a, b) => entryTime(b) - entryTime(a))
  const limited = options.limit ? entries.slice(0, options.limit) : entries

  const times = limited.map(entryTime).filter((time) => time > 0)
  const updated = times.length
    ? new Date(Math.max(...times)).toISOString()
    : new Date().toISOString()

  return {
    id: options.id ?? `urn:neurowire:mesh:${encodeURIComponent(title)}`,
    title,
    updated,
    entries: limited,
    generator: { name: GENERATOR.name, version: GENERATOR.version },
  }
}
