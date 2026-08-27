import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JOURNAL_MEDIA_TYPE, type NeurowireEntry } from '@neurowire/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type JournalStore, openJournalStore } from './journal-store'
import {
  type Peer,
  SyncError,
  createMemoryPeerState,
  listPeerJournals,
  openPeerState,
  peerStatePath,
  pullJournal,
  syncEndpoint,
  syncPeers,
} from './sync'

let peerDir: string
let localDir: string
let stateFile: string

beforeEach(() => {
  peerDir = mkdtempSync(join(tmpdir(), 'nw-sync-peer-'))
  localDir = mkdtempSync(join(tmpdir(), 'nw-sync-local-'))
  stateFile = join(mkdtempSync(join(tmpdir(), 'nw-sync-state-')), 'peers-state.json')
})

afterEach(() => {
  for (const dir of [peerDir, localDir, join(stateFile, '..')]) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const entry = (n: number): NeurowireEntry => ({
  id: `https://example.com/${n}`,
  title: `Post ${n}`,
  link: `https://example.com/${n}`,
  published: new Date(Date.UTC(2026, 0, n)).toISOString(),
  tags: ['news'],
  authors: [{ name: 'Ada' }],
  source: { name: 'Example' },
})

/** Seed the peer's journal, one append (and so one segment) per batch. */
function seed(dir: string, id: string, count: number, perSegment = count): void {
  const store = openJournalStore({ dir, maxSegmentBytes: 1 })
  for (let i = 0; i < count; i += perSegment) {
    const batch: NeurowireEntry[] = []
    for (let n = i + 1; n <= Math.min(i + perSegment, count); n++) batch.push(entry(n))
    store.append(id, batch, { id, title: 'Example', home: 'https://example.com/' })
  }
}

interface FakePeer {
  store: JournalStore
  fetch: typeof globalThis.fetch
  /** Rewrite a served segment body, to simulate corruption in transit. */
  corrupt?: (text: string) => string
  /** Statuses answered before the real handler, one per request. */
  glitches: number[]
  requests: string[]
}

/**
 * A minimal in-test `nwf-sync/1` server over a real journal store. The real
 * server is exercised end to end from the api package, which can depend on this
 * client; here the point is to drive the client through every status path
 * offline, including ones a healthy server never produces.
 */
function fakePeer(dir: string, options: { token?: string } = {}): FakePeer {
  const store = openJournalStore({ dir })
  const peer: FakePeer = { store, glitches: [], requests: [], fetch: null as never }

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  peer.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    peer.requests.push(`${url.pathname}${url.search}`)

    const glitch = peer.glitches.shift()
    if (glitch !== undefined) return json({ error: 'busy' }, glitch)

    const header = (init?.headers as Record<string, string> | undefined)?.authorization
    if (options.token && header !== `Bearer ${options.token}`) {
      return json({ error: 'missing or invalid bearer token' }, 401)
    }

    const id = url.searchParams.get('journal') ?? ''
    const route = url.pathname.slice('/sync/'.length)
    if (route === 'journals') {
      return json({ version: 1, journals: store.list().map((journal) => ({ id: journal })) })
    }

    const manifest = store.manifest(id)
    const head = store.head(id)
    if (route === 'head') return json({ journal: id, head: head.seq })

    const cursor = Number(url.searchParams.get('cursor') ?? '0')
    if (cursor >= head.seq) return new Response(null, { status: 204 })

    const oldest = manifest.segments[0]
    if (route === 'since' && cursor > 0 && oldest && cursor < oldest.firstSeq - 1) {
      return json({ error: 'cursor too old', snapshot: `/sync/snapshot?journal=${id}` }, 410)
    }

    const segment = manifest.segments.find((candidate) => candidate.lastSeq > cursor)
    if (!segment) return new Response(null, { status: 204 })
    const raw = readFileSync(join(dir, segment.file), 'utf8')
    return new Response(peer.corrupt ? peer.corrupt(raw) : raw, {
      status: 200,
      headers: {
        'content-type': JOURNAL_MEDIA_TYPE,
        'NWF-Sync-Version': '1',
        'NWF-Sync-Journal': id,
        'NWF-Sync-Head': String(head.seq),
        'NWF-Sync-Range': `${segment.firstSeq}-${segment.lastSeq}`,
        'NWF-Sync-Complete': segment.lastSeq >= head.seq ? '1' : '0',
      },
    })
  }) as typeof globalThis.fetch

  return peer
}

