import { type FeedTemplate, type RawDocument, ingestDocument } from '@neurowire/ingest'
import { countMatches } from './suggest'

/** One extracted row, flattened to strings for display. */
export interface TapPreviewEntry {
  title: string
  link: string
  date: string
  summary: string
  author: string
  tags: string[]
}

/** What a candidate template actually pulls off the page. */
export interface TapPreview {
  /** Entries the template extracted, or raw item matches when no title is chosen yet. */
  matched: number
  entries: TapPreviewEntry[]
  /** Set when the template could not be applied at all (e.g. an invalid selector). */
  error?: string
}

/**
 * A template mid-authoring: `item` and `title` may still be blank while stepping
 * through the walkthrough, which the zod schema allows (both are plain strings).
 */
export type DraftTemplate = FeedTemplate

/**
 * Run a candidate template against an already-fetched document and report what it
 * extracts. This calls the REAL engine (`ingestDocument` with an explicit template,
 * which short-circuits every other resolution step), so a preview can never disagree
 * with what an actual fetch would produce. No network, no second implementation.
 *
 * With `item` chosen but no `title` yet, there is nothing for the engine to extract,
 * so the raw item match count is reported instead. That is what gives step one of the
 * walkthrough feedback before a title exists.
 */
export async function previewTemplate(
  doc: RawDocument,
  template: DraftTemplate,
): Promise<TapPreview> {
  if (!template.item.trim()) {
    return { matched: 0, entries: [], error: 'no item selector yet' }
  }
  if (!template.title.trim()) {
    return { matched: countMatches(doc.body, template.item), entries: [] }
  }

  try {
    const feed = await ingestDocument(doc, { template })
    return {
      matched: feed.entries.length,
      entries: feed.entries.map((entry) => ({
        title: entry.title,
        link: entry.link,
        date: entry.published ?? entry.updated ?? '',
        summary: entry.summary ?? '',
        author: entry.authors?.[0]?.name ?? '',
        tags: entry.tags ?? [],
      })),
    }
  } catch (error) {
    return {
      matched: 0,
      entries: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
