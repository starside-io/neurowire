import type { Peer, SyncReport } from '@neurowire/ingest'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addPeer,
  formatBytes,
  formatPeersConfig,
  formatPeersList,
  formatSyncReport,
  normalizePeerUrl,
  parsePeersConfig,
  peerFromArgs,
  peersConfigPath,
  readPeersConfig,
  removePeer,
} from './sync'

describe('peersConfigPath', () => {
  const previous = process.env.NEUROWIRE_PEERS

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: restoring an unset env var
    if (previous === undefined) delete process.env.NEUROWIRE_PEERS
    else process.env.NEUROWIRE_PEERS = previous
  })

  it('honors NEUROWIRE_PEERS', () => {
    process.env.NEUROWIRE_PEERS = '/tmp/peers.json'
    expect(peersConfigPath()).toBe('/tmp/peers.json')
  })

  it('falls back to the config directory', () => {
    // biome-ignore lint/performance/noDelete: exercising the unset branch
    delete process.env.NEUROWIRE_PEERS
    expect(peersConfigPath()).toMatch(/neurowire[/\\]peers\.json$/)
  })
})

describe('normalizePeerUrl', () => {
  it('drops a trailing slash and any fragment', () => {
    expect(normalizePeerUrl('https://hub.example.com/')).toBe('https://hub.example.com')
    expect(normalizePeerUrl('https://hub.example.com/nw/#x')).toBe('https://hub.example.com/nw')
  })

  it('assumes https for a scheme-less value, so it fails now rather than mid-sync', () => {
    expect(normalizePeerUrl('  hub.example.com/ ')).toBe('https://hub.example.com')
    expect(normalizePeerUrl('node-c.lan:8787')).toBe('https://node-c.lan:8787')
    expect(normalizePeerUrl('http://node-c.lan:8787')).toBe('http://node-c.lan:8787')
  })

  it('leaves an unparseable value alone but still trims it', () => {
    expect(normalizePeerUrl('   ')).toBe('')
    expect(normalizePeerUrl('http://[nope/')).toBe('http://[nope')
  })
})

describe('parsePeersConfig', () => {
  it('reads the { peers: [...] } shape', () => {
    const peers = parsePeersConfig(
      JSON.stringify({
        peers: [{ url: 'https://a.example.com/', token: 't', journals: ['ai'] }],
      }),
    )
    expect(peers).toEqual([{ url: 'https://a.example.com', token: 't', journals: ['ai'] }])
  })

  it('reads a bare array, and URL strings as members', () => {
    expect(parsePeersConfig(JSON.stringify(['https://a.example.com']))).toEqual([
      { url: 'https://a.example.com' },
    ])
  })

  it('drops unreadable members rather than failing the whole file', () => {
    const peers = parsePeersConfig(
      JSON.stringify({ peers: [42, null, { token: 'no-url' }, '', 'https://ok.example.com'] }),
    )
    expect(peers).toEqual([{ url: 'https://ok.example.com' }])
  })

  it('ignores empty and non-string journal lists and blank tokens', () => {
    const peers = parsePeersConfig(
      JSON.stringify({ peers: [{ url: 'https://a.example.com', token: '', journals: [1, 2] }] }),
    )
    expect(peers).toEqual([{ url: 'https://a.example.com' }])
  })

  it('returns nothing for unparseable or unexpected JSON', () => {
    expect(parsePeersConfig('not json {')).toEqual([])
    expect(parsePeersConfig(JSON.stringify({ peers: 'nope' }))).toEqual([])
    expect(parsePeersConfig(JSON.stringify(7))).toEqual([])
  })

  it('round-trips through formatPeersConfig', () => {
    const peers: Peer[] = [{ url: 'https://a.example.com', token: 't', journals: ['ai'] }]
    expect(parsePeersConfig(formatPeersConfig(peers))).toEqual(peers)
  })
})

describe('readPeersConfig', () => {
  it('reads the same peers the lenient parser reads', () => {
    const result = readPeersConfig(JSON.stringify({ peers: ['https://a.example.com'] }))
    expect(result).toEqual({ ok: true, peers: [{ url: 'https://a.example.com' }] })
  })

  it('separates an empty list from an unreadable file', () => {
    expect(readPeersConfig(JSON.stringify({ peers: [] }))).toEqual({ ok: true, peers: [] })

    const broken = readPeersConfig('{ "peers": [,] }')
    expect(broken.ok).toBe(false)

    const wrongShape = readPeersConfig(JSON.stringify({ peers: 'nope' }))
    expect(wrongShape).toEqual({
      ok: false,
      error: 'expected { "peers": [...] } or an array of peers',
    })
  })
})

