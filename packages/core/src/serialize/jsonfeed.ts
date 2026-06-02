import type { NeurowireEntry, NeurowireFeed, Person } from '../model'

interface JsonFeedAuthor {
  name: string
  url?: string
}

interface JsonFeedItem {
  id: string
  url: string
  title: string
  summary?: string
  date_published?: string
  date_modified?: string
  authors?: JsonFeedAuthor[]
  tags?: string[]
}

export interface JsonFeedDocument {
  version: string
  title: string
  home_page_url?: string
  feed_url?: string
  authors?: JsonFeedAuthor[]
  items: JsonFeedItem[]
}

function rfc3339(value: string | undefined): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}

const toAuthor = (p: Person): JsonFeedAuthor =>
  p.url ? { name: p.name, url: p.url } : { name: p.name }

function toItem(entry: NeurowireEntry): JsonFeedItem {
  const item: JsonFeedItem = { id: entry.id, url: entry.link, title: entry.title }
  if (entry.summary) item.summary = entry.summary
  const published = rfc3339(entry.published)
  const modified = rfc3339(entry.updated)
  if (published) item.date_published = published
  if (modified) item.date_modified = modified
  if (entry.authors?.length) item.authors = entry.authors.map(toAuthor)
  if (entry.tags?.length) item.tags = entry.tags
  return item
}

/** Build a JSON Feed 1.1 document object from a feed. */
export function toJsonFeedObject(feed: NeurowireFeed): JsonFeedDocument {
  // Feed-level metadata before `items`, matching JSON Feed convention.
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: feed.title,
    ...(feed.home ? { home_page_url: feed.home } : {}),
    ...(feed.self ? { feed_url: feed.self } : {}),
    ...(feed.authors?.length ? { authors: feed.authors.map(toAuthor) } : {}),
    items: feed.entries.map(toItem),
  }
}

/** Serialize a feed to a JSON Feed 1.1 string. */
export function toJsonFeed(feed: NeurowireFeed): string {
  return `${JSON.stringify(toJsonFeedObject(feed), null, 2)}\n`
}
