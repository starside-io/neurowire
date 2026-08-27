import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JournalFeedMeta, NeurowireEntry } from '@neurowire/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { journalConfigDir, openJournalStore } from './journal-store'

const meta: JournalFeedMeta = {
  id: 'https://blog.example.com/feed',
  title: 'Example Blog',
  home: 'https://blog.example.com/',
}

/** A dated entry, `day` days into 2026-01. */
function entry(n: number, options: { day?: number; tags?: string[]; source?: string } = {}) {
  const item: NeurowireEntry = {
    id: `post-${n}`,
    title: `Post ${n}`,
    link: `https://blog.example.com/posts/${n}`,
    published: new Date(Date.UTC(2026, 0, options.day ?? n)).toISOString(),
  }
  if (options.tags) item.tags = options.tags
  if (options.source) item.source = { name: options.source }
  return item
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nwfj-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('journalConfigDir', () => {
  const saved = { ...process.env }
  /** Assigning undefined to process.env stores the string "undefined", so delete instead. */
  const set = (name: string, value: string | undefined): void => {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  afterEach(() => {
    set('NEUROWIRE_JOURNAL', saved.NEUROWIRE_JOURNAL)
    set('XDG_CONFIG_HOME', saved.XDG_CONFIG_HOME)
  })

  it('prefers NEUROWIRE_JOURNAL', () => {
    process.env.NEUROWIRE_JOURNAL = '/tmp/journals'
    expect(journalConfigDir()).toBe('/tmp/journals')
  })

  it('falls back to the XDG config directory', () => {
    process.env.NEUROWIRE_JOURNAL = ''
    process.env.XDG_CONFIG_HOME = '/tmp/xdg'
    expect(journalConfigDir()).toBe('/tmp/xdg/neurowire/journal')
  })

  it('falls back to ~/.config when XDG is unset', () => {
    process.env.NEUROWIRE_JOURNAL = ''
    set('XDG_CONFIG_HOME', undefined)
    expect(journalConfigDir()).toMatch(/\.config\/neurowire\/journal$/)
  })

  it('is the default directory for a store opened with no options', () => {
    process.env.NEUROWIRE_JOURNAL = '/tmp/journals'
    expect(openJournalStore().dir).toBe('/tmp/journals')
  })
})

describe('append', () => {
  it('creates the directory and writes a first segment', () => {
    const store = openJournalStore({ dir: join(dir, 'nested') })
    const result = store.append('ai', [entry(1), entry(2)], meta)

    expect(result).toMatchObject({ added: 2, skipped: 0, rotated: true, segment: 'ai.00001.nwfj' })
    expect(result.head.seq).toBe(2)
    expect(store.read('ai')).toHaveLength(2)
  })

  it('appends to the same segment on the next call', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)], meta)
    const second = store.append('ai', [entry(2)], meta)

    expect(second).toMatchObject({ added: 1, rotated: false, segment: 'ai.00001.nwfj' })
    expect(store.read('ai').map((r) => r.seq)).toEqual([1, 2])
    expect(store.verify('ai').valid).toBe(true)
  })

  it('drops entries the journal already holds', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1), entry(2)], meta)
    const again = store.append('ai', [entry(1), entry(2), entry(3)], meta)

    expect(again).toMatchObject({ added: 1, skipped: 2 })
    expect(store.read('ai')).toHaveLength(3)
  })

  it('drops duplicates inside a single batch', () => {
    const store = openJournalStore({ dir })
    expect(store.append('ai', [entry(1), entry(1)], meta)).toMatchObject({ added: 1, skipped: 1 })
  })

  it('reports nothing written when every entry is already known', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)], meta)
    const result = store.append('ai', [entry(1)], meta)
    expect(result).toMatchObject({ added: 0, skipped: 1, segment: 'ai.00001.nwfj' })
  })

  it('reports nothing written for an empty first append', () => {
    const store = openJournalStore({ dir })
    expect(store.append('ai', [])).toMatchObject({ added: 0, segment: '', rotated: false })
    expect(store.list()).toEqual([])
  })

  it('works without a feed identity', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)])
    expect(store.read('ai')[0]?.entry.link).toBe('https://blog.example.com/posts/1')
  })

  it('rejects an id that could escape the directory', () => {
    const store = openJournalStore({ dir })
    expect(() => store.append('../escape', [entry(1)])).toThrow(/invalid journal id/)
    expect(() => store.head('a/b')).toThrow(/invalid journal id/)
  })
})

