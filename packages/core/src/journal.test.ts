import { describe, expect, it } from 'vitest'
import { filterEntries } from './filter'
import {
  JOURNAL_EXTENSION,
  JOURNAL_MEDIA_TYPE,
  JOURNAL_VERSION,
  type JournalFeedMeta,
  createJournalEncoder,
  journalEntryMatches,
  journalHead,
  journalToFeed,
  parseJournal,
  queryJournal,
  readJournalSince,
  resumeJournalEncoder,
  verifyJournal,
} from './journal'
import type { NeurowireEntry } from './model'
import { selectEntries } from './refine'
import { roundTripFeed } from './test-fixtures'

const meta: JournalFeedMeta = {
  id: 'https://blog.example.com/feed.atom',
  title: 'Example Blog',
  home: 'https://blog.example.com/',
  self: 'https://blog.example.com/feed.atom',
}

/** Encode entries into a full journal segment, with a trailing checkpoint. */
function write(
  entries: NeurowireEntry[],
  options: { journalId?: string; feed?: JournalFeedMeta; checkpoint?: boolean } = {},
): string {
  const encoder = createJournalEncoder({
    journalId: options.journalId ?? 'test',
    created: '2026-01-01T00:00:00.000Z',
  })
  let text = encoder.header()
  for (const entry of entries) text += encoder.push(entry, options.feed ?? meta)
  if (options.checkpoint !== false) text += encoder.checkpoint()
  return text
}

describe('nwfj constants', () => {
  it('names the media type and extension without touching the feed formats', () => {
    expect(JOURNAL_VERSION).toBe(1)
    expect(JOURNAL_MEDIA_TYPE).toBe('application/x-nwf-journal')
    expect(JOURNAL_EXTENSION).toBe('nwfj')
  })
})

