import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMesh } from './mesh'

const atom = (title: string, link: string, date: string): string =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${title}</title><entry><id>${link}</id><title>${title} post</title><link href="${link}"/><updated>${date}</updated></entry></feed>`

const xmlResponse = (body: string) =>
  new Response(body, { headers: { 'content-type': 'application/atom+xml' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchMesh', () => {
  it('fetches all sources and merges them, tagged and sorted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('one')
          ? xmlResponse(atom('One', 'https://one.example/a', '2024-01-02T00:00:00Z'))
          : xmlResponse(atom('Two', 'https://two.example/b', '2024-01-01T00:00:00Z')),
      ),
    )
    const feed = await fetchMesh({
      name: 'Bundle',
      sources: [
        { name: 'Source One', url: 'https://one.example/feed' },
        { name: 'Source Two', url: 'https://two.example/feed' },
      ],
    })
    expect(feed.title).toBe('Bundle')
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries.map((e) => e.source?.name)).toEqual(['Source One', 'Source Two'])
  })

  it('skips sources that fail, and throws only if every source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('ok')
          ? xmlResponse(atom('OK', 'https://ok.example/a', '2024-01-01T00:00:00Z'))
          : new Response('no', { status: 500 }),
      ),
    )
    const feed = await fetchMesh({
      name: 'M',
      sources: [
        { name: 'Dead', url: 'https://dead.example/feed' },
        { name: 'Live', url: 'https://ok.example/feed' },
      ],
    })
    expect(feed.entries).toHaveLength(1)
    expect(feed.entries[0]?.source?.name).toBe('Live')

    await expect(
      fetchMesh({ name: 'AllDead', sources: [{ name: 'D', url: 'https://dead.example/feed' }] }),
    ).rejects.toThrow(/no sources/)
  })
})
