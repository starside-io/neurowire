import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import type { CheerioAPI } from 'cheerio'
import { toArray } from '../parsers/xml'
import { type ParseContext, finalizeFeed, normDate, resolveUrl, stripHtml } from '../util'

const FEED_TYPES = [
  'application/atom+xml',
  'application/rss+xml',
  'application/feed+json',
  'application/json',
]

/** Find a feed URL declared via <link rel="alternate" type="...feed..."> (atom preferred). */
export function discoverFeedLink($: CheerioAPI, base: string): string | undefined {
  const found: { type: string; href: string }[] = []
  $('link[rel="alternate"]').each((_, el) => {
    const type = ($(el).attr('type') ?? '').toLowerCase()
    const href = $(el).attr('href')
    if (href && FEED_TYPES.includes(type)) found.push({ type, href })
  })
  for (const type of FEED_TYPES) {
    const match = found.find((f) => f.type === type)
    if (match) return resolveUrl(match.href, base)
  }
  return undefined
}

// ---------- JSON-LD ----------

interface JsonLdNode {
  '@type'?: string | string[]
  [key: string]: unknown
}

const ARTICLE_TYPES = ['BlogPosting', 'Article', 'NewsArticle', 'TechArticle', 'Report']
const COLLECTION_TYPES = ['Blog', 'CollectionPage', 'ItemList']

function asTypes(type: unknown): string[] {
  if (typeof type === 'string') return [type]
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === 'string')
  return []
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function flatten(data: unknown): JsonLdNode[] {
  const out: JsonLdNode[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node && typeof node === 'object') {
      out.push(node as JsonLdNode)
      const graph = (node as JsonLdNode)['@graph']
      if (Array.isArray(graph)) for (const child of graph) visit(child)
    }
  }
  visit(data)
  return out
}

function jsonLdAuthors(value: unknown): { name: string }[] | undefined {
  const list = Array.isArray(value) ? value : value ? [value] : []
  const persons = list
    .map((author) => str(typeof author === 'string' ? author : get(author, 'name')))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name }))
  return persons.length ? persons : undefined
}

function get(node: unknown, key: string): unknown {
  return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined
}

function jsonLdKeywords(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value.filter((t): t is string => typeof t === 'string')
    return tags.length ? tags : undefined
  }
  if (typeof value === 'string') {
    const tags = value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    return tags.length ? tags : undefined
  }
  return undefined
}

function jsonLdEntry(node: JsonLdNode, ctx: ParseContext): NeurowireEntry | null {
  const url = str(node.url) ?? str(node['@id'])
  const title = str(node.headline) ?? str(node.name)
  if (!url || !title) return null

  const link = resolveUrl(url, ctx.sourceUrl)
  const entry: NeurowireEntry = { id: '', title, link }
  const published = normDate(str(node.datePublished))
  const updated = normDate(str(node.dateModified))
  if (published) entry.published = published
  if (updated) entry.updated = updated
  const summary = str(node.description) ?? stripHtml(str(node.articleBody))
  if (summary) entry.summary = summary
  const authors = jsonLdAuthors(node.author)
  if (authors) entry.authors = authors
  const tags = jsonLdKeywords(node.keywords)
  if (tags) entry.tags = tags
  return entry
}

function fromJsonLd($: CheerioAPI, ctx: ParseContext): NeurowireEntry[] {
  const entries: NeurowireEntry[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown
    try {
      data = JSON.parse($(el).text())
    } catch {
      return
    }
    for (const node of flatten(data)) {
      const types = asTypes(node['@type'])
      if (types.some((t) => ARTICLE_TYPES.includes(t))) {
        const entry = jsonLdEntry(node, ctx)
        if (entry) entries.push(entry)
      } else if (types.some((t) => COLLECTION_TYPES.includes(t))) {
        const posts = [...toArray(node.blogPost), ...toArray(node.itemListElement)]
        for (const post of posts) {
          const target =
            post && typeof post === 'object' && 'item' in post ? (post as JsonLdNode).item : post
          const entry = jsonLdEntry((target ?? {}) as JsonLdNode, ctx)
          if (entry) entries.push(entry)
        }
      }
    }
  })
  return dedupe(entries)
}

// ---------- semantic HTML ----------

function fromSemantic($: CheerioAPI, ctx: ParseContext): NeurowireEntry[] {
  const entries: NeurowireEntry[] = []
  $('article').each((_, el) => {
    const $el = $(el)
    const $a = $el.find('h1 a, h2 a, h3 a, h4 a').first()
    const $titleEl = $a.length ? $a : $el.find('h1, h2, h3, h4').first()
    const title = $titleEl.text().trim()
    const href = $a.attr('href') ?? $el.find('a[href]').first().attr('href')
    if (!title || !href) return

    const link = resolveUrl(href, ctx.sourceUrl)
    const entry: NeurowireEntry = { id: '', title, link }
    const $time = $el.find('time[datetime]').first()
    const date = normDate($time.attr('datetime') ?? $el.find('time').first().text().trim())
    if (date) entry.published = date
    const summary = $el.find('p').first().text().trim()
    if (summary) entry.summary = summary
    entries.push(entry)
  })
  return dedupe(entries)
}

function dedupe(entries: NeurowireEntry[]): NeurowireEntry[] {
  const seen = new Set<string>()
  const out: NeurowireEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.link)) continue
    seen.add(entry.link)
    out.push(entry)
  }
  return out
}

/**
 * Try to extract a feed from an HTML page without a template:
 * JSON-LD first, then semantic <article> markup. Returns null if nothing solid is found.
 */
export function autodetect($: CheerioAPI, ctx: ParseContext): NeurowireFeed | null {
  const siteTitle =
    $('meta[property="og:site_name"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    ctx.sourceUrl

  const draft = (entries: NeurowireEntry[]) =>
    finalizeFeed(
      { id: ctx.sourceUrl, title: siteTitle, home: ctx.sourceUrl, self: ctx.sourceUrl, entries },
      ctx,
    )

  const jsonld = fromJsonLd($, ctx)
  if (jsonld.length) return draft(jsonld)

  const semantic = fromSemantic($, ctx)
  if (semantic.length >= 2) return draft(semantic)

  return null
}
