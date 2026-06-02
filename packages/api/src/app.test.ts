import { describe, expect, it } from 'vitest'
import { app } from './app'

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
})
