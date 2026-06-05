import { describe, expect, it } from 'vitest'
import { filterEntries, matchRule } from './filter'
import type { NeurowireEntry, NeurowireFeed } from './model'

const entry = (over: Partial<NeurowireEntry> & { title: string }): NeurowireEntry => ({
  id: `id:${over.title}`,
  link: `https://x.example/${over.title}`,
  ...over,
})

const feed: NeurowireFeed = {
  id: 'https://x.example/feed',
  title: 'Fixture',
  updated: '2024-03-15T12:00:00.000Z',
  entries: [
    entry({
      title: 'GPT-5 release notes',
      summary: 'A big leap forward',
      source: { name: 'Alpha' },
      authors: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
      tags: ['release', 'ml'],
    }),
    entry({
      title: 'Sponsored: buy our thing',
      source: { name: 'Beta' },
      authors: [{ name: 'Carl Sponsor' }],
      tags: ['ads'],
    }),
    entry({ title: 'Untagged musings' }),
  ],
}

const titles = (f: NeurowireFeed): string[] => f.entries.map((e) => e.title)

describe('matchRule', () => {
  const gpt = feed.entries[0] as NeurowireEntry
  const bare = feed.entries[2] as NeurowireEntry

  it('matches on title (case-insensitive substring)', () => {
    expect(matchRule(gpt, { field: 'title', pattern: 'release' })).toBe(true)
    expect(matchRule(gpt, { field: 'title', pattern: 'GPT-5' })).toBe(true)
    expect(matchRule(gpt, { field: 'title', pattern: 'nope' })).toBe(false)
  })

  it('matches on summary, treating an absent summary as empty', () => {
    expect(matchRule(gpt, { field: 'summary', pattern: 'leap' })).toBe(true)
    expect(matchRule(bare, { field: 'summary', pattern: 'leap' })).toBe(false)
  })

  it('matches on source name, treating an absent source as empty', () => {
    expect(matchRule(gpt, { field: 'source', pattern: 'alpha' })).toBe(true)
    expect(matchRule(bare, { field: 'source', pattern: 'alpha' })).toBe(false)
  })

  it('matches on author across single and multiple authors', () => {
    expect(matchRule(gpt, { field: 'author', pattern: 'grace' })).toBe(true)
    expect(matchRule(gpt, { field: 'author', pattern: 'ada' })).toBe(true)
    expect(matchRule(bare, { field: 'author', pattern: 'ada' })).toBe(false)
  })

  it('matches if any tag matches, and not when there are no tags', () => {
    expect(matchRule(gpt, { field: 'tag', pattern: 'release' })).toBe(true)
    expect(matchRule(gpt, { field: 'tag', pattern: 'ml' })).toBe(true)
    expect(matchRule(bare, { field: 'tag', pattern: 'release' })).toBe(false)
  })

  it('matches with a case-insensitive regex when regex is set', () => {
    expect(matchRule(gpt, { field: 'title', pattern: 'gpt-\\d', regex: true })).toBe(true)
    expect(matchRule(gpt, { field: 'tag', pattern: '^ml$', regex: true })).toBe(true)
    expect(matchRule(gpt, { field: 'title', pattern: '^nope', regex: true })).toBe(false)
  })
})

describe('filterEntries', () => {
  it('returns the feed unchanged for an empty spec', () => {
    expect(filterEntries(feed, {})).toBe(feed)
  })

  it('keeps only entries matching an include rule', () => {
    expect(
      titles(filterEntries(feed, { include: [{ field: 'tag', pattern: 'release' }] })),
    ).toEqual(['GPT-5 release notes'])
  })

  it('drops entries matching an exclude rule', () => {
    expect(
      titles(filterEntries(feed, { exclude: [{ field: 'title', pattern: 'sponsored' }] })),
    ).toEqual(['GPT-5 release notes', 'Untagged musings'])
  })

  it('applies include then exclude together', () => {
    const out = filterEntries(feed, {
      include: [{ field: 'source', pattern: 'a' }],
      exclude: [{ field: 'title', pattern: 'sponsored' }],
    })
    expect(titles(out)).toEqual(['GPT-5 release notes'])
  })

  it('supports a regex include rule', () => {
    const out = filterEntries(feed, {
      include: [{ field: 'title', pattern: 'gpt-\\d', regex: true }],
    })
    expect(titles(out)).toEqual(['GPT-5 release notes'])
  })
})