describe('journal encoding', () => {
  it('round-trips entries through encode and decode', () => {
    const parsed = parseJournal(write(roundTripFeed.entries))
    expect(parsed.records.map((r) => r.entry)).toEqual(roundTripFeed.entries)
    expect(parsed.issues).toEqual([])
  })

  it('re-encodes byte-identically from the decoded records', () => {
    const first = write(roundTripFeed.entries)
    const second = write(parseJournal(first).records.map((r) => r.entry))
    expect(second).toBe(first)
  })

  it('opens each segment with a J header carrying the id and version', () => {
    const line = write([]).split('\n')[0] ?? ''
    expect(line.split('\t').slice(0, 3)).toEqual(['J', '1', 'test'])
  })

  it('numbers entries from 1 and keeps them increasing', () => {
    const parsed = parseJournal(write(roundTripFeed.entries))
    expect(parsed.records.map((r) => r.seq)).toEqual([1, 2])
    expect(parsed.head.seq).toBe(2)
  })

  it('declares each interned value once, immediately before its first use', () => {
    const lines = write(roundTripFeed.entries).split('\n')
    // Both entries share the tag "intro" and one source, so each is declared once.
    expect(lines.filter((l) => l.startsWith('T+\t') && l.endsWith('intro'))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('S+\t'))).toHaveLength(1)
    const firstTag = lines.findIndex((l) => l.startsWith('T+\t'))
    const firstEntry = lines.findIndex((l) => l.startsWith('E\t'))
    expect(firstTag).toBeLessThan(firstEntry)
  })

  it('resolves interned references to the same values a snapshot carries', () => {
    const parsed = parseJournal(write(roundTripFeed.entries))
    expect(parsed.records[0]?.entry.tags).toEqual(['intro', 'meta'])
    expect(parsed.records[1]?.entry.authors).toEqual([{ name: 'Grace Hopper' }])
    expect(parsed.records[0]?.entry.source).toEqual({
      name: 'Example Blog',
      url: 'https://blog.example.com/',
    })
  })

  it('emits the feed identity once while it stays the same', () => {
    const lines = write(roundTripFeed.entries).split('\n')
    expect(lines.filter((l) => l.startsWith('F\t'))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('B\t'))).toHaveLength(1)
  })

  it('re-emits the identity when the feed changes mid-journal', () => {
    const encoder = createJournalEncoder({ journalId: 'multi', created: '2026-01-01T00:00:00Z' })
    let text = encoder.header()
    text += encoder.push(roundTripFeed.entries[0] as NeurowireEntry, meta)
    text += encoder.push(roundTripFeed.entries[1] as NeurowireEntry, {
      id: 'other',
      title: 'Other Feed',
    })
    const parsed = parseJournal(text)
    expect(parsed.records[0]?.feed?.title).toBe('Example Blog')
    expect(parsed.records[1]?.feed?.title).toBe('Other Feed')
  })

  it('stores links relative to the declared base and expands them back', () => {
    const text = write(roundTripFeed.entries)
    expect(text).toContain('~posts/hello-world')
    expect(parseJournal(text).records[0]?.entry.link).toBe(
      'https://blog.example.com/posts/hello-world',
    )
  })

  it('leaves off-base links absolute', () => {
    const entry: NeurowireEntry = { id: 'x', title: 'X', link: 'https://elsewhere.test/x' }
    const parsed = parseJournal(write([entry]))
    expect(parsed.records[0]?.entry.link).toBe('https://elsewhere.test/x')
  })

  it('keeps published and updated in their own cells', () => {
    const entry: NeurowireEntry = {
      id: 'both',
      title: 'Both dates',
      link: 'https://blog.example.com/both',
      published: '2026-02-01T00:00:00.000Z',
      updated: '2026-02-02T00:00:00.000Z',
    }
    expect(parseJournal(write([entry])).records[0]?.entry).toEqual(entry)
  })

  it('writes a dash for a missing date and omits the field on the way back', () => {
    const entry: NeurowireEntry = { id: 'undated', title: 'No date', link: 'https://x.test/a' }
    const parsed = parseJournal(write([entry]))
    expect(parsed.records[0]?.entry.published).toBeUndefined()
    expect(parsed.records[0]?.entry.updated).toBeUndefined()
  })

  it('encodes without a feed identity when none is given', () => {
    const encoder = createJournalEncoder({ journalId: 'bare', created: '2026-01-01T00:00:00Z' })
    const text = encoder.header() + encoder.push({ id: 'a', title: 'A', link: 'https://x.test/a' })
    const parsed = parseJournal(text)
    expect(parsed.records[0]?.feed).toBeUndefined()
    expect(parsed.issues).toEqual([])
  })

  it('escapes tabs and newlines in text cells', () => {
    const entry: NeurowireEntry = {
      id: 'weird',
      title: 'Tab\there',
      link: 'https://x.test/weird',
      summary: 'Line\nbreak',
    }
    const text = write([entry])
    expect(text.split('\n').filter(Boolean)).toHaveLength(5) // J, F, B, E, C
    expect(parseJournal(text).records[0]?.entry.title).toBe('Tab\there')
    expect(parseJournal(text).records[0]?.entry.summary).toBe('Line\nbreak')
  })

  it('defaults the created date to now when none is given', () => {
    const encoder = createJournalEncoder({ journalId: 'now' })
    const created = parseJournal(encoder.header()).header?.created ?? ''
    expect(Date.parse(created)).toBeGreaterThan(Date.parse('2020-01-01T00:00:00Z'))
  })

  it('continues the numbering from startSeq so a rotated segment lines up', () => {
    const encoder = createJournalEncoder({
      journalId: 'rotated',
      created: '2026-01-01T00:00:00Z',
      startSeq: 40,
    })
    const text = encoder.header() + encoder.push({ id: 'a', title: 'A', link: 'https://x.test/a' })
    expect(parseJournal(text).records[0]?.seq).toBe(41)
  })

  it('exposes the journal id and sequence number as it goes', () => {
    const encoder = createJournalEncoder({ journalId: 'ids', created: '2026-01-01T00:00:00Z' })
    expect(encoder.journalId).toBe('ids')
    expect(encoder.seq).toBe(0)
    encoder.push({ id: 'a', title: 'A', link: 'https://x.test/a' })
    expect(encoder.seq).toBe(1)
  })
})

