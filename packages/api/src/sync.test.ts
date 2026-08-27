import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NeurowireEntry } from '@neurowire/core'
import { openJournalStore } from '@neurowire/ingest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app } from './app'
import { loadSyncConfig, parseSyncCursor, publishedJournalIds } from './sync'

let dir: string
let configDir: string
const snapshot = { ...process.env }

const ENV_KEYS = [
  'NEUROWIRE_JOURNAL',
  'NEUROWIRE_SYNC_PUBLISH',
  'NEUROWIRE_SYNC_TOKEN',
  'NEUROWIRE_SYNC_CONFIG',
]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nw-sync-'))
  configDir = mkdtempSync(join(tmpdir(), 'nw-sync-cfg-'))
  process.env.NEUROWIRE_JOURNAL = dir
  process.env.NEUROWIRE_SYNC_CONFIG = join(configDir, 'sync.json')
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = snapshot[key]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
  rmSync(dir, { recursive: true, force: true })
  rmSync(configDir, { recursive: true, force: true })
})

const entry = (n: number): NeurowireEntry => ({
  id: `https://example.com/${n}`,
  title: `Post ${n}`,
  link: `https://example.com/${n}`,
  published: new Date(Date.UTC(2026, 0, n)).toISOString(),
  tags: ['news'],
})

/** Seed a journal with `count` entries, in `perSegment`-sized segments. */
function seed(id: string, count: number, perSegment = count): void {
  // A tiny segment cap would split mid-append, so segments are grown one append
  // at a time with the cap set just below what one batch writes.
  const store = openJournalStore({ dir, maxSegmentBytes: 1 })
  for (let i = 0; i < count; i += perSegment) {
    const batch: NeurowireEntry[] = []
    for (let n = i + 1; n <= Math.min(i + perSegment, count); n++) batch.push(entry(n))
    store.append(id, batch, { id, title: 'Example', home: 'https://example.com/' })
  }
}

describe('nwf-sync config', () => {
  it('publishes nothing by default', () => {
    expect(loadSyncConfig().publish).toEqual([])
    expect(publishedJournalIds({ publish: [] }, openJournalStore({ dir }))).toEqual([])
  })

  it('reads the publish list and token from sync.json', () => {
    writeFileSync(
      join(configDir, 'sync.json'),
      JSON.stringify({ publish: ['ai', 'rust'], token: 'from-file' }),
    )
    const config = loadSyncConfig()
    expect(config.publish).toEqual(['ai', 'rust'])
    expect(config.token).toBe('from-file')
  })

  it('lets the environment win over the file', () => {
    writeFileSync(join(configDir, 'sync.json'), JSON.stringify({ publish: ['ai'], token: 'old' }))
    process.env.NEUROWIRE_SYNC_PUBLISH = 'rust,go'
    process.env.NEUROWIRE_SYNC_TOKEN = 'new'
    const config = loadSyncConfig()
    expect(config.publish).toEqual(['rust', 'go'])
    expect(config.token).toBe('new')
  })

  it('publishes nothing from a corrupt config rather than crashing', () => {
    writeFileSync(join(configDir, 'sync.json'), 'not json {')
    expect(loadSyncConfig().publish).toEqual([])
  })

  it('ignores non-string members of the publish list', () => {
    writeFileSync(join(configDir, 'sync.json'), JSON.stringify({ publish: ['ai', 7], token: 2 }))
    const config = loadSyncConfig()
    expect(config.publish).toEqual(['ai'])
    expect(config.token).toBeUndefined()
  })

  it('expands * to every journal in the store', () => {
    seed('ai', 2)
    seed('rust', 2)
    expect(publishedJournalIds({ publish: ['*'] }, openJournalStore({ dir }))).toEqual([
      'ai',
      'rust',
    ])
  })

  it('rejects path-like ids in the publish list', () => {
    expect(publishedJournalIds({ publish: ['../etc', 'ai'] }, openJournalStore({ dir }))).toEqual([
      'ai',
    ])
  })
})

describe('parseSyncCursor', () => {
  it('defaults an absent cursor to 0', () => {
    expect(parseSyncCursor(undefined)).toBe(0)
    expect(parseSyncCursor('')).toBe(0)
  })

  it('reads a sequence number, with or without a chain hash', () => {
    expect(parseSyncCursor('42')).toBe(42)
    expect(parseSyncCursor('42.9f1c0f0b8ad0f0e3')).toBe(42)
  })

  it('rejects anything that is not a non-negative integer', () => {
    expect(parseSyncCursor('-1')).toBeUndefined()
    expect(parseSyncCursor('abc')).toBeUndefined()
    expect(parseSyncCursor('.5')).toBeUndefined()
    expect(parseSyncCursor('99999999999999999999')).toBeUndefined()
  })
})

