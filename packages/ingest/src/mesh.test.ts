import { toNwf } from '@neurowire/core'
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

  it('sends per-source headers only to that source', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) =>
      String(input).includes('one')
        ? xmlResponse(atom('One', 'https://one.example/a', '2024-01-02T00:00:00Z'))
        : xmlResponse(atom('Two', 'https://two.example/b', '2024-01-01T00:00:00Z')),
    )
    vi.stubGlobal('fetch', fetchMock)
    await fetchMesh({
      name: 'Bundle',
      sources: [
        { name: 'One', url: 'https://one.example/feed', headers: { authorization: 'Bearer one' } },
        { name: 'Two', url: 'https://two.example/feed' },
      ],
    })
    const byUrl = new Map(
      fetchMock.mock.calls.map(([input, init]) => [
        String(input),
        init?.headers as Record<string, string>,
      ]),
    )
    expect(byUrl.get('https://one.example/feed')?.authorization).toBe('Bearer one')
    expect(byUrl.get('https://two.example/feed')?.authorization).toBeUndefined()
  })

  it('takes a published nwf file as a source, merged like any other', async () => {
    const nwf = toNwf({
      id: 'https://mirror.example/',
      title: 'Mirror',
      updated: '2024-01-03T00:00:00.000Z',
      entries: [
        {
          id: 'urn:m:1',
          title: 'From nwf',
          link: 'https://mirror.example/1',
          published: '2024-01-03T00:00:00.000Z',
        },
      ],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('feed.nwf')
          ? new Response(nwf, { headers: { 'content-type': 'text/x-neurowire' } })
          : xmlResponse(atom('Two', 'https://two.example/b', '2024-01-01T00:00:00Z')),
      ),
    )
    const feed = await fetchMesh({
      name: 'Bundle',
      sources: [
        { name: 'Mirror', url: 'https://mirror.example/feed.nwf' },
        { name: 'Source Two', url: 'https://two.example/feed' },
      ],
    })
    expect(feed.entries.map((entry) => entry.title)).toEqual(['From nwf', 'Two post'])
    expect(feed.entries[0]?.source?.name).toBe('Mirror')
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
    const errors: Array<{ name: string; url: string }> = []
    const onSourceError = (source: { name: string; url: string }) => {
      errors.push(source)
    }
    // retries: 0 keeps the failing source fast (no backoff waits).
    const feed = await fetchMesh(
      {
        name: 'M',
        sources: [
          { name: 'Dead', url: 'https://dead.example/feed' },
          { name: 'Live', url: 'https://ok.example/feed' },
        ],
      },
      { retries: 0, onSourceError },
    )
    expect(feed.entries).toHaveLength(1)
    expect(feed.entries[0]?.source?.name).toBe('Live')
    // The failed source was reported by name, not silently dropped.
    expect(errors).toEqual([{ name: 'Dead', url: 'https://dead.example/feed' }])

    await expect(
      fetchMesh(
        { name: 'AllDead', sources: [{ name: 'D', url: 'https://dead.example/feed' }] },
        { retries: 0, onSourceError },
      ),
    ).rejects.toThrow(/no sources/)
  })

  it('warns on stderr by default when a source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('ok')
          ? xmlResponse(atom('OK', 'https://ok.example/a', '2024-01-01T00:00:00Z'))
          : new Response('no', { status: 404 }),
      ),
    )
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    await fetchMesh(
      {
        name: 'M',
        sources: [
          { name: 'Dead', url: 'https://dead.example/feed' },
          { name: 'Live', url: 'https://ok.example/feed' },
        ],
      },
      { retries: 0 },
    )
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('mesh source "Dead" (https://dead.example/feed) failed'),
    )
    write.mockRestore()
  })
})