const PEER: Peer = { url: 'https://hub.example.com' }

describe('syncEndpoint', () => {
  it('builds a /sync url with query parameters', () => {
    expect(syncEndpoint('https://hub.example.com', 'head', { journal: 'ai' })).toBe(
      'https://hub.example.com/sync/head?journal=ai',
    )
  })

  it('keeps a base path and tolerates a trailing slash', () => {
    expect(
      syncEndpoint('https://hub.example.com/nw/', 'since', { journal: 'ai', cursor: '4' }),
    ).toBe('https://hub.example.com/nw/sync/since?journal=ai&cursor=4')
    expect(syncEndpoint('https://hub.example.com/nw', 'journals')).toBe(
      'https://hub.example.com/nw/sync/journals',
    )
  })
})

describe('peerStatePath', () => {
  const previous = process.env.NEUROWIRE_PEERS_STATE

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: restoring an unset env var
    if (previous === undefined) delete process.env.NEUROWIRE_PEERS_STATE
    else process.env.NEUROWIRE_PEERS_STATE = previous
  })

  it('honors NEUROWIRE_PEERS_STATE', () => {
    process.env.NEUROWIRE_PEERS_STATE = '/tmp/state.json'
    expect(peerStatePath()).toBe('/tmp/state.json')
  })

  it('falls back to the config directory', () => {
    // biome-ignore lint/performance/noDelete: exercising the unset branch
    delete process.env.NEUROWIRE_PEERS_STATE
    expect(peerStatePath()).toMatch(/neurowire[/\\]peers-state\.json$/)
  })
})

describe('peer state stores', () => {
  it('round-trips a cursor through a file', () => {
    const state = openPeerState(stateFile)
    expect(state.get(PEER.url, 'ai')).toBeUndefined()
    state.set(PEER.url, 'ai', { seq: 12, hash: 'abc' })

    const reopened = openPeerState(stateFile)
    expect(reopened.get(PEER.url, 'ai')).toEqual({ seq: 12, hash: 'abc' })
    expect(Object.keys(reopened.entries())).toEqual([`${PEER.url}\tai`])
  })

  it('keys by peer and journal, so two peers do not share a cursor', () => {
    const state = openPeerState(stateFile)
    state.set('https://a', 'ai', { seq: 5 })
    state.set('https://b', 'ai', { seq: 9 })
    expect(state.get('https://a', 'ai')).toEqual({ seq: 5 })
    expect(state.get('https://b', 'ai')).toEqual({ seq: 9 })
  })

  it('starts from the beginning when the file is corrupt', () => {
    writeFileSync(stateFile, 'not json {')
    expect(openPeerState(stateFile).get(PEER.url, 'ai')).toBeUndefined()
  })

  it('drops entries whose cursor is not a sequence number', () => {
    writeFileSync(stateFile, JSON.stringify({ peers: { 'https://a\tai': { seq: 'x' } } }))
    expect(openPeerState(stateFile).entries()).toEqual({})
  })

  it('offers an in-memory store for one-shot pulls', () => {
    const state = createMemoryPeerState({ 'https://a\tai': { seq: 3 } })
    expect(state.get('https://a', 'ai')).toEqual({ seq: 3 })
    state.set('https://a', 'ai', { seq: 4 })
    expect(state.entries()).toEqual({ 'https://a\tai': { seq: 4 } })
  })
})

