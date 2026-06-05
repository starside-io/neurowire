import { afterEach, describe, expect, it, vi } from 'vitest'
import { type CachedResponse, createMemoryCache, fetchDocument } from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDocument', () => {
  it('returns the body, content type, and final url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<feed/>', {
            status: 200,
            headers: { 'content-type': 'application/atom+xml' },
          }),
      ),
    )
    const doc = await fetchDocument('https://example.com/feed')
    expect(doc.body).toBe('<feed/>')
    expect(doc.contentType).toContain('atom')
    expect(doc.url).toBe('https://example.com/feed')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' })),
    )
    await expect(fetchDocument('https://example.com/x')).rejects.toThrow(/Upstream responded 500/)
  })

  it('rejects an invalid URL', async () => {
    await expect(fetchDocument('not a url')).rejects.toThrow(/Invalid URL/)
  })

  it('rejects an unsupported protocol', async () => {
    await expect(fetchDocument('ftp://example.com/x')).rejects.toThrow(/Unsupported protocol/)
  })

  it('sends conditional headers when the cache has validators', async () => {
    const cache = createMemoryCache()
    cache.set('https://example.com/feed', {
      url: 'https://example.com/feed',
      contentType: 'application/atom+xml',
      body: '<feed/>',
      etag: 'W/"abc"',
      lastModified: 'Wed, 21 Oct 2025 07:28:00 GMT',
    })
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('<feed>new</feed>', {
          status: 200,
          headers: { 'content-type': 'application/atom+xml' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchDocument('https://example.com/feed', { cache })

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['if-none-match']).toBe('W/"abc"')
    expect(headers['if-modified-since']).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
  })

  it('returns the cached body on a 304 without throwing', async () => {
    const cache = createMemoryCache()
    const entry: CachedResponse = {
      url: 'https://example.com/feed',
      contentType: 'application/atom+xml',
      body: '<feed>cached</feed>',
      etag: 'W/"abc"',
    }
    cache.set('https://example.com/feed', entry)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 304 })),
    )

    const doc = await fetchDocument('https://example.com/feed', { cache })
    expect(doc.notModified).toBe(true)
    expect(doc.body).toBe('<feed>cached</feed>')
    expect(doc.etag).toBe('W/"abc"')
  })

  it('falls through to a normal read when a 304 has no cache entry', async () => {
    const cache = createMemoryCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<feed/>', {
            status: 200,
            headers: { 'content-type': 'application/atom+xml' },
          }),
      ),
    )
    const doc = await fetchDocument('https://example.com/feed', { cache })
    expect(doc.body).toBe('<feed/>')
    expect(doc.notModified).toBeUndefined()
  })

  it('stores etag and last-modified into the cache on a 200', async () => {
    const cache = createMemoryCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<feed/>', {
            status: 200,
            headers: {
              'content-type': 'application/atom+xml',
              etag: 'W/"v1"',
              'last-modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
            },
          }),
      ),
    )
    const doc = await fetchDocument('https://example.com/feed', { cache })
    expect(doc.etag).toBe('W/"v1"')
    expect(doc.lastModified).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
    const stored = cache.get('https://example.com/feed')
    expect(stored?.etag).toBe('W/"v1"')
    expect(stored?.lastModified).toBe('Wed, 21 Oct 2025 07:28:00 GMT')
    expect(stored?.body).toBe('<feed/>')
  })

  it('does not send conditional headers without a cache', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('<feed/>', {
          status: 200,
          headers: { 'content-type': 'application/atom+xml' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const doc = await fetchDocument('https://example.com/feed')
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['if-none-match']).toBeUndefined()
    expect(headers['if-modified-since']).toBeUndefined()
    expect(doc.body).toBe('<feed/>')
  })
})
