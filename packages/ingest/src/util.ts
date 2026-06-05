import {
  GENERATOR,
  type NeurowireEntry,
  type NeurowireFeed,
  type Person,
  stableId,
} from '@neurowire/core'

/** Context passed to every parser: the final URL of the fetched document. */
export interface ParseContext {
  sourceUrl: string
}

/** A loose, in-progress feed that `finalizeFeed` turns into a valid NeurowireFeed. */
export interface FeedDraft {
  id?: string
  title?: string
  home?: string
  self?: string
  updated?: string
  authors?: Person[]
  entries: NeurowireEntry[]
}

/** Resolve a possibly-relative href against a base URL. Returns the input on failure. */
export function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/** Normalize any parseable date string (RFC 822, RFC 3339, ...) to ISO 8601. */
export function normDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}

/** Strip HTML tags and collapse whitespace, for turning rich descriptions into summaries. */
export function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined
  const plain = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain || undefined
}

function newestEntryDate(entries: NeurowireEntry[]): string | undefined {
  let max = Number.NEGATIVE_INFINITY
  for (const entry of entries) {
    const value = entry.updated ?? entry.published
    if (!value) continue
    const ms = Date.parse(value)
    if (!Number.isNaN(ms) && ms > max) max = ms
  }
  return max === Number.NEGATIVE_INFINITY ? undefined : new Date(max).toISOString()
}

/**
 * Give an entry a stable id: keep a real source id, otherwise derive a
 * deterministic `urn:nwf:` id from its link and title so dedup and round-trips
 * stay stable across formats.
 */
function withStableId(entry: NeurowireEntry): NeurowireEntry {
  if (entry.id.trim()) return entry
  return { ...entry, id: stableId(entry.link, entry.title) }
}

/** Fill in defaults and stamp the generator to produce a valid NeurowireFeed. */
export function finalizeFeed(draft: FeedDraft, ctx: ParseContext): NeurowireFeed {
  const updated =
    normDate(draft.updated) ?? newestEntryDate(draft.entries) ?? new Date().toISOString()
  const feed: NeurowireFeed = {
    id: draft.id?.trim() || ctx.sourceUrl,
    title: draft.title?.trim() || 'Untitled',
    updated,
    entries: draft.entries.map(withStableId),
    generator: { name: GENERATOR.name, version: GENERATOR.version },
  }
  if (draft.home) feed.home = resolveUrl(draft.home, ctx.sourceUrl)
  if (draft.self) feed.self = draft.self
  if (draft.authors?.length) feed.authors = draft.authors
  return feed
}
