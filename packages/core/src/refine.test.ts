import { describe, expect, it } from 'vitest'
import type { NeurowireEntry, NeurowireFeed } from './model'
import { parseDuration, resolveWindow, selectEntries } from './refine'

const entry = (over: Partial<NeurowireEntry> & { title: string }): NeurowireEntry => ({
  id: `id:${over.title}`,
  link: `https://x.example/${over.title}`,
  ...over,
})

// b (Jan), a (Mar), then two undated entries. Sources: a/u1/u2 = Alpha, b = Beta.
const feed: NeurowireFeed = {
  id: 'https://x.example/feed',
  title: 'Fixture',
  updated: '2024-03-15T12:00:00.000Z',
  entries: [
    entry({ title: 'Banana', published: '2024-01-01T00:00:00Z', source: { name: 'Beta' } }),
    entry({ title: 'Apple', published: '2024-03-01T00:00:00Z', source: { name: 'Alpha' } }),
    entry({ title: 'Zeta', source: { name: 'Alpha' } }),
    entry({ title: 'Yeta', source: { name: 'Alpha' } }),
  ],
}

const titles = (f: NeurowireFeed): string[] => f.entries.map((e) => e.title)

describe('parseDuration', () => {
  it('parses minutes, hours, and days', () => {
    expect(parseDuration('90m')).toBe(90 * 60_000)
    expect(parseDuration('24h')).toBe(24 * 3_600_000)
    expect(parseDuration(' 7d ')).toBe(7 * 86_400_000)
  })

  it('returns undefined for garbage', () => {
    expect(parseDuration('soon')).toBeUndefined()
    expect(parseDuration('10w')).toBeUndefined()
  })
})

describe('resolveWindow', () => {
  const now = Date.parse('2024-03-15T12:00:00Z') // a Friday

  it('resolves an explicit between range', () => {
    expect(resolveWindow({ between: ['2024-01-01', '2024-02-01'] }, now)).toEqual({
      from: Date.parse('2024-01-01'),
      to: Date.parse('2024-02-01'),
    })
  })

  it('drops unparseable between bounds', () => {
    expect(resolveWindow({ between: ['nope', 'nah'] }, now)).toEqual({
      from: undefined,
      to: undefined,
    })
  })

  it('resolves today to midnight UTC', () => {
    expect(resolveWindow({ today: true }, now)).toEqual({
      from: Date.parse('2024-03-15T00:00:00Z'),
    })
  })

  it('resolves thisWeek to the Monday midnight UTC', () => {
    expect(resolveWindow({ thisWeek: true }, now)).toEqual({
      from: Date.parse('2024-03-11T00:00:00Z'),
    })
  })

  it('resolves since and maxAge to a relative lower bound', () => {
    expect(resolveWindow({ since: '24h' }, now)).toEqual({ from: now - 86_400_000 })
    expect(resolveWindow({ maxAge: '7d' }, now)).toEqual({ from: now - 7 * 86_400_000 })
  })

  it('ignores an unparseable duration and an empty spec', () => {
    expect(resolveWindow({ since: 'whenever' }, now)).toEqual({})
    expect(resolveWindow({}, now)).toEqual({})
  })
})

describe('selectEntries', () => {
  it('returns every entry when no options are given', () => {
    expect(titles(selectEntries(feed, {}))).toEqual(['Banana', 'Apple', 'Zeta', 'Yeta'])
  })

  it('filters by a lower bound and drops undated entries', () => {
    const out = selectEntries(feed, { from: Date.parse('2024-02-01') })
    expect(titles(out)).toEqual(['Apple'])
  })

  it('filters by an upper bound', () => {
    const out = selectEntries(feed, { to: Date.parse('2024-02-01') })
    expect(titles(out)).toEqual(['Banana'])
  })

  it('filters by a from/to bracket', () => {
    const out = selectEntries(feed, {
      from: Date.parse('2024-02-15'),
      to: Date.parse('2024-03-15'),
    })
    expect(titles(out)).toEqual(['Apple'])
  })

  it('sorts by date newest-first by default, undated last', () => {
    expect(titles(selectEntries(feed, { sort: 'date' }))).toEqual([
      'Apple',
      'Banana',
      'Zeta',
      'Yeta',
    ])
  })

  it('sorts by date ascending when asked', () => {
    expect(titles(selectEntries(feed, { sort: 'date', order: 'asc' }))).toEqual([
      'Zeta',
      'Yeta',
      'Banana',
      'Apple',
    ])
  })

  it('sorts by title A-Z by default and Z-A on request', () => {
    expect(titles(selectEntries(feed, { sort: 'title' }))).toEqual([
      'Apple',
      'Banana',
      'Yeta',
      'Zeta',
    ])
    expect(titles(selectEntries(feed, { sort: 'title', order: 'desc' }))).toEqual([
      'Zeta',
      'Yeta',
      'Banana',
      'Apple',
    ])
  })

  it('sorts by source name, breaking ties by date', () => {
    const out = selectEntries(feed, { sort: 'source' })
    expect(out.entries.map((e) => e.source?.name)).toEqual(['Alpha', 'Alpha', 'Alpha', 'Beta'])
    // Within Alpha the dated entry sorts after the two undated ones (oldest-first).
    expect(out.entries[2]?.title).toBe('Apple')
  })

  it('limits after filtering and sorting, and ignores a negative limit', () => {
    expect(titles(selectEntries(feed, { limit: 2 }))).toEqual(['Banana', 'Apple'])
    expect(selectEntries(feed, { limit: 0 }).entries).toEqual([])
    expect(titles(selectEntries(feed, { limit: -1 }))).toHaveLength(4)
  })
})
