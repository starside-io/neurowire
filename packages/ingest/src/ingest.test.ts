import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFeed, ingestDocument } from './ingest'

const html = (body: string): string => `<!doctype html><html>${body}</html>`
const atom =
  '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><entry><title>E</title><link href="https://b.example/1"/></entry></feed>'
const rss =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>RSS</title><item><title>I</title><link>https://b.example/i</link></item></channel></rss>'

const xmlResponse = (body: string, type = 'application/atom+xml') =>
  new Response(body, { headers: { 'content-type': type } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ingestDocument', () => {
  it('parses a non-html feed document directly', async () => {
    const feed = await ingestDocument({
      url: 'https://b.example/feed.xml',
      contentType: 'application/atom+xml',
      body: atom,
    })
    expect(feed.title).toBe('T')
    expect(feed.entries).toHaveLength(1)
  })

  it('uses an explicit template for html', async () => {
    const feed = await ingestDocument(
      {
        url: 'https://b.example/',
        contentType: 'text/html',
        body: html('<div class="p"><h2>One</h2><a href="/1">x</a></div>'),
      },
      { template: { item: '.p', title: 'h2', link: 'a' } },
    )
    expect(feed.entries[0]?.title).toBe('One')
    expect(feed.entries[0]?.link).toBe('https://b.example/1')
  })

  it('auto-detects semantic article markup', async () => {
    const feed = await ingestDocument({
      url: 'https://b.example/',
      contentType: 'text/html',
      body: html(
        '<article><h2><a href="/a">A</a></h2></article><article><h2><a href="/b">B</a></h2></article>',
      ),
    })
    expect(feed.entries).toHaveLength(2)
  })

  it('falls back to a registered per-host template', async () => {
    const feed = await ingestDocument({
      url: 'https://example-blog.test/',
      contentType: 'text/html',
      body: html(
        '<div class="post-list"><div class="post"><div class="post-title"><a href="/p1">Post 1</a></div></div></div>',
      ),
    })
    expect(feed.entries[0]?.title).toBe('Post 1')
  })

  it('follows a discovered feed link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input) === 'https://b.example/feed.xml'
          ? xmlResponse(rss, 'application/rss+xml')
          : new Response('no', { status: 404 }),
      ),
    )
    const feed = await ingestDocument({
      url: 'https://b.example/',
      contentType: 'text/html',
      body: html(
        '<head><link rel="alternate" type="application/rss+xml" href="/feed.xml"/></head>',
      ),
    })
    expect(feed.title).toBe('RSS')
  })

  it('falls through when the discovered feed fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 404 })),
    )
    await expect(
      ingestDocument({
        url: 'https://b.example/',
        contentType: 'text/html',
        body: html(
          '<head><link rel="alternate" type="application/atom+xml" href="/feed.xml"/></head><body><p>empty</p></body>',
        ),
      }),
    ).rejects.toThrow(/could not extract/)
  })

  it('throws when nothing can be extracted', async () => {
    await expect(
      ingestDocument({
        url: 'https://b.example/',
        contentType: 'text/html',
        body: html('<p>nothing here</p>'),
      }),
    ).rejects.toThrow(/could not extract/)
  })
})

describe('fetchFeed', () => {
  it('fetches a url and parses the result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => xmlResponse(atom)),
    )
    const feed = await fetchFeed('https://b.example/feed')
    expect(feed.title).toBe('T')
  })
})