describe('rotation', () => {
  /** Fill a journal past a tiny size cap so it spans several segments. */
  function spread(): ReturnType<typeof openJournalStore> {
    const store = openJournalStore({ dir, maxSegmentBytes: 400 })
    for (let n = 1; n <= 8; n++) store.append('ai', [entry(n)], meta)
    return store
  }

  it('rotates once the active segment passes the size cap', () => {
    const store = spread()
    const segments = store.manifest('ai').segments
    expect(segments.length).toBeGreaterThan(1)
    expect(segments.map((s) => s.file)).toEqual(
      readdirSync(dir)
        .filter((f) => f.endsWith('.nwfj'))
        .sort(),
    )
  })

  it('keeps sequence numbers continuous across segments', () => {
    const store = spread()
    expect(store.read('ai').map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(store.head('ai').seq).toBe(8)
  })

  it('makes every segment independently verifiable', () => {
    const store = spread()
    expect(store.verify('ai').valid).toBe(true)
    for (const segment of store.manifest('ai').segments) {
      expect(readFileSync(join(dir, segment.file), 'utf8').startsWith('J\t1\tai\t')).toBe(true)
    }
  })

  it('serves a cursor that spans a segment boundary', () => {
    const store = spread()
    const boundary = store.manifest('ai').segments[0]?.lastSeq ?? 0
    const tail = store.since('ai', boundary - 1)
    expect(tail.records[0]?.seq).toBe(boundary)
    expect(tail.records.map((r) => r.seq)).toEqual(
      Array.from({ length: 8 - boundary + 1 }, (_, i) => boundary + i),
    )
    expect(tail.tooOld).toBe(false)
  })
})

describe('since', () => {
  it('returns only the entries after the cursor', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1), entry(2), entry(3)], meta)

    expect(store.since('ai', 2).entries.map((e) => e.id)).toEqual(['post-3'])
    expect(store.since('ai', store.head('ai')).entries).toEqual([])
    expect(store.since('ai').entries).toHaveLength(3)
  })

  it('reports an empty journal as up to date', () => {
    const store = openJournalStore({ dir })
    expect(store.since('ai')).toMatchObject({ entries: [], tooOld: false, head: { seq: 0 } })
  })

  it('flags a cursor older than the oldest retained entry', () => {
    const store = openJournalStore({ dir, maxSegmentBytes: 400 })
    for (let n = 1; n <= 8; n++) store.append('ai', [entry(n)], meta)
    store.compact('ai', 1)

    const oldest = store.manifest('ai').segments[0]?.firstSeq ?? 0
    expect(store.since('ai', 1).tooOld).toBe(true)
    expect(store.since('ai', oldest - 1).tooOld).toBe(false)
  })
})

describe('query', () => {
  /** Two segments: tags "alpha" (days 1-2) and "beta" (days 20-21). */
  function split(): ReturnType<typeof openJournalStore> {
    const store = openJournalStore({ dir, maxSegmentBytes: 1 })
    store.append('ai', [entry(1, { tags: ['alpha'], source: 'One' })], meta)
    store.append('ai', [entry(2, { tags: ['alpha'], source: 'One' })], meta)
    store.append('ai', [entry(3, { day: 20, tags: ['beta'], source: 'Two' })], meta)
    store.append('ai', [entry(4, { day: 21, tags: ['beta'], source: 'Two' })], meta)
    return store
  }

  it('returns every entry for an empty query', () => {
    const store = split()
    const result = store.query('ai')
    expect(result.entries).toHaveLength(4)
    expect(result.skipped).toEqual([])
  })

  it('never opens a segment whose tag dictionary cannot match', () => {
    const store = split()
    const result = store.query('ai', { filter: { include: [{ field: 'tag', pattern: 'beta' }] } })

    expect(result.entries.map((e) => e.id)).toEqual(['post-3', 'post-4'])
    expect(result.skipped).toHaveLength(2)
    expect(result.scanned).toHaveLength(2)
    // The pruned segments really do hold the alpha entries, so skipping them
    // was a decision made from the manifest alone.
    expect(
      result.skipped.every((file) => readFileSync(join(dir, file), 'utf8').includes('alpha')),
    ).toBe(true)
  })

  it('prunes by author and source dictionaries too', () => {
    const store = split()
    expect(
      store.query('ai', { filter: { include: [{ field: 'source', pattern: 'Two' }] } }).skipped,
    ).toHaveLength(2)
    expect(
      store.query('ai', { filter: { include: [{ field: 'author', pattern: 'nobody' }] } }).scanned,
    ).toEqual([])
  })

  it('never prunes on title or summary rules', () => {
    const store = split()
    const result = store.query('ai', {
      filter: { include: [{ field: 'title', pattern: 'Post 3' }] },
    })
    expect(result.skipped).toEqual([])
    expect(result.entries.map((e) => e.id)).toEqual(['post-3'])
  })

  it('prunes by date range', () => {
    const store = split()
    const result = store.query('ai', { from: Date.UTC(2026, 0, 15) })
    expect(result.entries.map((e) => e.id)).toEqual(['post-3', 'post-4'])
    expect(result.skipped).toHaveLength(2)

    const upper = store.query('ai', { to: Date.UTC(2026, 0, 10) })
    expect(upper.entries.map((e) => e.id)).toEqual(['post-1', 'post-2'])
  })

  it('skips segments with no dated entries when a date bound is set', () => {
    const store = openJournalStore({ dir, maxSegmentBytes: 1 })
    store.append('ai', [entry(1)], meta)
    store.append('ai', [{ id: 'undated', title: 'Undated', link: 'https://x.test/u' }], meta)

    const result = store.query('ai', { from: Date.UTC(2025, 0, 1) })
    expect(result.entries.map((e) => e.id)).toEqual(['post-1'])
    expect(result.skipped).toHaveLength(1)
  })

  it('sorts and limits across the whole archive, not per segment', () => {
    const store = split()
    const result = store.query('ai', { sort: 'date', limit: 2 })
    expect(result.entries.map((e) => e.id)).toEqual(['post-4', 'post-3'])
  })

  it('applies a regex rule the same way the live filter does', () => {
    const store = split()
    const result = store.query('ai', {
      filter: { include: [{ field: 'tag', pattern: '^bet', regex: true }] },
    })
    expect(result.entries.map((e) => e.id)).toEqual(['post-3', 'post-4'])
    expect(result.skipped).toHaveLength(2)
  })
})