describe('resuming a segment', () => {
  it('continues the sequence, dictionaries, and base of an existing segment', () => {
    const first = write([roundTripFeed.entries[0] as NeurowireEntry], { checkpoint: false })
    const encoder = resumeJournalEncoder(first)
    const text = first + encoder.push(roundTripFeed.entries[1] as NeurowireEntry, meta)

    const parsed = parseJournal(text)
    expect(parsed.records.map((r) => r.seq)).toEqual([1, 2])
    // "intro" was already interned by the first entry, so it is not re-declared.
    expect(
      text.split('\n').filter((l) => l.startsWith('T+\t') && l.endsWith('intro')),
    ).toHaveLength(1)
    // The identity is unchanged, so no second F line.
    expect(text.split('\n').filter((l) => l.startsWith('F\t'))).toHaveLength(1)
    expect(parsed.issues).toEqual([])
  })

  it('keeps the chain intact across a resume', () => {
    const first = write([roundTripFeed.entries[0] as NeurowireEntry], { checkpoint: false })
    const encoder = resumeJournalEncoder(first)
    const text =
      first + encoder.push(roundTripFeed.entries[1] as NeurowireEntry, meta) + encoder.checkpoint()
    expect(verifyJournal(text).valid).toBe(true)
  })

  it('resumes an empty or headerless segment without throwing', () => {
    const encoder = resumeJournalEncoder('')
    expect(encoder.seq).toBe(0)
    expect(encoder.journalId).toBe('')
  })
})

