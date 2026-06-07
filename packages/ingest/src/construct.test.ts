import type { Mesh } from '@neurowire/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchConstruct, flattenConstruct, resolveConstructMembers } from './construct'

const atom = (title: string, link: string, date: string): string =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${title}</title><entry><id>${link}</id><title>${title} post</title><link href="${link}"/><updated>${date}</updated></entry></feed>`

const xmlResponse = (body: string) =>
  new Response(body, { headers: { 'content-type': 'application/atom+xml' } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveConstructMembers', () => {
  const security: Mesh = { name: 'Security', sources: [{ name: 's', url: 'https://s.example' }] }

  it('passes inline meshes through and resolves refs', () => {
    const meshes = resolveConstructMembers(
      {
        name: 'Daily',
        meshes: [{ ref: 'security' }, { name: 'Inline', sources: [] }],
      },
      (ref) => (ref === 'security' ? security : undefined),
    )
    expect(meshes[0]).toBe(security)
    expect(meshes[1]?.name).toBe('Inline')
  })

  it('throws when a ref has no resolver', () => {
    expect(() => resolveConstructMembers({ name: 'D', meshes: [{ ref: 'x' }] })).toThrow(
      /no resolver/,
    )
  })

  it('throws when a ref cannot be resolved', () => {
    expect(() =>
      resolveConstructMembers({ name: 'D', meshes: [{ ref: 'x' }] }, () => undefined),
    ).toThrow(/unknown mesh "x"/)
  })
})

describe('fetchConstruct', () => {
  it('fetches each mesh into its own feed, grouping preserved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('one')
          ? xmlResponse(atom('One', 'https://one.example/a', '2024-01-02T00:00:00Z'))
          : xmlResponse(atom('Two', 'https://two.example/b', '2024-01-01T00:00:00Z')),
      ),
    )
    const fetched = await fetchConstruct(
      {
        name: 'Daily',
        meshes: [
          { name: 'Mesh One', sources: [{ name: 'One', url: 'https://one.example/feed' }] },
          { ref: 'two' },
        ],
      },
      {
        resolver: (ref) =>
          ref === 'two'
            ? { name: 'Mesh Two', sources: [{ name: 'Two', url: 'https://two.example/feed' }] }
            : undefined,
      },
    )

    expect(fetched.name).toBe('Daily')
    expect(fetched.parts).toHaveLength(2)
    expect(fetched.parts.map((p) => p.mesh.name)).toEqual(['Mesh One', 'Mesh Two'])
    expect(fetched.parts[0]?.feed.entries).toHaveLength(1)
  })

  it('skips meshes that fail, throws only if all fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) =>
        String(input).includes('ok')
          ? xmlResponse(atom('OK', 'https://ok.example/a', '2024-01-01T00:00:00Z'))
          : new Response('no', { status: 500 }),
      ),
    )
    const fetched = await fetchConstruct({
      name: 'C',
      meshes: [
        { name: 'Dead', sources: [{ name: 'D', url: 'https://dead.example/feed' }] },
        { name: 'Live', sources: [{ name: 'L', url: 'https://ok.example/feed' }] },
      ],
    })
    expect(fetched.parts).toHaveLength(1)
    expect(fetched.parts[0]?.mesh.name).toBe('Live')

    await expect(
      fetchConstruct({
        name: 'AllDead',
        meshes: [{ name: 'D', sources: [{ name: 'D', url: 'https://dead.example/feed' }] }],
      }),
    ).rejects.toThrow(/no meshes/)
  })

  it('bounds mesh concurrency and preserves order', async () => {
    let inFlight = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 10))
        inFlight--
        const u = String(input)
        return xmlResponse(atom('E', `${u}#a`, '2024-01-01T00:00:00Z'))
      }),
    )
    const meshes = Array.from({ length: 6 }, (_, i) => ({
      name: `M${i}`,
      sources: [{ name: `s${i}`, url: `https://m${i}.example/feed` }],
    }))
    const fetched = await fetchConstruct({ name: 'C', meshes }, { concurrency: 2 })
    expect(peak).toBeLessThanOrEqual(2)
    expect(fetched.parts.map((p) => p.mesh.name)).toEqual(['M0', 'M1', 'M2', 'M3', 'M4', 'M5'])
  })
})

describe('flattenConstruct', () => {
  it('merges all parts into one feed, tagged by mesh name', () => {
    const feed = flattenConstruct({
      name: 'Daily',
      parts: [
        {
          mesh: { name: 'Mesh One', sources: [] },
          feed: {
            id: '1',
            title: 'Mesh One',
            updated: '2024-01-02T00:00:00Z',
            entries: [
              { id: 'a', title: 'A', link: 'https://x/a', updated: '2024-01-02T00:00:00Z' },
            ],
          },
        },
        {
          mesh: { name: 'Mesh Two', sources: [] },
          feed: {
            id: '2',
            title: 'Mesh Two',
            updated: '2024-01-01T00:00:00Z',
            entries: [
              { id: 'b', title: 'B', link: 'https://x/b', updated: '2024-01-01T00:00:00Z' },
            ],
          },
        },
      ],
    })
    expect(feed.title).toBe('Daily')
    expect(feed.entries.map((e) => e.title)).toEqual(['A', 'B'])
    expect(feed.entries.map((e) => e.source?.name)).toEqual(['Mesh One', 'Mesh Two'])
  })

  it('honors a limit', () => {
    const feed = flattenConstruct(
      {
        name: 'D',
        parts: [
          {
            mesh: { name: 'M', sources: [] },
            feed: {
              id: '1',
              title: 'M',
              updated: '2024-01-02T00:00:00Z',
              entries: [
                { id: 'a', title: 'A', link: 'https://x/a', updated: '2024-01-02T00:00:00Z' },
                { id: 'b', title: 'B', link: 'https://x/b', updated: '2024-01-01T00:00:00Z' },
              ],
            },
          },
        ],
      },
      { limit: 1 },
    )
    expect(feed.entries).toHaveLength(1)
    expect(feed.entries[0]?.title).toBe('A')
  })
})
