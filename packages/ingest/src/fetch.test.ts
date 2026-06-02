import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDocument } from './fetch'

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
})
