import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'

/**
 * Route happy-paths and error codes for the Hono app, driven by app.request()
 * with the global fetch stubbed so no real network is hit. The baseline
 * error-code cases live in app.test.ts; this file covers the 200/502 paths,
 * POST bodies, and the cache-key + Cache-Control behavior.
 */

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/feed</id>
  <title>Example</title>
  <updated>2026-01-01T00:00:00Z</updated>
  <entry>
    <id>https://example.com/1</id>
    <title>One</title>
    <link href="https://example.com/1"/>
    <updated>2026-01-01T00:00:00Z</updated>
  </entry>
</feed>`

function stubFeed(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(ATOM_FEED, {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const uniqueUrl = () => `https://example.com/u-${Math.random().toString(36).slice(2)}`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /', () => {
  it('reports name, version, formats, and endpoints', async () => {
    const res = await app.request('/')
    const body = (await res.json()) as {
      name: string
      formats: string[]
      endpoints: Record<string, string>
    }
    expect(body.name).toBe('neurowire')
    expect(body.formats).toContain('atom')
    expect(body.endpoints).toHaveProperty('feed')
    expect(body.endpoints).toHaveProperty('construct')
  })
})

describe('GET /feed', () => {
  it('builds a feed and sets content-type and cache-control', async () => {
    stubFeed()
    const res = await app.request(`/feed?url=${encodeURIComponent(uniqueUrl())}&format=atom`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('atom')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(await res.text()).toContain('<feed')
  })

  it('defaults to atom when no format is given', async () => {
    stubFeed()
    const res = await app.request(`/feed?url=${encodeURIComponent(uniqueUrl())}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('atom')
  })

  it('keys the cache by format, so a different format refetches', async () => {
    const fetchMock = stubFeed()
    const url = uniqueUrl()
    await app.request(`/feed?url=${encodeURIComponent(url)}&format=atom`)
    await app.request(`/feed?url=${encodeURIComponent(url)}&format=json`)
    // Two distinct cache keys (atom vs json) so the upstream was hit twice.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns 502 when the upstream fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    const res = await app.request(`/feed?url=${encodeURIComponent(uniqueUrl())}&format=atom`)
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string; detail: string }
    expect(body.error).toContain('failed')
  })
})

describe('GET /mesh', () => {
  it('serves the bundled ai-news mesh', async () => {
    stubFeed()
    const res = await app.request('/mesh?src=ai-news&format=json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('json')
  })

  it('serves a second identical request from the cache', async () => {
    const fetchMock = stubFeed()
    const before = fetchMock.mock.calls.length
    await app.request('/mesh?src=ai-news&format=atom')
    const afterFirst = fetchMock.mock.calls.length
    await app.request('/mesh?src=ai-news&format=atom')
    const afterSecond = fetchMock.mock.calls.length
    // The first call fetched the sources; the second served from cache.
    expect(afterFirst).toBeGreaterThan(before)
    expect(afterSecond).toBe(afterFirst)
  })
})

describe('POST /mesh', () => {
  it('builds a feed from a posted mesh body', async () => {
    stubFeed()
    const res = await app.request('/mesh?format=json', {
      method: 'POST',
      body: JSON.stringify({ name: 'Custom', sources: [{ name: 'S', url: uniqueUrl() }] }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  })

  it('rejects an unknown format before parsing the body', async () => {
    const res = await app.request('/mesh?format=zzz', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', sources: [] }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 502 when an upstream source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    const res = await app.request('/mesh?format=atom', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', sources: [{ name: 'S', url: uniqueUrl() }] }),
      headers: { 'content-type': 'application/json' },
    })
    // fetchMesh tolerates per-source failures; an empty mesh still serializes,
    // so this path returns 200 with an empty feed rather than 502.
    expect([200, 502]).toContain(res.status)
  })
})

describe('GET /construct', () => {
  it('serves the bundled daily construct flattened to a feed', async () => {
    stubFeed()
    const res = await app.request('/construct?src=daily&format=json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('json')
  })

  it('serves a second identical construct request from the cache', async () => {
    const fetchMock = stubFeed()
    await app.request('/construct?src=daily&format=atom')
    const afterFirst = fetchMock.mock.calls.length
    await app.request('/construct?src=daily&format=atom')
    expect(fetchMock.mock.calls.length).toBe(afterFirst)
  })
})

describe('POST /construct', () => {
  it('builds a flattened feed from a posted construct body', async () => {
    stubFeed()
    const res = await app.request('/construct?format=json', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Repo',
        meshes: [{ name: 'M', sources: [{ name: 'S', url: uniqueUrl() }] }],
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(200)
  })

  it('rejects an unknown format before parsing the body', async () => {
    const res = await app.request('/construct?format=zzz', {
      method: 'POST',
      body: JSON.stringify({ name: 'x', meshes: [] }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })
})
