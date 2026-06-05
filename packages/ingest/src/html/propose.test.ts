import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { proposeTemplate } from './propose'

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), 'utf8')

const url = 'https://blog.example.com/'

describe('proposeTemplate', () => {
  it('proposes a tap for a feed-less listing page', () => {
    const proposal = proposeTemplate(fixture('page-listing.html'), url)
    expect(proposal).toBeDefined()
    if (!proposal) return

    expect(proposal.template.item).toBe('div.post-card')
    expect(proposal.template.title).toBe('h2')
    expect(proposal.template.link).toBe('h2 a')
    expect(proposal.template.date).toBe('time')
    expect(proposal.template.host).toBe('blog.example.com')
    expect(proposal.template.feedTitle).toBe('Feedless Listing')

    expect(proposal.matched).toBe(3)
    expect(proposal.sampleTitles).toEqual([
      'Alpha Release Notes',
      'Beta Feature Tour',
      'Gamma Performance Wins',
    ])
  })

  it('reuses semantic <article> markup', () => {
    const proposal = proposeTemplate(fixture('page-articles.html'), url)
    expect(proposal?.template.item).toBe('article')
    expect(proposal?.matched).toBe(3)
    expect(proposal?.sampleTitles[0]).toBe('Article One')
  })

  it('omits link when the item element is itself the anchor', () => {
    const html = `<!doctype html><html><head><title>Links</title></head><body>
      <ul>
        <li><a href="/a"><h3>First Link Post</h3></a></li>
        <li><a href="/b"><h3>Second Link Post</h3></a></li>
      </ul>
    </body></html>`
    const proposal = proposeTemplate(html, url)
    expect(proposal?.template.item).toBe('li')
    expect(proposal?.template.link).toBe('a')
    expect(proposal?.matched).toBe(2)
  })

  it('omits link when each card is itself the anchor (title in a child heading)', () => {
    const html = `<!doctype html><html><head><title>Cards</title></head><body>
      <nav>
        <a class="card" href="/one"><h3>One Card</h3></a>
        <a class="card" href="/two"><h3>Two Card</h3></a>
      </nav>
    </body></html>`
    const proposal = proposeTemplate(html, url)
    expect(proposal).toBeDefined()
    expect(proposal?.template.item).toBe('a.card')
    expect(proposal?.template.title).toBe('h3')
    expect(proposal?.template.link).toBeUndefined()
    expect(proposal?.matched).toBe(2)
  })

  it('returns undefined when no repeated items are found', () => {
    const html =
      '<!doctype html><html><head><title>Empty</title></head><body><p>nothing</p></body></html>'
    expect(proposeTemplate(html, url)).toBeUndefined()
  })

  it('falls back to <h1> for the feed title when <title> is absent', () => {
    const html = `<!doctype html><html><body>
      <h1>Page Heading</h1>
      <article><h2><a href="/x">Item X</a></h2></article>
      <article><h2><a href="/y">Item Y</a></h2></article>
    </body></html>`
    const proposal = proposeTemplate(html, url)
    expect(proposal?.template.feedTitle).toBe('Page Heading')
  })

  it('uses the [datetime] fallback for dates without a <time> tag', () => {
    const html = `<!doctype html><html><head><title>Dated</title></head><body>
      <article><h2><a href="/p1">Post 1</a></h2><span datetime="2024-01-01">Jan 1</span></article>
      <article><h2><a href="/p2">Post 2</a></h2><span datetime="2024-01-02">Jan 2</span></article>
    </body></html>`
    const proposal = proposeTemplate(html, url)
    expect(proposal?.template.date).toBe('[datetime]')
  })

  it('still proposes for an unparseable url (no host)', () => {
    const proposal = proposeTemplate(fixture('page-articles.html'), 'not a url')
    expect(proposal).toBeDefined()
    expect(proposal?.template.host).toBeUndefined()
  })
})
