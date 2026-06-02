import { load } from 'cheerio'
import { describe, expect, it } from 'vitest'
import { autodetect } from './autodetect'
import { findTemplate, listTemplates, registerTemplate } from './registry'
import { applyTemplate } from './template'

const ctx = { sourceUrl: 'https://b.example/' }
const html = (body: string): string => `<!doctype html><html>${body}</html>`

describe('template registry', () => {
  it('registers, finds, and lists templates', () => {
    registerTemplate({ host: 'reg.example', item: '.p', title: 'h2', link: 'a' })
    expect(findTemplate('https://reg.example/blog')?.item).toBe('.p')
    expect(findTemplate('https://unknown.example/')).toBeUndefined()
    expect(findTemplate('not a url')).toBeUndefined() // invalid URL -> caught
    expect(listTemplates().length).toBeGreaterThan(0)
  })
})

describe('applyTemplate extras', () => {
  it('extracts authors, tags, and links nested inside the link element', () => {
    const $ = load(
      html(
        '<div class="post"><span class="t">Title</span><div class="lnk"><a href="/x">go</a></div><span class="by">Ada</span><span class="tag">a</span><span class="tag">b</span></div>',
      ),
    )
    const feed = applyTemplate(
      $,
      { item: '.post', title: '.t', link: '.lnk', author: '.by', tags: '.tag' },
      ctx,
    )
    expect(feed.entries[0]?.link).toBe('https://b.example/x') // nested <a> found
    expect(feed.entries[0]?.authors?.[0]?.name).toBe('Ada')
    expect(feed.entries[0]?.tags).toEqual(['a', 'b'])
    expect(feed.title).toBe('https://b.example/') // no <title> -> sourceUrl
  })

  it('treats the item itself as the link when link is omitted', () => {
    const $ = load(html('<a href="/x" class="card"><p>Title</p></a>'))
    const feed = applyTemplate($, { item: 'a.card', title: 'p' }, ctx)
    expect(feed.entries[0]?.link).toBe('https://b.example/x')
    expect(feed.entries[0]?.title).toBe('Title')
  })
})

describe('autodetect extras', () => {
  it('extracts a top-level Article and uses og:site_name', () => {
    const $ = load(
      html(
        '<head><meta property="og:site_name" content="Site"/><script type="application/ld+json">{"@type":"Article","headline":"A1","url":"https://b.example/a1","datePublished":"2024-01-01T00:00:00Z","keywords":["x","y"]}</script></head>',
      ),
    )
    const feed = autodetect($, ctx)
    expect(feed?.title).toBe('Site')
    expect(feed?.entries[0]?.title).toBe('A1')
    expect(feed?.entries[0]?.tags).toEqual(['x', 'y'])
  })

  it('extracts an ItemList with item wrappers', () => {
    const $ = load(
      html(
        '<head><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"BlogPosting","headline":"L1","url":"https://b.example/l1"}},{"item":{"@type":"BlogPosting","headline":"L2","url":"https://b.example/l2"}}]}</script></head>',
      ),
    )
    expect(autodetect($, ctx)?.entries).toHaveLength(2)
  })

  it('ignores invalid JSON-LD and returns null when nothing is detectable', () => {
    const $ = load(
      html(
        '<head><script type="application/ld+json">{ not valid json </script></head><body><p>hi</p></body>',
      ),
    )
    expect(autodetect($, ctx)).toBeNull()
  })
})