describe('addPeer and removePeer', () => {
  const existing: Peer[] = [{ url: 'https://a.example.com' }]

  it('appends a new peer', () => {
    expect(addPeer(existing, { url: 'https://b.example.com' })).toHaveLength(2)
  })

  it('replaces the entry for a URL it already holds', () => {
    const next = addPeer(existing, { url: 'https://a.example.com/', token: 't' })
    expect(next).toEqual([{ url: 'https://a.example.com', token: 't' }])
  })

  it('removes by URL, normalizing first', () => {
    expect(removePeer(existing, 'https://a.example.com/')).toEqual({ peers: [], removed: true })
  })

  it('reports when nothing matched', () => {
    expect(removePeer(existing, 'https://z.example.com')).toEqual({
      peers: existing,
      removed: false,
    })
  })
})

describe('peerFromArgs', () => {
  it('builds a bare peer from a URL', () => {
    expect(peerFromArgs('https://a.example.com/')).toEqual({ url: 'https://a.example.com' })
  })

  it('carries the token and narrows to one journal', () => {
    expect(peerFromArgs('https://a.example.com', 'secret', 'ai')).toEqual({
      url: 'https://a.example.com',
      token: 'secret',
      journals: ['ai'],
    })
  })
})

describe('formatBytes', () => {
  it('scales to B, KB, and MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})

describe('formatSyncReport', () => {
  const base: SyncReport = { peers: [], added: 0, requests: 0, bytes: 0, errors: 0 }

  it('reports one line per journal plus a summary', () => {
    const lines = formatSyncReport({
      ...base,
      added: 5,
      bytes: 2048,
      peers: [
        {
          url: 'https://a.example.com',
          requests: 1,
          bytes: 0,
          journals: [
            {
              journal: 'ai',
              added: 5,
              skipped: 1,
              head: { seq: 12 },
              requests: 2,
              bytes: 2048,
              bootstrapped: false,
              reset: false,
            },
          ],
        },
      ],
    })
    expect(lines).toEqual([
      'https://a.example.com',
      '  ai: 5 new, cursor 12, 2 requests, 2.0 KB',
      '5 new entries from 1 peer (2.0 KB, 0 errors)',
    ])
  })

  it('flags a snapshot bootstrap and a single request', () => {
    const lines = formatSyncReport({
      ...base,
      added: 1,
      peers: [
        {
          url: 'https://a.example.com',
          requests: 1,
          bytes: 0,
          journals: [
            {
              journal: 'ai',
              added: 1,
              skipped: 0,
              head: { seq: 3 },
              requests: 1,
              bytes: 0,
              bootstrapped: true,
              reset: false,
            },
          ],
        },
      ],
    })
    expect(lines[1]).toBe('  ai: 1 new, cursor 3, 1 request, 0 B, bootstrapped from snapshot')
    expect(lines[2]).toBe('1 new entry from 1 peer (0 B, 0 errors)')
  })

  it('shows peer-level and journal-level errors', () => {
    const lines = formatSyncReport({
      ...base,
      errors: 2,
      peers: [
        {
          url: 'https://down.example.com',
          journals: [],
          requests: 1,
          bytes: 0,
          error: 'peer answered 401',
        },
        {
          url: 'https://a.example.com',
          requests: 1,
          bytes: 0,
          journals: [
            {
              journal: 'ai',
              added: 0,
              skipped: 0,
              head: { seq: 0 },
              requests: 1,
              bytes: 0,
              bootstrapped: false,
              reset: false,
              error: 'chain verification failed',
            },
          ],
        },
      ],
    })
    expect(lines).toContain('  error: peer answered 401')
    expect(lines).toContain('  ai: error: chain verification failed')
    expect(lines[lines.length - 1]).toBe('0 new entries from 2 peers (0 B, 2 errors)')
  })

  it('says so when a peer publishes nothing', () => {
    const lines = formatSyncReport({
      ...base,
      peers: [{ url: 'https://a.example.com', journals: [], requests: 1, bytes: 0 }],
    })
    expect(lines[1]).toBe('  no journals published')
  })
})

describe('formatPeersList', () => {
  it('says when nothing is configured', () => {
    expect(formatPeersList([])).toEqual(['no peers configured'])
  })

  it('shows the token flag and journal scope', () => {
    expect(
      formatPeersList([
        { url: 'https://a.example.com', token: 't', journals: ['ai'] },
        { url: 'https://b.example.com' },
      ]),
    ).toEqual(['https://a.example.com  (token, ai)', 'https://b.example.com  (all journals)'])
  })
})