describe('pullJournal', () => {
  it('pulls a whole journal into an empty store', async () => {
    seed(peerDir, 'ai', 5)
    const peer = fakePeer(peerDir)
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState()

    const result = await pullJournal(PEER, 'ai', local, { fetch: peer.fetch, state })

    expect(result.added).toBe(5)
    expect(result.head.seq).toBe(5)
    expect(result.remoteHead).toBe(5)
    expect(result.bootstrapped).toBe(false)
    expect(local.read('ai').map((record) => record.entry.title)).toEqual([
      'Post 1',
      'Post 2',
      'Post 3',
      'Post 4',
      'Post 5',
    ])
    expect(state.get(PEER.url, 'ai')?.seq).toBe(5)
  })

  it('preserves entry provenance across the hop', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    const local = openJournalStore({ dir: localDir })
    await pullJournal(PEER, 'ai', local, { fetch: peer.fetch, state: createMemoryPeerState() })

    const [first] = local.read('ai')
    expect(first?.entry.source?.name).toBe('Example')
    expect(first?.entry.authors?.[0]?.name).toBe('Ada')
    expect(first?.feed?.title).toBe('Example')
  })

  it('short-circuits on the head poll when the cursor already matches', async () => {
    seed(peerDir, 'ai', 3)
    const peer = fakePeer(peerDir)
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 3 } })

    const result = await pullJournal(PEER, 'ai', local, { fetch: peer.fetch, state })

    expect(result.added).toBe(0)
    expect(result.requests).toBe(1)
    expect(peer.requests).toEqual(['/sync/head?journal=ai'])
  })

  it('transfers only the delta on a second pull', async () => {
    seed(peerDir, 'ai', 3)
    const peer = fakePeer(peerDir)
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState()

    const first = await pullJournal(PEER, 'ai', local, { fetch: peer.fetch, state })
    seed(peerDir, 'ai', 5, 5) // appends 4 and 5 into a new segment
    const second = await pullJournal(PEER, 'ai', local, { fetch: peer.fetch, state })

    expect(first.added).toBe(3)
    expect(second.added).toBe(2)
    expect(second.bytes).toBeLessThan(first.bytes)
    expect(local.head('ai').seq).toBe(5)
  })

  it('walks multiple segments until the peer reports completion', async () => {
    seed(peerDir, 'ai', 6, 2)
    const peer = fakePeer(peerDir)
    const local = openJournalStore({ dir: localDir })

    const result = await pullJournal(PEER, 'ai', local, {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })

    expect(result.added).toBe(6)
    expect(result.requests).toBe(4) // one head poll plus three segments
    expect(local.read('ai')).toHaveLength(6)
  })

  it('is idempotent: pulling the same delta twice stores one copy', async () => {
    seed(peerDir, 'ai', 4)
    const peer = fakePeer(peerDir)
    const local = openJournalStore({ dir: localDir })

    const first = await pullJournal(PEER, 'ai', local, {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })
    // A fresh state means the second pull re-requests everything from seq 0.
    const second = await pullJournal(PEER, 'ai', local, {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })

    expect(first.added).toBe(4)
    expect(second.added).toBe(0)
    expect(second.skipped).toBe(4)
    expect(local.read('ai')).toHaveLength(4)
  })

  it('stores one copy of an entry reaching it through two peers', async () => {
    seed(peerDir, 'ai', 3)
    const relayDir = mkdtempSync(join(tmpdir(), 'nw-sync-relay-'))
    try {
      // The relay holds the same entries under its own numbering, as a second hop would.
      seed(relayDir, 'ai', 3)
      const local = openJournalStore({ dir: localDir })
      const state = createMemoryPeerState()
      await pullJournal(PEER, 'ai', local, { fetch: fakePeer(peerDir).fetch, state })
      await pullJournal({ url: 'https://relay.example.com' }, 'ai', local, {
        fetch: fakePeer(relayDir).fetch,
        state,
      })
      expect(local.read('ai')).toHaveLength(3)
    } finally {
      rmSync(relayDir, { recursive: true, force: true })
    }
  })

  it('sends the bearer token when the peer requires one', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir, { token: 'secret' })
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState()

    await expect(pullJournal(PEER, 'ai', local, { fetch: peer.fetch, state })).rejects.toThrow(
      /answered 401/,
    )

    const result = await pullJournal({ ...PEER, token: 'secret' }, 'ai', local, {
      fetch: peer.fetch,
      state,
    })
    expect(result.added).toBe(2)
  })

  it('surfaces the peer error detail on a failed head poll', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir, { token: 'secret' })
    const local = openJournalStore({ dir: localDir })
    const error: unknown = await pullJournal(PEER, 'ai', local, {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(SyncError)
    if (!(error instanceof SyncError)) throw new Error('expected a SyncError')
    expect(error.message).toContain('missing or invalid bearer token')
    expect(error.peer).toBe(PEER.url)
    expect(error.journal).toBe('ai')
  })
})

