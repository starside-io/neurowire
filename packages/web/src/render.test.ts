import type { NeurowireFeed } from '@neurowire/core'
import type { FetchedConstruct } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { meshSlug, toConstructHtml, toConstructPages, toHtml } from './render'

const feedOf = (title: string, links: string[]): NeurowireFeed => ({
  id: title,
  title,
  updated: '2024-03-10T12:00:00.000Z',
  entries: links.map((link, i) => ({
    id: String(i),
    title: `${title} ${i}`,
    link,
    updated: '2024-03-10T12:00:00Z',
  })),
})

const construct: FetchedConstruct = {
  name: 'Daily Brief',
  parts: [
    {
      mesh: { name: 'AI News', sources: [{ name: 's', url: 'https://s' }] },
      feed: feedOf('AI News', ['https://a/1', 'https://a/2']),
    },
    { mesh: { name: 'AI News', sources: [] }, feed: feedOf('Dup', ['https://b/1']) },
    {
      mesh: { name: 'Empty', sources: [] },
      feed: { id: 'e', title: 'Empty', updated: '2024-01-01T00:00:00Z', entries: [] },
    },
  ],
}

const sample: NeurowireFeed = {
  id: 'https://blog.example.com/feed.atom',
  title: 'Example Blog',
  updated: '2024-03-10T12:00:00.000Z',
  entries: [
    {
      id: '1',
      title: 'Hello, World & <Friends>',
      link: 'https://blog.example.com/posts/hello-world',
      published: '2024-03-09T08:30:00Z',
      summary: 'A first post.',
      tags: ['intro', 'meta'],
    },
    {
      id: '2',
      title: 'Second',
      link: 'https://blog.example.com/posts/second',
      updated: '2024-03-10T11:00:00Z',
    },
  ],
}