describe('cursors', () => {
  it('reads the head cursor by scanning back from the last line', () => {
    const text = write(roundTripFeed.entries)
    expect(journalHead(text)).toEqual(parseJournal(text).head)
    expect(journalHead(text).seq).toBe(2)
    expect(journalHead(text).hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('reports seq 0 for a journal with no entries', () => {
    expect(journalHead(write([]))).toEqual({ seq: 0 })
    expect(parseJournal(write([])).head).toEqual({ seq: 0 })
  })

  it('omits the hash when the last checkpoint is behind the head', () => {
    const encoder = createJournalEncoder({ journalId: 'behind', created: '2026-01-01T00:00:00Z' })
    let text = encoder.header()
    text += encoder.push({ id: 'a', title: 'A', link: 'https://x.test/a' })
    text += encoder.checkpoint()
    text += encoder.push({ id: 'b', title: 'B', link: 'https://x.test/b' })
    expect(journalHead(text)).toEqual({ seq: 2 })
    expect(parseJournal(text).head).toEqual({ seq: 2 })
  })

  it('skips malformed trailing lines when reading the head', () => {
    const text = `${write(roundTripFeed.entries)}E\tnope\tbad\n`
    expect(journalHead(text).seq).toBe(2)
  })

  it('ignores a checkpoint with a non-numeric seq while scanning back', () => {
    const text = `${write(roundTripFeed.entries, { checkpoint: false })}C\tnope\tdeadbeef\n`
    expect(journalHead(text)).toEqual({ seq: 2 })
  })

  it('prefers the last checkpoint when a segment was checkpointed twice', () => {
    const encoder = createJournalEncoder({ journalId: 'twice', created: '2026-01-01T00:00:00Z' })
    let text = encoder.header()
    text += encoder.push({ id: 'a', title: 'A', link: 'https://x.test/a' })
    text += encoder.checkpoint()
    text += encoder.checkpoint()
    expect(journalHead(text)).toEqual({ seq: 1, hash: encoder.chain })
  })

  it('returns exactly the tail after a cursor', () => {
    const text = write(roundTripFeed.entries)
    const tail = readJournalSince(text, { seq: 1 })
    expect(tail.records.map((r) => r.seq)).toEqual([2])
    expect(readJournalSince(text, 2).records).toEqual([])
    expect(readJournalSince(text).records).toHaveLength(2)
  })

  it('flags a cursor whose hash disagrees with the checkpoint at that seq', () => {
    const text = write(roundTripFeed.entries)
    const good = journalHead(text)
    expect(readJournalSince(text, good).issues).toEqual([])

    const bad = readJournalSince(text, { seq: 2, hash: 'ffffffffffffffff' })
    expect(bad.issues[0]?.message).toMatch(/does not match the checkpoint/)
  })

  it('accepts a cursor hash when no checkpoint exists at that seq', () => {
    const text = write(roundTripFeed.entries, { checkpoint: false })
    expect(readJournalSince(text, { seq: 1, hash: 'ffffffffffffffff' }).issues).toEqual([])
  })
})

describe('the chain', () => {
  it('verifies a clean journal', () => {
    const result = verifyJournal(write(roundTripFeed.entries))
    expect(result).toEqual({ valid: true, checked: 1, issues: [] })
  })

  it('fails when a byte is flipped', () => {
    const text = write(roundTripFeed.entries).replace('On Compact Formats', 'On Compact Format!')
    const result = verifyJournal(text)
    expect(result.valid).toBe(false)
    expect(result.issues[0]?.message).toMatch(/expected chain/)
  })

  it('fails when a record is dropped', () => {
    const text = write(roundTripFeed.entries)
    const lines = text.split('\n')
    const cut = lines.filter((l) => !l.startsWith('E\t1\t')).join('\n')
    expect(verifyJournal(cut).valid).toBe(false)
  })

  it('reports nothing to check when there are no checkpoints', () => {
    expect(verifyJournal(write(roundTripFeed.entries, { checkpoint: false }))).toEqual({
      valid: true,
      checked: 0,
      issues: [],
    })
  })
})

describe('diagnostics', () => {
  it('reports a missing header', () => {
    const parsed = parseJournal('E\t1\t-\t-\ta\thttps://x.test/a\t\t\tA\t\t\n')
    expect(parsed.header).toBeUndefined()
    expect(parsed.issues.map((i) => i.message)).toContain(
      'missing the required J (journal header) line',
    )
  })

  it('reports a second header line', () => {
    const text = write([]) + write([])
    expect(parseJournal(text).issues.map((i) => i.message)).toContain('more than one J header line')
  })

  it('reports a non-integer version', () => {
    const parsed = parseJournal('J\tx\ttest\t0\n')
    expect(parsed.issues[0]?.message).toMatch(/J version must be an integer/)
    expect(parsed.header).toBeUndefined()
  })

  it('warns about a journal written by a newer version', () => {
    const parsed = parseJournal('J\t99\ttest\t0\n')
    expect(parsed.issues[0]?.message).toMatch(/newer than supported version 1/)
    expect(parsed.header?.version).toBe(99)
  })

  it('reports a short E line with its line number', () => {
    const text = `${write([])}E\t1\t-\n`
    const issue = parseJournal(text).issues.find((i) => i.message.includes('at least 9 cells'))
    expect(issue?.line).toBe(3) // J, C, then the bad E line
  })

  it('reports a non-integer sequence number', () => {
    const text = `${write([])}E\tx\t-\t-\ta\thttps://x.test/a\t\t\tA\t\t\n`
    expect(parseJournal(text).issues.map((i) => i.message)).toContainEqual(
      expect.stringMatching(/E seq must be an integer/),
    )
  })

  it('reports a sequence number that does not increase', () => {
    const text = `${write(roundTripFeed.entries, { checkpoint: false })}E\t1\t-\t-\ta\thttps://x.test/a\t\t\tA\t\t\n`
    expect(parseJournal(text).issues.map((i) => i.message)).toContainEqual(
      expect.stringMatching(/does not increase/),
    )
  })

  it('reports an out-of-range source reference', () => {
    const text = `${write([])}E\t1\t-\t-\ta\thttps://x.test/a\t\t\tA\t\t9\n`
    expect(parseJournal(text).issues.map((i) => i.message)).toContainEqual(
      expect.stringMatching(/sourceRef 9 is out of range/),
    )
  })

  it('reports an unknown line kind and keeps reading', () => {
    const text = `${write([])}Z\tmystery\n`
    expect(parseJournal(text).issues.map((i) => i.message)).toContainEqual(
      expect.stringMatching(/unknown line kind "Z"/),
    )
  })

  it('drops dangling author and tag references rather than inventing values', () => {
    const text = `${write([])}E\t1\t-\t-\ta\thttps://x.test/a\t7\t7\tA\t\t\n`
    const entry = parseJournal(text).records[0]?.entry
    expect(entry?.authors).toBeUndefined()
    expect(entry?.tags).toBeUndefined()
  })
})

describe('queryJournal', () => {
  const text = write(roundTripFeed.entries)
  const records = parseJournal(text).records

  it('answers exactly what the live feed path answers for the same spec', () => {
    const filter = { include: [{ field: 'tag' as const, pattern: 'formats' }] }
    const select = { sort: 'date' as const, limit: 5 }

    const live = selectEntries(filterEntries({ ...roundTripFeed }, filter), select).entries
    const archived = queryJournal(records, { filter, ...select })
    expect(archived).toEqual(live)
  })

  it('applies a time window the same way the fetch path does', () => {
    const from = Date.parse('2024-03-10T00:00:00Z')
    const live = selectEntries(roundTripFeed, { from }).entries
    expect(queryJournal(records, { from })).toEqual(live)
  })

  it('accepts plain entries as well as records', () => {
    expect(queryJournal(roundTripFeed.entries, { limit: 1 })).toHaveLength(1)
  })

  it('returns every entry for an empty query', () => {
    expect(queryJournal(records)).toHaveLength(2)
  })

  it('matches a single entry against a spec through the shared filter engine', () => {
    const entry = roundTripFeed.entries[0] as NeurowireEntry
    expect(journalEntryMatches(entry, { include: [{ field: 'tag', pattern: 'meta' }] })).toBe(true)
    expect(journalEntryMatches(entry, { include: [{ field: 'tag', pattern: 'nope' }] })).toBe(false)
  })
})

describe('journalToFeed', () => {
  it('rebuilds a feed from the most recent identity', () => {
    const feed = journalToFeed(parseJournal(write(roundTripFeed.entries)))
    expect(feed.id).toBe(meta.id)
    expect(feed.title).toBe('Example Blog')
    expect(feed.home).toBe('https://blog.example.com/')
    expect(feed.self).toBe(meta.self)
    expect(feed.entries).toHaveLength(2)
    expect(feed.updated).toBe('2024-03-10T11:00:00.000Z')
  })

  it('honors explicit overrides', () => {
    const feed = journalToFeed(parseJournal(write(roundTripFeed.entries)), {
      id: 'archive',
      title: 'Archive',
      updated: '2026-01-01T00:00:00.000Z',
    })
    expect([feed.id, feed.title, feed.updated]).toEqual([
      'archive',
      'Archive',
      '2026-01-01T00:00:00.000Z',
    ])
  })

  it('falls back to the journal id and header date when there are no entries', () => {
    const feed = journalToFeed(parseJournal(write([], { journalId: 'empty' })))
    expect(feed.id).toBe('empty')
    expect(feed.title).toBe('empty')
    expect(feed.updated).toBe('2026-01-01T00:00:00.000Z')
    expect(feed.entries).toEqual([])
  })

  it('falls back to a placeholder identity with no header at all', () => {
    const feed = journalToFeed({ records: [], head: { seq: 0 }, issues: [] })
    expect(feed.id).toBe('journal')
    expect(feed.updated).toBe('1970-01-01T00:00:00.000Z')
  })

  it('ignores undated entries when picking the newest date', () => {
    const feed = journalToFeed(
      parseJournal(write([{ id: 'a', title: 'A', link: 'https://x.test/a' }])),
    )
    expect(feed.updated).toBe('2026-01-01T00:00:00.000Z')
  })
})