describe('GET /sync/journals', () => {
  it('lists only published journals, with the version header', async () => {
    seed('ai', 3)
    seed('secret', 3)
    process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'

    const res = await app.request('/sync/journals')
    expect(res.status).toBe(200)
    expect(res.headers.get('NWF-Sync-Version')).toBe('1')

    const body = (await res.json()) as {
      version: number
      journals: { id: string; title?: string; head: number; entries: number; updated?: string }[]
    }
    expect(body.version).toBe(1)
    expect(body.journals).toHaveLength(1)
    expect(body.journals[0]).toMatchObject({ id: 'ai', title: 'Example', head: 3, entries: 3 })
    expect(body.journals[0]?.updated).toMatch(/^2026-01-03/)
  })

  it('is empty when nothing is published', async () => {
    seed('ai', 3)
    const res = await app.request('/sync/journals')
    expect((await res.json()) as { journals: unknown[] }).toEqual({ version: 1, journals: [] })
  })

  it('describes a published journal that holds nothing yet', async () => {
    process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'
    const res = await app.request('/sync/journals')
    const body = (await res.json()) as { journals: { id: string; head: number }[] }
    expect(body.journals).toEqual([{ id: 'ai', head: 0, entries: 0, segments: 0, bytes: 0 }])
  })
})

describe('GET /sync/head', () => {
  it('returns the head cursor and chain hash', async () => {
    seed('ai', 4)
    process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'
    const res = await app.request('/sync/head?journal=ai')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { journal: string; head: number; hash?: string }
    expect(body.journal).toBe('ai')
    expect(body.head).toBe(4)
    expect(body.hash).toMatch(/^[0-9a-f]+$/)
  })

  it('400s without a journal', async () => {
    expect((await app.request('/sync/head')).status).toBe(400)
  })

  it('400s on a path-like journal id', async () => {
    expect((await app.request('/sync/head?journal=../etc')).status).toBe(400)
  })

  it('404s an unpublished journal, indistinguishably from a missing one', async () => {
    seed('ai', 2)
    const held = await app.request('/sync/head?journal=ai')
    const absent = await app.request('/sync/head?journal=nope')
    expect(held.status).toBe(404)
    expect(absent.status).toBe(404)
    // Both echo only the id the caller supplied, so neither answer says whether
    // the journal exists on disk.
    expect(await held.json()).toEqual({ error: 'unknown journal "ai"' })
    expect(await absent.json()).toEqual({ error: 'unknown journal "nope"' })
  })
})

