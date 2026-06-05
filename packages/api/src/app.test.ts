import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './app'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('api', () => {
  it('reports health', async () => {
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })

  it('rejects /feed without a url', async () => {
    const res = await app.request('/feed')
    expect(res.status).toBe(400)
  })

  it('rejects /feed with an unknown format', async () => {
    const res = await app.request('/feed?url=https://example.com&format=zzz')
    expect(res.status).toBe(400)
  })

  it('describes itself and lists meshes at the root', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; meshes: string[] }
    expect(body).toMatchObject({ name: 'neurowire' })
    expect(body.meshes).toContain('ai-news')
  })

  it('rejects /mesh without src', async () => {
    const res = await app.request('/mesh')
    expect(res.status).toBe(400)
  })

  it('404s an unknown mesh', async () => {
    const res = await app.request('/mesh?src=does-not-exist')
    expect(res.status).toBe(404)
  })

  it('rejects /mesh with an unknown format', async () => {
    const res = await app.request('/mesh?src=ai-news&format=zzz')
    expect(res.status).toBe(400)
  })

  it('rejects POST /mesh with an invalid body', async () => {
    const res = await app.request('/mesh', {
      method: 'POST',
      body: JSON.stringify({ nope: true }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('serves a second identical /feed from the TTL cache', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(ATOM_FEED, {
          status: 200,
          headers: { 'content-type': 'application/atom+xml' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const url = `https://example.com/cache-test-${Math.random()}`
    const first = await app.request(`/feed?url=${encodeURIComponent(url)}&format=atom`)
    const second = await app.request(`/feed?url=${encodeURIComponent(url)}&format=atom`)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.text()).toBe(await second.text())
    // The upstream was fetched only once across both requests.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
