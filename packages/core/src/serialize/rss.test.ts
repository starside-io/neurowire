import { describe, expect, it } from 'vitest'
import type { NeurowireFeed } from '../model'
import { sampleFeed } from '../test-fixtures'
import { toRfc822, toRss } from './rss'

describe('toRfc822', () => {
  it('formats an ISO date as RFC 822 in GMT', () => {
    expect(toRfc822('2024-10-02T13:00:00Z')).toBe('Wed, 02 Oct 2024 13:00:00 GMT')
  })

  it('zero-pads day, hours, minutes, and seconds', () => {
    expect(toRfc822('2024-01-05T03:07:09Z')).toBe('Fri, 05 Jan 2024 03:07:09 GMT')
  })

  it('converts a non-UTC offset to GMT', () => {
    expect(toRfc822('2024-10-02T15:00:00+02:00')).toBe('Wed, 02 Oct 2024 13:00:00 GMT')
  })

  it('returns undefined for an unparseable date', () => {
    expect(toRfc822('not a date')).toBeUndefined()
  })
})

describe('toRss', () => {
  it('produces a well-formed RSS 2.0 document', () => {
    const xml = toRss(sampleFeed)
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('<title>Example Blog</title>')
    expect(xml).toContain('<link>https://blog.example.com/</link>')
    expect(xml).toContain('<description>Example Blog</description>')
    expect(xml).toContain('<lastBuildDate>Sun, 10 Mar 2024 12:00:00 GMT</lastBuildDate>')
    expect(xml).toContain('<generator>Neurowire 0.1.0</generator>')
  })

  it('declares atom and dc namespaces when those elements are used', () => {
    const xml = toRss(sampleFeed)
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"')
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"')
    expect(xml).toContain(
      '<atom:link href="https://blog.example.com/feed.atom" rel="self" type="application/rss+xml"/>',
    )
    expect(xml).toContain('<dc:creator>Ada Lovelace</dc:creator>')
  })

  it('emits one item per entry with link, pubDate, and categories', () => {
    const xml = toRss(sampleFeed)
    expect(xml.match(/<item>/g) ?? []).toHaveLength(sampleFeed.entries.length)
    expect(xml).toContain('<link>https://blog.example.com/posts/hello-world</link>')
    expect(xml).toContain('<pubDate>Sat, 09 Mar 2024 08:30:00 GMT</pubDate>')
    expect(xml).toContain('<category>formats</category>')
  })

  it('escapes XML special characters in titles and descriptions', () => {
    const xml = toRss(sampleFeed)
    expect(xml).toContain('<title>Hello, World &amp; &lt;Friends&gt;</title>')
    const feed: NeurowireFeed = {
      ...sampleFeed,
      entries: [
        {
          id: 'x',
          title: 'Plain',
          link: 'https://e.com/x',
          summary: 'A & B < C > D',
        },
      ],
    }
    expect(toRss(feed)).toContain('<description>A &amp; B &lt; C &gt; D</description>')
  })

  it('marks guid isPermaLink="true" when the id equals the link', () => {
    const xml = toRss(sampleFeed)
    expect(xml).toContain(
      '<guid isPermaLink="true">https://blog.example.com/posts/hello-world</guid>',
    )
  })

  it('marks guid isPermaLink="false" for a synthetic id', () => {
    const feed: NeurowireFeed = {
      id: 'feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      entries: [{ id: 'nw:abc123', title: 'A', link: 'https://e.com/a' }],
    }
    expect(toRss(feed)).toContain('<guid isPermaLink="false">nw:abc123</guid>')
  })

  it('falls back from home to self to id for the channel link', () => {
    const viaSelf: NeurowireFeed = {
      id: 'feed-id',
      title: 'T',
      self: 'https://e.com/feed.xml',
      updated: '2024-10-02T13:00:00Z',
      entries: [],
    }
    expect(toRss(viaSelf)).toContain('<link>https://e.com/feed.xml</link>')

    const viaId: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      entries: [],
    }
    expect(toRss(viaId)).toContain('<link>urn:feed-id</link>')
  })

  it('omits optional channel and item fields when absent', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'Minimal',
      updated: 'not a date',
      entries: [{ id: 'urn:1', title: 'No date', link: 'https://e.com/1' }],
    }
    const xml = toRss(feed)
    expect(xml).not.toContain('xmlns:atom')
    expect(xml).not.toContain('xmlns:dc')
    expect(xml).not.toContain('<atom:link')
    expect(xml).not.toContain('<generator>')
    expect(xml).not.toContain('<lastBuildDate>')
    expect(xml).not.toContain('<pubDate>')
    expect(xml).not.toContain('<description></description>')
    expect(xml).not.toContain('<source')
  })

  it('handles an empty entry list', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'Empty',
      updated: '2024-10-02T13:00:00Z',
      entries: [],
    }
    const xml = toRss(feed)
    expect(xml).not.toContain('<item>')
    expect(xml).toContain('</channel>')
  })

  it('emits a generator without a version when none is set', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      generator: { name: 'Custom' },
      entries: [],
    }
    expect(toRss(feed)).toContain('<generator>Custom</generator>')
  })

  it('uses entry.updated as pubDate when published is absent', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      entries: [
        { id: 'urn:1', title: 'A', link: 'https://e.com/1', updated: '2024-10-02T13:00:00Z' },
      ],
    }
    expect(toRss(feed)).toContain('<pubDate>Wed, 02 Oct 2024 13:00:00 GMT</pubDate>')
  })

  it('emits a source element with a url and name', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      entries: [
        {
          id: 'urn:1',
          title: 'A',
          link: 'https://e.com/1',
          source: { name: 'Example', url: 'https://e.com/feed.xml' },
        },
      ],
    }
    expect(toRss(feed)).toContain('<source url="https://e.com/feed.xml">Example</source>')
  })

  it('uses the source url as the element text when no name is set', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      entries: [
        {
          id: 'urn:1',
          title: 'A',
          link: 'https://e.com/1',
          source: { url: 'https://e.com/feed.xml' },
        },
      ],
    }
    expect(toRss(feed)).toContain(
      '<source url="https://e.com/feed.xml">https://e.com/feed.xml</source>',
    )
  })

  it('omits source when it has a name but no url (url is required by RSS 2.0)', () => {
    const feed: NeurowireFeed = {
      id: 'urn:feed-id',
      title: 'T',
      updated: '2024-10-02T13:00:00Z',
      entries: [{ id: 'urn:1', title: 'A', link: 'https://e.com/1', source: { name: 'Example' } }],
    }
    expect(toRss(feed)).not.toContain('<source')
  })

  it('matches the full-document snapshot', () => {
    expect(toRss(sampleFeed)).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel>
          <title>Example Blog</title>
          <link>https://blog.example.com/</link>
          <description>Example Blog</description>
          <atom:link href="https://blog.example.com/feed.atom" rel="self" type="application/rss+xml"/>
          <lastBuildDate>Sun, 10 Mar 2024 12:00:00 GMT</lastBuildDate>
          <generator>Neurowire 0.1.0</generator>
          <item>
            <title>Hello, World &amp; &lt;Friends&gt;</title>
            <link>https://blog.example.com/posts/hello-world</link>
            <guid isPermaLink="true">https://blog.example.com/posts/hello-world</guid>
            <pubDate>Sat, 09 Mar 2024 08:30:00 GMT</pubDate>
            <dc:creator>Ada Lovelace</dc:creator>
            <category>intro</category>
            <category>meta</category>
            <description>A first post about getting started.</description>
          </item>
          <item>
            <title>On Compact Formats</title>
            <link>https://blog.example.com/posts/second</link>
            <guid isPermaLink="true">https://blog.example.com/posts/second</guid>
            <pubDate>Sun, 10 Mar 2024 11:00:00 GMT</pubDate>
            <dc:creator>Grace Hopper</dc:creator>
            <category>intro</category>
            <category>formats</category>
            <description>Why fewer bytes can be nicer.</description>
          </item>
        </channel>
      </rss>
      "
    `)
  })
})