describe('GET /sync/since', () => {
  beforeEach(() => {
    process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'
  })

  it('serves a segment as NWFJ with the range headers', async () => {
    seed('ai', 3)
    const res = await app.request('/sync/since?journal=ai&cursor=0')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/x-nwf-journal')
    expect(res.headers.get('NWF-Sync-Version')).toBe('1')
    expect(res.headers.get('NWF-Sync-Journal')).toBe('ai')
    expect(res.headers.get('NWF-Sync-Head')).toBe('3')
    expect(res.headers.get('NWF-Sync-Range')).toBe('1-3')
    expect(res.headers.get('NWF-Sync-Complete')).toBe('1')
    const text = await res.text()
    expect(text.startsWith('J\t1\tai\t')).toBe(true)
    expect(text).toContain('Post 3')
  })

  it('204s when the cursor is already at the head', async () => {
    seed('ai', 3)
    const res = await app.request('/sync/since?journal=ai&cursor=3')
    expect(res.status).toBe(204)
    expect(res.headers.get('NWF-Sync-Complete')).toBe('1')
    expect(res.headers.get('NWF-Sync-Version')).toBe('1')
  })

  it('walks one segment at a time, reporting completion on the last', async () => {
    seed('ai', 6, 2)
    const first = await app.request('/sync/since?journal=ai&cursor=0')
    expect(first.headers.get('NWF-Sync-Range')).toBe('1-2')
    expect(first.headers.get('NWF-Sync-Complete')).toBe('0')

    const last = await app.request('/sync/since?journal=ai&cursor=4')
    expect(last.headers.get('NWF-Sync-Range')).toBe('5-6')
    expect(last.headers.get('NWF-Sync-Complete')).toBe('1')
  })

  it('accepts a cursor carrying a chain hash', async () => {
    seed('ai', 3)
    const res = await app.request('/sync/since?journal=ai&cursor=3.9f1c0f0b8ad0f0e3')
    expect(res.status).toBe(204)
  })

  it('400s an unparseable cursor', async () => {
    seed('ai', 3)
    const res = await app.request('/sync/since?journal=ai&cursor=later')
    expect(res.status).toBe(400)
  })

  it('streams exactly the bytes the range was measured from', async () => {
    // A live hub appends to its newest segment while serving. The stream is
    // clipped to the length the manifest recorded, so a body can never run past
    // the range the same response declared and read to a client as tampering.
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1), entry(2)], { id: 'ai', title: 'Example' })
    const segment = store.manifest('ai').segments[0]

    const res = await app.request('/sync/since?journal=ai&cursor=0')
    expect(res.headers.get('NWF-Sync-Range')).toBe('1-2')
    expect(Buffer.byteLength(await res.text())).toBe(segment?.bytes)
  })

  it('410s a cursor older than the oldest retained segment', async () => {
    seed('ai', 6, 2)
    openJournalStore({ dir }).compact('ai', 1)

    const res = await app.request('/sync/since?journal=ai&cursor=1')
    expect(res.status).toBe(410)
    const body = (await res.json()) as { snapshot: string; oldest: number }
    expect(body.oldest).toBe(5)
    expect(body.snapshot).toBe('/sync/snapshot?journal=ai')
  })

  it('does not call a cursor of 0 too old, it just serves what is retained', async () => {
    seed('ai', 6, 2)
    openJournalStore({ dir }).compact('ai', 1)
    const res = await app.request('/sync/since?journal=ai&cursor=0')
    expect(res.status).toBe(200)
    expect(res.headers.get('NWF-Sync-Range')).toBe('5-6')
  })
})

describe('GET /sync/snapshot', () => {
  beforeEach(() => {
    process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'
  })

  it('clamps a too-old cursor instead of failing', async () => {
    seed('ai', 6, 2)
    openJournalStore({ dir }).compact('ai', 1)
    const res = await app.request('/sync/snapshot?journal=ai&cursor=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('NWF-Sync-Range')).toBe('5-6')
  })

  it('still 204s when the cursor is at the head', async () => {
    seed('ai', 3)
    expect((await app.request('/sync/snapshot?journal=ai&cursor=3')).status).toBe(204)
  })

  it('defaults its cursor to the beginning', async () => {
    seed('ai', 3)
    const res = await app.request('/sync/snapshot?journal=ai')
    expect(res.status).toBe(200)
    expect(res.headers.get('NWF-Sync-Range')).toBe('1-3')
  })
})

describe('nwf-sync auth', () => {
  beforeEach(() => {
    seed('ai', 3)
    process.env.NEUROWIRE_SYNC_PUBLISH = 'ai'
  })

  it('is open when no token is configured', async () => {
    expect((await app.request('/sync/head?journal=ai')).status).toBe(200)
  })

  it('401s without a token when one is configured', async () => {
    process.env.NEUROWIRE_SYNC_TOKEN = 'secret'
    const res = await app.request('/sync/head?journal=ai')
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(res.headers.get('NWF-Sync-Version')).toBe('1')
  })

  it('401s on a wrong token, of matching and differing length', async () => {
    process.env.NEUROWIRE_SYNC_TOKEN = 'secret'
    const same = await app.request('/sync/head?journal=ai', {
      headers: { authorization: 'Bearer secrer' },
    })
    const longer = await app.request('/sync/head?journal=ai', {
      headers: { authorization: 'Bearer secret-and-more' },
    })
    const malformed = await app.request('/sync/head?journal=ai', {
      headers: { authorization: 'secret' },
    })
    expect([same.status, longer.status, malformed.status]).toEqual([401, 401, 401])
  })

  it('accepts the right token', async () => {
    process.env.NEUROWIRE_SYNC_TOKEN = 'secret'
    const res = await app.request('/sync/head?journal=ai', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(res.status).toBe(200)
  })

  it('checks the token before the publish list, so 401 leaks no journal names', async () => {
    process.env.NEUROWIRE_SYNC_TOKEN = 'secret'
    expect((await app.request('/sync/head?journal=nope')).status).toBe(401)
    expect((await app.request('/sync/journals')).status).toBe(401)
  })
})
