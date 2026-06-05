import type { NeurowireEntry, NeurowireFeed, Person } from '@neurowire/core'
import { type ParseContext, finalizeFeed, normDate, resolveUrl, stripHtml } from '../util'
import { attr, get, parseXml, text, toArray } from './xml'

// ---------- shared helpers ----------

function categories(node: unknown): string[] | undefined {
  const tags = toArray(node)
    .map((c) => attr(c, 'term') ?? text(c))
    .filter((t): t is string => Boolean(t))
  return tags.length ? tags : undefined
}

// ---------- Atom ----------

function pickLink(links: unknown[], rel: string): string | undefined {
  for (const link of links) {
    const linkRel = attr(link, 'rel') ?? 'alternate'
    if (linkRel === rel) return attr(link, 'href')
  }
  return undefined
}

function atomPersons(node: unknown): Person[] | undefined {
  const persons = toArray(node).map((author) => {
    const person: Person = { name: text(get(author, 'name')) ?? text(author) ?? 'Unknown' }
    const url = text(get(author, 'uri'))
    const email = text(get(author, 'email'))
    if (url) person.url = url
    if (email) person.email = email
    return person
  })
  return persons.length ? persons : undefined
}

function atomEntry(node: unknown, ctx: ParseContext): NeurowireEntry {
  const links = toArray(get(node, 'link'))
  const href = pickLink(links, 'alternate') ?? attr(links[0], 'href') ?? text(get(node, 'id')) ?? ''
  const link = resolveUrl(href, ctx.sourceUrl)
  const entry: NeurowireEntry = {
    id: text(get(node, 'id')) ?? '',
    title: text(get(node, 'title')) ?? 'Untitled',
    link,
  }
  const published = normDate(text(get(node, 'published')))
  const updated = normDate(text(get(node, 'updated')))
  if (published) entry.published = published
  if (updated) entry.updated = updated
  const summary = stripHtml(text(get(node, 'summary')))
  if (summary) entry.summary = summary
  const authors = atomPersons(get(node, 'author'))
  if (authors) entry.authors = authors
  const tags = categories(get(node, 'category'))
  if (tags) entry.tags = tags
  return entry
}

export function parseAtom(doc: Record<string, unknown>, ctx: ParseContext): NeurowireFeed {
  const feed = get(doc, 'feed')
  const links = toArray(get(feed, 'link'))
  return finalizeFeed(
    {
      id: text(get(feed, 'id')),
      title: text(get(feed, 'title')),
      home: pickLink(links, 'alternate'),
      self: pickLink(links, 'self') ?? ctx.sourceUrl,
      updated: text(get(feed, 'updated')),
      authors: atomPersons(get(feed, 'author')),
      entries: toArray(get(feed, 'entry')).map((entry) => atomEntry(entry, ctx)),
    },
    ctx,
  )
}

// ---------- RSS 2.0 ----------

function rssItem(node: unknown, ctx: ParseContext): NeurowireEntry {
  const guid = text(get(node, 'guid'))
  const link = resolveUrl(text(get(node, 'link')) ?? guid ?? '', ctx.sourceUrl)
  const entry: NeurowireEntry = {
    id: guid ?? '',
    title: text(get(node, 'title')) ?? 'Untitled',
    link,
  }
  const published = normDate(text(get(node, 'pubDate')) ?? text(get(node, 'dc:date')))
  if (published) entry.published = published
  const summary = stripHtml(text(get(node, 'description')) ?? text(get(node, 'content:encoded')))
  if (summary) entry.summary = summary
  const creator = text(get(node, 'dc:creator')) ?? text(get(node, 'author'))
  if (creator) entry.authors = [{ name: creator }]
  const tags = categories(get(node, 'category'))
  if (tags) entry.tags = tags
  return entry
}

function channelAuthors(channel: unknown): Person[] | undefined {
  const name = text(get(channel, 'dc:creator')) ?? text(get(channel, 'managingEditor'))
  return name ? [{ name }] : undefined
}

