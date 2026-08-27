import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NeurowireEntry } from '@neurowire/core'
import { createMemoryPeerState, openJournalStore, pullJournal } from '@neurowire/ingest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app } from './app'

/**
 * The real server against the real client: node A journals entries and publishes
 * them, node B pulls them into its own store. Both halves are in process, wired
 * through `app.fetch`, so the whole handshake runs with no socket and no network.
 */

let nodeA: string
let nodeB: string
const snapshot = { ...process.env }
const ENV_KEYS = ['NEUROWIRE_JOURNAL', 'NEUROWIRE_SYNC_PUBLISH', 'NEUROWIRE_SYNC_TOKEN']

beforeEach(() => {
  nodeA = mkdtempSync(join(tmpdir(), 'nw-e2e-a-'))
  nodeB = mkdtempSync(join(tmpdir(), 'nw-e2e-b-'))
  process.env.NEUROWIRE_JOURNAL = nodeA
  process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = snapshot[key]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
  rmSync(nodeA, { recursive: true, force: true })
  rmSync(nodeB, { recursive: true, force: true })
})

const entry = (n: number): NeurowireEntry => ({
  id: `https://example.com/${n}`,
  title: `Post ${n}`,
  link: `https://example.com/${n}`,
  published: new Date(Date.UTC(2026, 0, n)).toISOString(),
  tags: ['news'],
  source: { name: 'Example' },
})

/** Append `count` entries to node A, in `perSegment`-sized appends. */
function journalOnA(count: number, perSegment = count, from = 1): void {
  const store = openJournalStore({ dir: nodeA, maxSegmentBytes: 1 })
  for (let i = 0; i < count; i += perSegment) {
    const batch: NeurowireEntry[] = []
    for (let n = from + i; n < from + Math.min(i + perSegment, count); n++) batch.push(entry(n))
    store.append('ai', batch, { id: 'ai', title: 'AI News', home: 'https://example.com/' })
  }
}

/** Route the client's fetch into the in-process Hono app. */
const viaApp: typeof globalThis.fetch = async (input, init) =>
  app.fetch(new Request(String(input), init as RequestInit))

const PEER = { url: 'https://node-a.test' }

describe('nwf-sync end to end', () => {
  it('pulls a journal from A into B and matches its content', async () => {
    journalOnA(10)
    const b = openJournalStore({ dir: nodeB })
    const state = createMemoryPeerState()

    const result = await pullJournal(PEER, 'ai', b, { fetch: viaApp, state })

    expect(result.added).toBe(10)
    expect(result.remoteHead).toBe(10)
    const a = openJournalStore({ dir: nodeA })
    expect(b.read('ai').map((record) => record.entry.title)).toEqual(
      a.read('ai').map((record) => record.entry.title),
    )
    expect(b.read('ai')[0]?.entry.source?.name).toBe('Example')
    expect(b.verify('ai').valid).toBe(true)
  })

  it('moves only the delta on the second sync, and nothing on the third', async () => {
    journalOnA(6, 6)
    const b = openJournalStore({ dir: nodeB })
    const state = createMemoryPeerState()

    const first = await pullJournal(PEER, 'ai', b, { fetch: viaApp, state })
    journalOnA(2, 2, 7)
    const second = await pullJournal(PEER, 'ai', b, { fetch: viaApp, state })
    const third = await pullJournal(PEER, 'ai', b, { fetch: viaApp, state })

    expect([first.added, second.added, third.added]).toEqual([6, 2, 0])
    expect(second.bytes).toBeLessThan(first.bytes)
    // The steady state is one request that returns a number, and no body.
    expect(third.requests).toBe(1)
    expect(b.read('ai')).toHaveLength(8)
  })

  it('walks segment by segment when B is far behind', async () => {
    journalOnA(9, 3)
    const b = openJournalStore({ dir: nodeB })
    const result = await pullJournal(PEER, 'ai', b, {
      fetch: viaApp,
      state: createMemoryPeerState(),
    })

    expect(result.requests).toBe(4) // the head poll plus three segments
    expect(b.read('ai')).toHaveLength(9)
  })

  it('recovers through the snapshot path after A compacts, converging on A', async () => {
    journalOnA(9, 3)
    const b = openJournalStore({ dir: nodeB })
    const state = createMemoryPeerState({ [`${PEER.url}\tai`]: { seq: 1 } })

    openJournalStore({ dir: nodeA }).compact('ai', 1)
    const result = await pullJournal(PEER, 'ai', b, { fetch: viaApp, state })

    expect(result.bootstrapped).toBe(true)
    const a = openJournalStore({ dir: nodeA })
    expect(b.read('ai').map((record) => record.entry.title)).toEqual(
      a.read('ai').map((record) => record.entry.title),
    )
    expect(state.get(PEER.url, 'ai')?.seq).toBe(9)
  })

  it('converges with no duplicates after a connection dies mid-pull', async () => {
    journalOnA(9, 3)
    const b = openJournalStore({ dir: nodeB })
    const state = createMemoryPeerState()

    let calls = 0
    const flaky: typeof globalThis.fetch = (input, init) => {
      calls += 1
      // Die during the second segment transfer, after the first has landed.
      if (calls === 3) return Promise.reject(new RangeError('connection reset'))
      return viaApp(input, init)
    }

    await expect(pullJournal(PEER, 'ai', b, { fetch: flaky, state })).rejects.toThrow(
      'connection reset',
    )
    expect(state.get(PEER.url, 'ai')?.seq).toBe(3)

    const resumed = await pullJournal(PEER, 'ai', b, { fetch: viaApp, state })
    expect(resumed.added).toBe(6)
    expect(b.read('ai')).toHaveLength(9)
    expect(b.verify('ai').valid).toBe(true)
  })

  it('needs the token when A configures one', async () => {
    journalOnA(3)
    process.env.NEUROWIRE_SYNC_TOKEN = 'secret'
    const b = openJournalStore({ dir: nodeB })

    await expect(
      pullJournal(PEER, 'ai', b, { fetch: viaApp, state: createMemoryPeerState() }),
    ).rejects.toThrow(/answered 401/)

    const result = await pullJournal({ ...PEER, token: 'secret' }, 'ai', b, {
      fetch: viaApp,
      state: createMemoryPeerState(),
    })
    expect(result.added).toBe(3)
  })

  it('refuses a journal A did not publish', async () => {
    journalOnA(3)
    process.env.NEUROWIRE_SYNC_PUBLISH = 'something-else'
    await expect(
      pullJournal(PEER, 'ai', openJournalStore({ dir: nodeB }), {
        fetch: viaApp,
        state: createMemoryPeerState(),
      }),
    ).rejects.toThrow(/answered 404/)
  })
})