describe('pullJournal integrity', () => {
  const local = () => openJournalStore({ dir: localDir })

  it('aborts on a flipped byte and appends nothing', async () => {
    seed(peerDir, 'ai', 4)
    const peer = fakePeer(peerDir)
    peer.corrupt = (text) => text.replace('Post 2', 'Post X')
    const store = local()

    await expect(
      pullJournal(PEER, 'ai', store, { fetch: peer.fetch, state: createMemoryPeerState() }),
    ).rejects.toThrow(/chain verification failed/)
    expect(store.list()).toEqual([])
  })

  it('rejects a body whose header names another journal', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    peer.corrupt = (text) => text.replace('J\t1\tai\t', 'J\t1\televerything\t')
    await expect(
      pullJournal(PEER, 'ai', local(), { fetch: peer.fetch, state: createMemoryPeerState() }),
    ).rejects.toThrow(/when asked for "ai"/)
  })

  it('rejects entries that arrive with no checkpoint to verify', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    peer.corrupt = (text) =>
      text
        .split('\n')
        .filter((line) => !line.startsWith('C\t'))
        .join('\n')
    await expect(
      pullJournal(PEER, 'ai', local(), { fetch: peer.fetch, state: createMemoryPeerState() }),
    ).rejects.toThrow(/no checkpoint to verify/)
  })

  it('rejects a body that stops short of the declared range', async () => {
    seed(peerDir, 'ai', 4)
    const peer = fakePeer(peerDir)
    // Cut after the checkpoint that follows entry 2: the chain still verifies,
    // only the declared range reveals the truncation.
    peer.corrupt = (text) => {
      const lines = text.split('\n')
      const cut = lines.findIndex((line) => line.startsWith('E\t3\t'))
      return `${lines.slice(0, cut).join('\n')}\nC\t2\t${'0'.repeat(16)}\n`
    }
    await expect(
      pullJournal(PEER, 'ai', local(), { fetch: peer.fetch, state: createMemoryPeerState() }),
    ).rejects.toThrow(/chain verification failed|declared 4/)
  })

  it('accepts a body that runs past the declared range, which is a live append', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    const inner = peer.fetch
    peer.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await inner(String(input), init)
      if (!res.headers.has('NWF-Sync-Range')) return res
      // The hub appended entry 2 between describing the segment and streaming it.
      const headers = new Headers(res.headers)
      headers.set('NWF-Sync-Range', '1-1')
      return new Response(await res.text(), { status: res.status, headers })
    }) as typeof globalThis.fetch

    const store = local()
    const result = await pullJournal(PEER, 'ai', store, {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })
    expect(result.added).toBe(2)
  })

  it('refuses a peer that never advances past the cursor', async () => {
    seed(peerDir, 'ai', 4)
    const peer = fakePeer(peerDir)
    const store = local()
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 3 } })
    // Serving segment 1-4 for a cursor of 3 is fine; serving it again for 4 is not.
    peer.corrupt = (text) => text
    await pullJournal(PEER, 'ai', store, { fetch: peer.fetch, state })

    const stuck = fakePeer(peerDir)
    const stuckFetch = stuck.fetch
    stuck.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/head')) {
        return new Response(JSON.stringify({ journal: 'ai', head: 99 }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      url.searchParams.set('cursor', '0')
      return stuckFetch(url.toString(), init)
    }) as typeof globalThis.fetch

    await expect(
      pullJournal(PEER, 'ai', store, {
        fetch: stuck.fetch,
        state: createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 4 } }),
      }),
    ).rejects.toThrow(/did not advance past cursor 4/)
  })

  it('rejects an unreadable head body', async () => {
    const peer = fakePeer(peerDir)
    peer.fetch = (async () => new Response('nope', { status: 200 })) as typeof globalThis.fetch
    await expect(
      pullJournal(PEER, 'ai', local(), { fetch: peer.fetch, state: createMemoryPeerState() }),
    ).rejects.toThrow(/unreadable \/sync\/head body/)
  })
})

