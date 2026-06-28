import type { NeurowireEntry, NeurowireFeed } from '../model'

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * Format an ISO-ish date string as an RFC 822 date in GMT, e.g.
 * `Wed, 02 Oct 2024 13:00:00 GMT`. Returns undefined when unparseable.
 */
export function toRfc822(iso: string): string | undefined {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return undefined
  const d = new Date(ms)
  const day = DAYS[d.getUTCDay()]
  const date = pad(d.getUTCDate())
  const month = MONTHS[d.getUTCMonth()]
  const year = d.getUTCFullYear()
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return `${day}, ${date} ${month} ${year} ${time} GMT`
}

function itemXml(entry: NeurowireEntry): string {
  const lines = ['    <item>', `      <title>${escapeText(entry.title)}</title>`]
  lines.push(`      <link>${escapeText(entry.link)}</link>`)
  // Prefer the stable entry id as guid; only mark it a permalink when it equals
  // the link. Synthetic ids are not resolvable URLs, so isPermaLink="false".
  const isPermaLink = entry.id === entry.link
  lines.push(`      <guid isPermaLink="${isPermaLink}">${escapeText(entry.id)}</guid>`)
  const pubDate = toRfc822(entry.published ?? entry.updated ?? '')
  if (pubDate) lines.push(`      <pubDate>${pubDate}</pubDate>`)
  for (const author of entry.authors ?? []) {
    lines.push(`      <dc:creator>${escapeText(author.name)}</dc:creator>`)
  }
  for (const tag of entry.tags ?? []) {
    lines.push(`      <category>${escapeText(tag)}</category>`)
  }
  if (entry.summary) {
    lines.push(`      <description>${escapeText(entry.summary)}</description>`)
  }
  // RSS 2.0 requires the url attribute on <source>, so only emit it when a url
  // is present. The element text is the source name (the link text if unnamed).
  if (entry.source?.url) {
    const name = entry.source.name ?? entry.source.url
    lines.push(`      <source url="${escapeAttr(entry.source.url)}">${escapeText(name)}</source>`)
  }
  lines.push('    </item>')
  return lines.join('\n')
}

/** Serialize a feed to an RSS 2.0 document. */
export function toRss(feed: NeurowireFeed): string {
  const link = feed.home ?? feed.self ?? feed.id
  // RSS requires a non-empty channel description; fall back to the title.
  const description = feed.title
  // Only declare namespaces we actually use.
  const usesDc = feed.entries.some((e) => (e.authors?.length ?? 0) > 0)
  const usesAtom = Boolean(feed.self)
  const ns = ['version="2.0"']
  if (usesAtom) ns.push('xmlns:atom="http://www.w3.org/2005/Atom"')
  if (usesDc) ns.push('xmlns:dc="http://purl.org/dc/elements/1.1/"')

  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<rss ${ns.join(' ')}>`,
    '  <channel>',
    `    <title>${escapeText(feed.title)}</title>`,
    `    <link>${escapeText(link)}</link>`,
    `    <description>${escapeText(description)}</description>`,
  ]
  if (usesAtom && feed.self) {
    lines.push(
      `    <atom:link href="${escapeAttr(feed.self)}" rel="self" type="application/rss+xml"/>`,
    )
  }
  const lastBuildDate = toRfc822(feed.updated)
  if (lastBuildDate) lines.push(`    <lastBuildDate>${lastBuildDate}</lastBuildDate>`)
  if (feed.generator) {
    const version = feed.generator.version ? ` ${feed.generator.version}` : ''
    lines.push(`    <generator>${escapeText(feed.generator.name + version)}</generator>`)
  }
  for (const entry of feed.entries) {
    lines.push(itemXml(entry))
  }
  lines.push('  </channel>', '</rss>', '')
  return lines.join('\n')
}