describe('the manifest is a cache', () => {
  it('is rebuilt after being deleted, with identical results', () => {
    const store = openJournalStore({ dir, maxSegmentBytes: 400 })
    for (let n = 1; n <= 6; n++) store.append('ai', [entry(n, { tags: ['x'] })], meta)

    const before = store.manifest('ai')
    rmSync(join(dir, 'ai.manifest.json'))
    const after = store.manifest('ai')

    expect(after).toEqual(before)
    expect(existsSync(join(dir, 'ai.manifest.json'))).toBe(true)
    expect(
      store.query('ai', { filter: { include: [{ field: 'tag', pattern: 'x' }] } }).entries,
    ).toHaveLength(6)
  })

  it('is rebuilt when a segment changed behind its back', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)], meta)

    const stale = JSON.parse(readFileSync(join(dir, 'ai.manifest.json'), 'utf8'))
    stale.segments[0].bytes = 1
    stale.segments[0].keys = []
    writeFileSync(join(dir, 'ai.manifest.json'), JSON.stringify(stale))

    // A stale cache must not resurrect a duplicate.
    expect(store.append('ai', [entry(1)], meta)).toMatchObject({ added: 0, skipped: 1 })
  })

  it('is rebuilt when it is not valid JSON', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)], meta)
    writeFileSync(join(dir, 'ai.manifest.json'), '{ not json')
    expect(store.manifest('ai').segments).toHaveLength(1)
  })

  it('is rebuilt when its version is from another release', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)], meta)
    const manifest = JSON.parse(readFileSync(join(dir, 'ai.manifest.json'), 'utf8'))
    writeFileSync(join(dir, 'ai.manifest.json'), JSON.stringify({ ...manifest, version: 99 }))
    expect(store.manifest('ai').version).toBe(1)
  })

  it('records the vocabulary and date range of each segment', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1, { tags: ['alpha'], source: 'One' })], {
      ...meta,
      title: 'Example Blog',
    })
    const segment = store.manifest('ai').segments[0]
    expect(segment?.tags).toEqual(['alpha'])
    expect(segment?.sources).toEqual(['One'])
    expect(segment?.entries).toBe(1)
    expect(segment?.minTime).toBe(Math.floor(Date.UTC(2026, 0, 1) / 1000))
  })
})

describe('housekeeping', () => {
  it('lists the journal ids in the directory', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)])
    store.append('space', [entry(2)])
    writeFileSync(join(dir, 'notes.txt'), 'ignored')
    expect(store.list()).toEqual(['ai', 'space'])
  })

  it('lists nothing for a directory that does not exist yet', () => {
    const store = openJournalStore({ dir: join(dir, 'missing') })
    expect(store.list()).toEqual([])
    expect(store.manifest('ai').segments).toEqual([])
    expect(store.head('ai')).toEqual({ seq: 0 })
  })

  it('ignores files that do not follow the segment naming scheme', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)])
    writeFileSync(join(dir, 'ai.notanumber.nwfj'), 'J\t1\tai\t0\n')
    expect(store.manifest('ai').segments).toHaveLength(1)
  })

  it('drops the oldest segments on compaction', () => {
    const store = openJournalStore({ dir, maxSegmentBytes: 400 })
    for (let n = 1; n <= 8; n++) store.append('ai', [entry(n)], meta)

    const before = store.manifest('ai').segments.length
    const removed = store.compact('ai', 1)

    expect(removed).toHaveLength(before - 1)
    expect(store.manifest('ai').segments).toHaveLength(1)
    expect(removed.every((file) => !existsSync(join(dir, file)))).toBe(true)
    expect(store.head('ai').seq).toBe(8)
  })

  it('keeps everything when asked to keep more segments than exist', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1)])
    expect(store.compact('ai', 10)).toEqual([])
    expect(store.read('ai')).toHaveLength(1)
  })

  it('reports a corrupted segment', () => {
    const store = openJournalStore({ dir })
    store.append('ai', [entry(1), entry(2)], meta)
    const path = join(dir, 'ai.00001.nwfj')
    writeFileSync(path, readFileSync(path, 'utf8').replace('Post 1', 'Post X'))

    const result = store.verify('ai')
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.message).toMatch(/expected chain/)
  })
})
