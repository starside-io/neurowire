export type FeedKind = 'atom' | 'rss' | 'rdf' | 'jsonfeed' | 'html'

/** Classify a fetched document by content-type, then by sniffing the body. */
export function detectKind(contentType: string, body: string): FeedKind {
  const ct = contentType.toLowerCase()
  if (ct.includes('atom')) return 'atom'
  if (ct.includes('rss')) return 'rss'
  if (ct.includes('feed+json')) return 'jsonfeed'

  const head = body.slice(0, 2000).toLowerCase()
  if (ct.includes('json') || body.trimStart().startsWith('{')) {
    if (head.includes('jsonfeed.org') || head.includes('"items"')) return 'jsonfeed'
  }
  if (head.includes('<feed')) return 'atom'
  if (head.includes('<rss')) return 'rss'
  if (head.includes('rdf:rdf')) return 'rdf'
  if (head.includes('jsonfeed.org')) return 'jsonfeed'
  return 'html'
}
