import { describe, expect, it } from 'vitest'
import { parseFeedString, parseJsonFeed } from './feed'

const ctx = { sourceUrl: 'https://b.example/' }

describe('parsers extras', () => {
  it('parses an RDF / RSS 1.0 feed', () => {
    const rdf =
      '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>RDF Feed</title><link>https://b.example/</link><dc:date>2024-03-01T00:00:00Z</dc:date></channel><item><title>RDF Item</title><link>https://b.example/1</link><dc:date>2024-03-01T00:00:00Z</dc:date><dc:creator>Ada</dc:creator></item></rdf:RDF>'
    const feed = parseFeedString(rdf, ctx)
    expect(feed.title).toBe('RDF Feed')
    expect(feed.entries[0]?.title).toBe('RDF Item')
    expect(feed.entries[0]?.authors?.[0]?.name).toBe('Ada')
  })

  it('decodes numeric HTML entities in titles', () => {
    const rss =
      '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://b.example/</link><item><title>Alphabet&#8217;s &amp; Google&#x2019;s news</title><link>https://b.example/1</link></item></channel></rss>'
    const feed = parseFeedString(rss, ctx)
    expect(feed.entries[0]?.title).toBe('Alphabet’s & Google’s news')
  })

  it('throws on unrecognized content', () => {
    expect(() => parseFeedString('<html><body>not a feed</body></html>', ctx)).toThrow(
      /Unrecognized/,
    )
  })

  it('parses a JSON Feed using external_url, content_text, and singular author', () => {
    const feed = parseJsonFeed(
      {
        title: 'JF',
        items: [
          {
            id: 1,
            external_url: 'https://b.example/x',
            content_text: 'plain text body',
            author: { name: 'Bob' },
            date_published: '2024-01-01T00:00:00Z',
          },
        ],
      },
      ctx,
    )
    expect(feed.entries[0]?.link).toBe('https://b.example/x') // external_url fallback
    expect(feed.entries[0]?.summary).toBe('plain text body') // content_text fallback
    expect(feed.entries[0]?.authors?.[0]?.name).toBe('Bob') // singular author
    expect(feed.entries[0]?.id).toBe('1') // numeric id stringified
  })
})