describe('pullJournal recovery', () => {
  it('bootstraps from a snapshot after a 410 and converges', async () => {
    seed(peerDir, 'ai', 6, 2)
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState()

    // A client that saw only the first two entries, then the peer compacted.
    await pullJournal(PEER, 'ai', local, { fetch: fakePeer(peerDir).fetch, state })
    rmSync(localDir, { recursive: true, force: true })
    state.set(PEER.url, 'ai', { seq: 1 })
    openJournalStore({ dir: localDir })
    openJournalStore({ dir: peerDir }).compact('ai', 1)

    const peer = fakePeer(peerDir)
    const fresh = openJournalStore({ dir: localDir })
    const result = await pullJournal(PEER, 'ai', fresh, { fetch: peer.fetch, state })

    expect(result.bootstrapped).toBe(true)
    expect(result.added).toBe(2)
    expect(fresh.read('ai').map((record) => record.entry.title)).toEqual(['Post 5', 'Post 6'])
    expect(peer.requests.some((path) => path.startsWith('/sync/snapshot'))).toBe(true)
  })

  it('writes the cursor only after the append lands, so a crash costs one re-pull', async () => {
    seed(peerDir, 'ai', 4, 2)
    const peer = fakePeer(peerDir)
    const state = createMemoryPeerState()
    const store = openJournalStore({ dir: localDir })
    const failing: JournalStore = {
      ...store,
      append(id, entries, feed) {
        // Fail on the second segment, after the first has been recorded.
        if (entries.some((candidate) => candidate.title === 'Post 3')) throw new Error('disk full')
        return store.append(id, entries, feed)
      },
    }

    await expect(pullJournal(PEER, 'ai', failing, { fetch: peer.fetch, state })).rejects.toThrow(
      'disk full',
    )
    expect(state.get(PEER.url, 'ai')).toEqual({ seq: 2, hash: expect.any(String) })

    // Re-pulling from the recorded cursor finishes the job with no duplicates.
    const result = await pullJournal(PEER, 'ai', store, { fetch: peer.fetch, state })
    expect(result.added).toBe(2)
    expect(store.read('ai')).toHaveLength(4)
  })

  it('gives up rather than looping forever past maxSegments', async () => {
    seed(peerDir, 'ai', 6, 2)
    const peer = fakePeer(peerDir)
    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
        fetch: peer.fetch,
        state: createMemoryPeerState(),
        maxSegments: 1,
      }),
    ).rejects.toThrow(/more than 1 segments/)
  })
})

describe('pullJournal divergence', () => {
  /** A peer whose /sync/head answers whatever the test dictates. */
  function withHead(dir: string, head: number, hash?: string): FakePeer {
    const peer = fakePeer(dir)
    const inner = peer.fetch
    peer.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/head')) {
        return new Response(JSON.stringify({ journal: 'ai', head, hash }), {
          headers: { 'content-type': 'application/json', 'NWF-Sync-Version': '1' },
        })
      }
      return inner(url.toString(), init)
    }) as typeof globalThis.fetch
    return peer
  }

  it('restarts when the peer head moved backwards', async () => {
    seed(peerDir, 'ai', 4)
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 900 } })

    const result = await pullJournal(PEER, 'ai', local, {
      fetch: withHead(peerDir, 4).fetch,
      state,
    })

    expect(result.reset).toBe(true)
    expect(result.added).toBe(4)
    expect(state.get(PEER.url, 'ai')?.seq).toBe(4)
  })

  it('restarts when the chain disagrees at the recorded sequence number', async () => {
    seed(peerDir, 'ai', 4)
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 4, hash: 'stale' } })

    const result = await pullJournal(PEER, 'ai', local, {
      fetch: withHead(peerDir, 4, 'fresh').fetch,
      state,
    })

    expect(result.reset).toBe(true)
    expect(result.added).toBe(4)
  })

  it('lands a reset cursor even when the rebuilt journal is empty', async () => {
    const local = openJournalStore({ dir: localDir })
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 900 } })

    const result = await pullJournal(PEER, 'ai', local, {
      fetch: withHead(peerDir, 0).fetch,
      state,
    })

    expect(result.reset).toBe(true)
    // Without this the stale cursor survives and every later sync stalls too.
    expect(state.get(PEER.url, 'ai')).toEqual({ seq: 0 })
  })

  it('does not restart when the cursor and the peer simply agree', async () => {
    seed(peerDir, 'ai', 4)
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 4, hash: 'same' } })
    const result = await pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
      fetch: withHead(peerDir, 4, 'same').fetch,
      state,
    })
    expect(result.reset).toBe(false)
    expect(result.added).toBe(0)
  })
})

