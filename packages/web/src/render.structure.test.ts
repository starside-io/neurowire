import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import type { FetchedConstruct } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { meshSlug, toConstructHtml, toConstructPages, toHtml } from './render'

const entry = (over: Partial<NeurowireEntry>): NeurowireEntry => ({
  id: over.id ?? over.link ?? 'id',
  title: over.title ?? 'Title',
  link: over.link ?? 'https://example.com/x',
  ...over,
})

const feedOf = (
  title: string,
  entries: NeurowireEntry[],
  updated = '2026-03-10T12:00:00.000Z',
): NeurowireFeed => ({
  id: title,
  title,
  updated,
  entries,
})

/**
 * The self-contained invariant: a generated page may only reference off-host
 * http(s) URLs through entry links (and the canonical Neurowire site in the
 * brand header/footer). No stylesheets, fonts, scripts, or images from the web.
 * We assert there is no `src=` or `<link ... href=` pointing at http(s), and
 * that every remaining http(s) reference is either an entry link or the site.
 */
const SITE = 'https://starside-io.github.io/neurowire/'

function offHostRefs(html: string, allowed: string[]): string[] {
  const urls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  const allow = new Set([SITE, ...allowed])
  return urls.filter((u) => !allow.has(u))
}

describe('toHtml self-contained invariant', () => {
  it('inlines all assets: no external stylesheet, font, script, or image', () => {
    const feed = feedOf('Blog', [
      entry({ id: '1', link: 'https://blog.example.com/a', summary: 'hi', tags: ['x'] }),
    ])
    const html = toHtml(feed)
    // No external resource elements.
    expect(html).not.toMatch(/<link\b[^>]*\bhref="https?:/i)
    expect(html).not.toMatch(/\bsrc="https?:/i)
    expect(html).not.toContain('googleapis')
    expect(html).not.toContain('cdn')
    // The only off-host http refs are the entry link(s).
    expect(offHostRefs(html, ['https://blog.example.com/a'])).toEqual([])
  })
})

describe('toHtml accent cycling', () => {
  it('cycles the accent palette and wraps past its length', () => {
    // 7 distinct sources, palette has 6 pairs, so source 7 reuses pair 1.
    const entries = Array.from({ length: 7 }, (_, i) =>
      entry({ id: String(i), link: `https://s/${i}`, source: { name: `Source ${i}` } }),
    )
    const html = toHtml(feedOf('Mesh', entries))
    expect(html).toContain('sources</span> 7')
    // First palette accent appears for both source 0 and the wrapped source 6.
    const railCount = (html.match(/--rail: #45e6ff/g) ?? []).length
    expect(railCount).toBe(2)
  })

  it('reuses one accent across repeated sources', () => {
    const entries = [
      entry({ id: '1', link: 'https://a/1', source: { name: 'A' } }),
      entry({ id: '2', link: 'https://a/2', source: { name: 'A' } }),
      entry({ id: '3', link: 'https://b/3', source: { name: 'B' } }),
    ]
    const html = toHtml(feedOf('Mesh', entries))
    expect(html).toContain('sources</span> 2')
    expect((html.match(/--rail: #45e6ff/g) ?? []).length).toBe(2) // both A entries
    expect((html.match(/--rail: #ff5cc8/g) ?? []).length).toBe(1) // B
  })
})

describe('toConstructPages collisions', () => {
  it('de-duplicates filenames when meshes slugify to the same stem', () => {
    const construct: FetchedConstruct = {
      name: 'Repo',
      parts: [
        { mesh: { name: 'AI News', sources: [] }, feed: feedOf('AI News', []) },
        { mesh: { name: 'AI  News', sources: [] }, feed: feedOf('AI News 2', []) },
        { mesh: { name: 'AI-News', sources: [] }, feed: feedOf('AI News 3', []) },
      ],
    }
    const pages = toConstructPages(construct)
    expect(pages.map((p) => p.filename)).toEqual([
      'index.html',
      'ai-news.html',
      'ai-news-2.html',
      'ai-news-3.html',
    ])
    // The index links each distinct page.
    expect(pages[0]?.html).toContain('href="ai-news.html"')
    expect(pages[0]?.html).toContain('href="ai-news-2.html"')
    expect(pages[0]?.html).toContain('href="ai-news-3.html"')
  })

  it('falls back to a mesh-N filename for an unslugifiable name', () => {
    const construct: FetchedConstruct = {
      name: 'Repo',
      parts: [{ mesh: { name: '!!!', sources: [] }, feed: feedOf('x', []) }],
    }
    const pages = toConstructPages(construct)
    expect(pages.map((p) => p.filename)).toEqual(['index.html', 'mesh-1.html'])
  })
})

describe('toConstructHtml dates', () => {
  it('uses the newest mesh date and renders an empty time when none have dates', () => {
    const noDate: FetchedConstruct = {
      name: 'Repo',
      parts: [
        {
          mesh: { name: 'A', sources: [] },
          feed: { id: 'a', title: 'A', updated: 'bad', entries: [] },
        },
      ],
    }
    const html = toConstructHtml(noDate)
    expect(html).toContain('<time datetime="">')

    const dated: FetchedConstruct = {
      name: 'Repo',
      parts: [
        { mesh: { name: 'A', sources: [] }, feed: feedOf('A', [], '2026-01-01T00:00:00.000Z') },
        { mesh: { name: 'B', sources: [] }, feed: feedOf('B', [], '2026-05-05T00:00:00.000Z') },
      ],
    }
    expect(toConstructHtml(dated)).toContain('datetime="2026-05-05"')
  })
})

describe('meshSlug edge cases', () => {
  it('strips leading/trailing separators and collapses runs', () => {
    expect(meshSlug('--Hello--World--', 0)).toBe('hello-world')
    expect(meshSlug('   ', 4)).toBe('mesh-5')
  })
})
