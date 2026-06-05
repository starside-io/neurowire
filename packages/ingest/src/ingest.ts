import type { NeurowireFeed } from '@neurowire/core'
import { load } from 'cheerio'
import { detectKind } from './detect'
import { type ConditionalCache, type RawDocument, fetchDocument } from './fetch'
import { autodetect, discoverFeedLink } from './html/autodetect'
import { findTemplate } from './html/registry'
import { type FeedTemplate, applyTemplate } from './html/template'
import { parseFeedString } from './parsers/feed'
import type { ParseContext } from './util'

export interface FetchFeedOptions {
  /** Force a CSS-selector template instead of auto-detecting. */
  template?: FeedTemplate
  signal?: AbortSignal
  /** Max number of feed-link redirects to follow (default 3). */
  maxDepth?: number
  /** A conditional (ETag/Last-Modified) response cache, owned by the caller. */
  cache?: ConditionalCache
}

/** Fetch a URL (website, RSS, or Atom) and normalize it to a NeurowireFeed. */
export async function fetchFeed(
  url: string,
  options: FetchFeedOptions = {},
): Promise<NeurowireFeed> {
  return ingest(url, options, 0)
}

async function ingest(
  url: string,
  options: FetchFeedOptions,
  depth: number,
): Promise<NeurowireFeed> {
  const doc = await fetchDocument(url, { signal: options.signal, cache: options.cache })
  return ingestDocument(doc, options, depth)
}

/** Turn an already-fetched document into a feed. Exposed for testing without a network. */
export async function ingestDocument(
  doc: RawDocument,
  options: FetchFeedOptions = {},
  depth = 0,
): Promise<NeurowireFeed> {
  const ctx: ParseContext = { sourceUrl: doc.url }

  if (detectKind(doc.contentType, doc.body) !== 'html') {
    return parseFeedString(doc.body, ctx)
  }

  const $ = load(doc.body)

  // 1. Explicit template override wins.
  if (options.template) return applyTemplate($, options.template, ctx)

  // 2. Follow a declared feed link (the highest-fidelity result).
  const maxDepth = options.maxDepth ?? 3
  if (depth < maxDepth) {
    const discovered = discoverFeedLink($, doc.url)
    if (discovered && discovered !== doc.url) {
      try {
        return await ingest(discovered, { ...options, template: undefined }, depth + 1)
      } catch {
        // Fall through to on-page extraction.
      }
    }
  }

  // 3. Curated per-host recipe from the registry (beats heuristic auto-detect).
  const template = findTemplate(doc.url)
  if (template) {
    const fromTemplate = applyTemplate($, template, ctx)
    if (fromTemplate.entries.length) return fromTemplate
  }

  // 4. Auto-detect on the page itself (JSON-LD, then semantic HTML).
  const auto = autodetect($, ctx)
  if (auto?.entries.length) return auto

  throw new Error(`Neurowire could not extract a feed from ${doc.url}`)
}