export function parseRss(doc: Record<string, unknown>, ctx: ParseContext): NeurowireFeed {
  const channel = get(get(doc, 'rss'), 'channel')
  return finalizeFeed(
    {
      id: text(get(channel, 'link')),
      title: text(get(channel, 'title')),
      home: text(get(channel, 'link')),
      self: ctx.sourceUrl,
      updated: text(get(channel, 'lastBuildDate')) ?? text(get(channel, 'pubDate')),
      authors: channelAuthors(channel),
      entries: toArray(get(channel, 'item')).map((item) => rssItem(item, ctx)),
    },
    ctx,
  )
}

// ---------- RDF / RSS 1.0 ----------

export function parseRdf(doc: Record<string, unknown>, ctx: ParseContext): NeurowireFeed {
  const rdf = get(doc, 'rdf:RDF')
  const channel = get(rdf, 'channel')
  return finalizeFeed(
    {
      id: text(get(channel, 'link')),
      title: text(get(channel, 'title')),
      home: text(get(channel, 'link')),
      self: ctx.sourceUrl,
      updated: text(get(channel, 'dc:date')),
      entries: toArray(get(rdf, 'item')).map((item) => rssItem(item, ctx)),
    },
    ctx,
  )
}

// ---------- JSON Feed ----------

interface JsonFeedAuthorRaw {
  name?: string
  url?: string
}

interface JsonFeedItemRaw {
  id?: string | number
  url?: string
  external_url?: string
  title?: string
  summary?: string
  content_text?: string
  content_html?: string
  date_published?: string
  date_modified?: string
  authors?: JsonFeedAuthorRaw[]
  author?: JsonFeedAuthorRaw
  tags?: string[]
}

interface JsonFeedRaw {
  title?: string
  home_page_url?: string
  feed_url?: string
  authors?: JsonFeedAuthorRaw[]
  author?: JsonFeedAuthorRaw
  items?: JsonFeedItemRaw[]
}

function jsonAuthors(
  authors?: JsonFeedAuthorRaw[],
  author?: JsonFeedAuthorRaw,
): Person[] | undefined {
  const list = authors ?? (author ? [author] : [])
  const persons = list
    .filter((a): a is JsonFeedAuthorRaw & { name: string } => Boolean(a.name))
    .map((a) => (a.url ? { name: a.name, url: a.url } : { name: a.name }))
  return persons.length ? persons : undefined
}

export function parseJsonFeed(raw: unknown, ctx: ParseContext): NeurowireFeed {
  const data = (raw ?? {}) as JsonFeedRaw
  const entries: NeurowireEntry[] = toArray<JsonFeedItemRaw>(data.items).map((item) => {
    const link = resolveUrl(item.url ?? item.external_url ?? '', ctx.sourceUrl)
    const entry: NeurowireEntry = {
      id: item.id !== undefined ? String(item.id) : '',
      title: item.title ?? 'Untitled',
      link,
    }
    const published = normDate(item.date_published)
    const modified = normDate(item.date_modified)
    if (published) entry.published = published
    if (modified) entry.updated = modified
    const summary = item.summary ?? stripHtml(item.content_html) ?? item.content_text
    if (summary) entry.summary = summary
    const authors = jsonAuthors(item.authors, item.author)
    if (authors) entry.authors = authors
    if (item.tags?.length) entry.tags = item.tags
    return entry
  })
  return finalizeFeed(
    {
      id: data.feed_url,
      title: data.title,
      home: data.home_page_url,
      self: data.feed_url ?? ctx.sourceUrl,
      authors: jsonAuthors(data.authors, data.author),
      entries,
    },
    ctx,
  )
}

// ---------- dispatch ----------

/** Parse a feed document (Atom / RSS / RDF / JSON Feed) by inspecting its root. */
export function parseFeedString(body: string, ctx: ParseContext): NeurowireFeed {
  if (body.trimStart().startsWith('{')) return parseJsonFeed(JSON.parse(body), ctx)
  const doc = parseXml(body)
  if (get(doc, 'feed')) return parseAtom(doc, ctx)
  if (get(doc, 'rss')) return parseRss(doc, ctx)
  if (get(doc, 'rdf:RDF')) return parseRdf(doc, ctx)
  throw new Error('Unrecognized feed format (expected Atom, RSS, RDF or JSON Feed)')
}