describe('toHtml', () => {
  it('renders a self-contained, escaped page', () => {
    const html = toHtml(sample)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Example Blog - Neurowire</title>')
    expect(html).toContain('Hello, World &amp; &lt;Friends&gt;')
    expect(html).toContain('href="https://blog.example.com/posts/hello-world"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('<li>intro</li>')
    expect(html).toContain('A first post.')
    expect(html).toContain('>Example Blog<') // source falls back to the feed title
    expect(html).not.toContain('<link ') // no external stylesheet
    expect(html).not.toContain('googleapis') // no external fonts
  })

  it('renders the client-side search controls', () => {
    const html = toHtml(sample)
    // a search input with an associated visually-hidden label
    expect(html).toContain('<input class="search"')
    expect(html).toContain('type="search"')
    expect(html).toContain('for="search"')
    expect(html).toContain('class="visually-hidden"')
    // a live count region and an empty-state element
    expect(html).toContain('class="count" id="count" aria-live="polite"')
    expect(html).toContain('class="no-matches"')
    // the filter script reads data-search and reports "of ... shown"
    expect(html).toContain("getElementById('search')")
    expect(html).toContain("' of '")
  })

  it('puts a lowercased data-search haystack on every entry card', () => {
    const feed: NeurowireFeed = {
      id: 'm',
      title: 'Mesh',
      updated: '2024-01-02T00:00:00.000Z',
      entries: [
        {
          id: '1',
          title: 'Quantum Leap',
          link: 'https://a/1',
          summary: 'A Big Story',
          source: { name: 'ACME Labs' },
          tags: ['Physics'],
          authors: [{ name: 'Ada Lovelace' }],
        },
      ],
    }
    const html = toHtml(feed)
    const cards = html.match(/<li class="entry" data-search="([^"]*)"/g) ?? []
    // every entry card carries the attribute
    expect(cards.length).toBe(feed.entries.length)
    // it is lowercased and concatenates title + summary + source + tags + author
    const m = html.match(/<li class="entry" data-search="([^"]*)"/)
    const haystack = m?.[1] ?? ''
    expect(haystack).toContain('quantum leap')
    expect(haystack).toContain('a big story')
    expect(haystack).toContain('acme labs')
    expect(haystack).toContain('physics')
    expect(haystack).toContain('ada lovelace')
    expect(haystack).toBe(haystack.toLowerCase())
  })

  it('stays self-contained: no off-host refs except entry links', () => {
    const html = toHtml(sample)
    // collect every absolute URL in src=, href=, and url(...) refs
    const refs = [
      ...html.matchAll(/(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/g),
      ...html.matchAll(/url\(\s*"?(https?:\/\/[^")]+)"?\s*\)/g),
    ].map((x) => x[1] as string)
    const allowed = new Set<string>([
      'https://starside-io.github.io/neurowire/',
      ...sample.entries.map((e) => e.link),
    ])
    const offHost = refs.filter((u) => !allowed.has(u))
    expect(offHost).toEqual([])
  })

  it('assigns a distinct accent per source and counts distinct sources', () => {
    const feed: NeurowireFeed = {
      id: 'm',
      title: 'Mesh',
      updated: '2024-01-02T00:00:00.000Z',
      entries: [
        {
          id: '1',
          title: 'One',
          link: 'https://a/1',
          source: { name: 'Source A' },
          updated: '2024-01-02T00:00:00Z',
        },
        { id: '2', title: 'Two', link: 'https://b/2', source: { name: 'Source B' } },
        { id: '3', title: 'Three', link: 'https://a/3', source: { name: 'Source A' } },
      ],
    }
    const html = toHtml(feed)
    expect(html).toContain('>Source A<')
    expect(html).toContain('>Source B<')
    expect(html).toContain('<span class="count">3</span>')
    expect(html).toContain('sources</span> 2')
    expect(html).toContain('--rail: #45e6ff')
    expect(html).toContain('--rail: #ff5cc8')
  })

  it('omits date, summary, and tags when absent and tolerates a bad feed date', () => {
    const feed: NeurowireFeed = {
      id: 'e',
      title: 'Edge',
      updated: 'not-a-date',
      entries: [{ id: '1', title: 'Bare', link: 'https://x/1' }],
    }
    const html = toHtml(feed)
    expect(html).toContain('Bare')
    expect(html).not.toContain('class="summary"')
    expect(html).not.toContain('class="tags"')
    expect(html).not.toContain('class="card-date"')
    expect(html).toContain('>Edge<')
    expect(html).toContain('<time datetime="">')
  })
})

describe('meshSlug', () => {
  it('slugifies names and falls back to the index', () => {
    expect(meshSlug('AI News', 0)).toBe('ai-news')
    expect(meshSlug('  C++ & Rust!', 1)).toBe('c-rust')
    expect(meshSlug('', 2)).toBe('mesh-3')
  })
})

describe('toConstructHtml', () => {
  it('renders an overview with one recap card per mesh', () => {
    const html = toConstructHtml(construct)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Daily Brief - Neurowire</title>')
    expect(html).toContain('<span class="count">3</span> meshes')
    expect(html).toContain('<span class="count">3</span> entries') // 2 + 1 + 0
    expect(html).toContain('>AI News<')
    expect(html).toContain('class="recap"')
    expect(html).toContain('class="empty"') // the empty mesh
  })

  it('links cards when given an href, plain span otherwise', () => {
    const linked = toConstructHtml(construct, { meshHref: (_p, i) => `${i}.html` })
    expect(linked).toContain('href="0.html"')
    const plain = toConstructHtml(construct)
    expect(plain).not.toContain('<a href="0.html"')
  })
})

describe('toConstructPages', () => {
  it('emits an index plus one de-duplicated page per mesh', () => {
    const pages = toConstructPages(construct)
    expect(pages.map((p) => p.filename)).toEqual([
      'index.html',
      'ai-news.html',
      'ai-news-2.html',
      'empty.html',
    ])
    expect(pages[0]?.html).toContain('href="ai-news.html"')
    expect(pages[0]?.html).toContain('href="ai-news-2.html"')
    expect(pages[1]?.html).toContain('<title>AI News - Neurowire</title>')
  })
})