describe('pullJournal version negotiation', () => {
  function withVersion(dir: string, version: string | null): FakePeer {
    const peer = fakePeer(dir)
    const inner = peer.fetch
    peer.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await inner(String(input), init)
      const headers = new Headers(res.headers)
      if (version === null) headers.delete('NWF-Sync-Version')
      else headers.set('NWF-Sync-Version', version)
      return new Response(res.status === 204 ? null : await res.text(), {
        status: res.status,
        headers,
      })
    }) as typeof globalThis.fetch
    return peer
  }

  it('refuses a peer speaking a version it does not implement', async () => {
    seed(peerDir, 'ai', 2)
    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
        fetch: withVersion(peerDir, '2').fetch,
        state: createMemoryPeerState(),
      }),
    ).rejects.toThrow(/peer speaks nwf-sync\/2/)
  })

  it('tolerates an absent version header, since a proxy may have stripped it', async () => {
    seed(peerDir, 'ai', 2)
    const result = await pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
      fetch: withVersion(peerDir, null).fetch,
      state: createMemoryPeerState(),
    })
    expect(result.added).toBe(2)
  })
})

describe('transport', () => {
  const noWait = async (): Promise<void> => {}

  it('retries a 5xx and then succeeds', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    peer.glitches = [503, 500]
    const result = await pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
      delay: noWait,
    })
    expect(result.added).toBe(2)
    expect(peer.requests.filter((path) => path.startsWith('/sync/head'))).toHaveLength(3)
  })

  it('hands back the peer status once the retries are spent', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    peer.glitches = [500, 500, 500, 500]
    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
        fetch: peer.fetch,
        state: createMemoryPeerState(),
        delay: noWait,
        retries: 1,
      }),
    ).rejects.toThrow(/answered 500/)
  })

  it('retries a network failure', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    const real = peer.fetch
    let calls = 0
    peer.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls += 1
      if (calls === 1) throw new TypeError('fetch failed')
      return real(input as string, init)
    }) as typeof globalThis.fetch

    const result = await pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
      delay: noWait,
    })
    expect(result.added).toBe(2)
  })

  it('does not retry a non-retryable throw', async () => {
    const peer = fakePeer(peerDir)
    let calls = 0
    peer.fetch = (async () => {
      calls += 1
      throw new RangeError('nope')
    }) as typeof globalThis.fetch

    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
        fetch: peer.fetch,
        state: createMemoryPeerState(),
        delay: noWait,
      }),
    ).rejects.toThrow('nope')
    expect(calls).toBe(1)
  })

  it('stops immediately when the caller aborts', async () => {
    seed(peerDir, 'ai', 2)
    const controller = new AbortController()
    controller.abort()
    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
        fetch: fakePeer(peerDir).fetch,
        state: createMemoryPeerState(),
        signal: controller.signal,
      }),
    ).rejects.toThrow(/aborted by the caller/)
  })

  it('times out a peer that never answers', async () => {
    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: localDir }), {
        fetch: ((_input: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
          })) as typeof globalThis.fetch,
        state: createMemoryPeerState(),
        timeoutMs: 5,
        retries: 0,
      }),
    ).rejects.toThrow(/timed out/)
  })
})

describe('listPeerJournals', () => {
  it('lists what the peer publishes', async () => {
    seed(peerDir, 'ai', 2)
    seed(peerDir, 'rust', 2)
    expect(await listPeerJournals(PEER, { fetch: fakePeer(peerDir).fetch })).toEqual(['ai', 'rust'])
  })

  it('throws on a non-200', async () => {
    const peer = fakePeer(peerDir, { token: 'secret' })
    await expect(listPeerJournals(PEER, { fetch: peer.fetch })).rejects.toThrow(/answered 401/)
  })

  it('throws on an unreadable body', async () => {
    const fetchImpl = (async () =>
      new Response('<html>', { status: 200 })) as typeof globalThis.fetch
    await expect(listPeerJournals(PEER, { fetch: fetchImpl })).rejects.toThrow(/unreadable/)
  })
})

describe('syncPeers', () => {
  it('pulls every published journal and reports totals', async () => {
    seed(peerDir, 'ai', 3)
    seed(peerDir, 'rust', 2)
    const peer = fakePeer(peerDir)
    const report = await syncPeers([PEER], openJournalStore({ dir: localDir }), {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })

    expect(report.added).toBe(5)
    expect(report.errors).toBe(0)
    expect(report.peers[0]?.journals.map((journal) => journal.journal)).toEqual(['ai', 'rust'])
  })

  it('honors an explicit journal list instead of asking', async () => {
    seed(peerDir, 'ai', 3)
    seed(peerDir, 'rust', 2)
    const peer = fakePeer(peerDir)
    const report = await syncPeers(
      [{ ...PEER, journals: ['ai'] }],
      openJournalStore({ dir: localDir }),
      { fetch: peer.fetch, state: createMemoryPeerState() },
    )

    expect(report.added).toBe(3)
    expect(peer.requests.some((path) => path.startsWith('/sync/journals'))).toBe(false)
  })

  it('records a peer that cannot be listed without losing the others', async () => {
    seed(peerDir, 'ai', 3)
    const good = fakePeer(peerDir)
    const bad = fakePeer(peerDir, { token: 'secret' })
    const routed = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      return url.startsWith('https://down') ? bad.fetch(url, init) : good.fetch(url, init)
    }) as typeof globalThis.fetch

    const report = await syncPeers(
      [{ url: 'https://down.example.com' }, PEER],
      openJournalStore({ dir: localDir }),
      { fetch: routed, state: createMemoryPeerState() },
    )

    expect(report.errors).toBe(1)
    expect(report.peers[0]?.error).toMatch(/answered 401/)
    expect(report.peers[1]?.journals[0]).toMatchObject({ journal: 'ai', added: 3 })
    expect(report.added).toBe(3)
  })

  it('records a journal that fails without aborting the peer', async () => {
    seed(peerDir, 'ai', 2)
    seed(peerDir, 'rust', 2)
    const peer = fakePeer(peerDir)
    peer.corrupt = (text) => (text.includes('rust') ? text.replace('Post 1', 'Post X') : text)

    const report = await syncPeers([PEER], openJournalStore({ dir: localDir }), {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })

    expect(report.errors).toBe(1)
    expect(report.peers[0]?.journals[0]).toMatchObject({ journal: 'ai', added: 2 })
    expect(report.peers[0]?.journals[1]?.error).toMatch(/chain verification failed/)
  })

  it('counts the listing and every retry, including on a journal that failed', async () => {
    seed(peerDir, 'ai', 2)
    const peer = fakePeer(peerDir)
    peer.corrupt = (text) => text.replace('Post 1', 'Post X')

    const report = await syncPeers([PEER], openJournalStore({ dir: localDir }), {
      fetch: peer.fetch,
      state: createMemoryPeerState(),
    })

    // One /sync/journals, one /sync/head, one /sync/since that failed to merge.
    expect(report.peers[0]?.requests).toBe(1)
    expect(report.requests).toBe(3)
    expect(report.bytes).toBeGreaterThan(0)
    expect(report.peers[0]?.journals[0]?.requests).toBe(2)
    expect(report.peers[0]?.journals[0]?.bytes).toBeGreaterThan(0)
  })

  it('reports a peer that publishes nothing', async () => {
    const report = await syncPeers([PEER], openJournalStore({ dir: localDir }), {
      fetch: fakePeer(peerDir).fetch,
      state: createMemoryPeerState(),
    })
    expect(report.peers[0]?.journals).toEqual([])
    expect(report.added).toBe(0)
  })
})
