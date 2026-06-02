import { describe, expect, it } from 'vitest'
import { mergeFeeds } from './merge'
import type { NeurowireFeed } from './model'

const feedA: NeurowireFeed = {
  id: 'a',
  title: 'Source A',
  home: 'https://a.example.com',
  updated: '2024-03-05T00:00:00.000Z',
  entries: [
    {
      id: 'a1',
      title: 'A older',
      link: 'https://a.example.com/1',
      updated: '2024-03-01T00:00:00.000Z',
    },
    {
      id: 'a2',
      title: 'A newer',
      link: 'https://a.example.com/2',
      updated: '2024-03-05T00:00:00.000Z',
    },
  ],
}

const feedB: NeurowireFeed = {
  id: 'b',
  title: 'Source B',
  home: 'https://b.example.com',
  updated: '2024-03-04T00:00:00.000Z',
  entries: [
    {
      id: 'b1',
      title: 'B middle',
      link: 'https://b.example.com/1',
      updated: '2024-03-04T00:00:00.000Z',
    },
  ],
}

describe('mergeFeeds', () => {
  it('names the feed, tags each entry with its source, and sorts newest first', () => {
    const merged = mergeFeeds('AI News', [
      { feed: feedA, source: { name: 'A', url: 'https://a.example.com' } },
      { feed: feedB, source: { name: 'B', url: 'https://b.example.com' } },
    ])

    expect(merged.title).toBe('AI News')
    expect(merged.entries.map((entry) => entry.title)).toEqual(['A newer', 'B middle', 'A older'])
    expect(merged.entries[0]?.source).toEqual({ name: 'A', url: 'https://a.example.com' })
    expect(merged.entries[1]?.source).toEqual({ name: 'B', url: 'https://b.example.com' })
    expect(merged.updated).toBe('2024-03-05T00:00:00.000Z')
  })

  it('falls back to the source feed title and honors limit', () => {
    const merged = mergeFeeds('Bundle', [{ feed: feedA }, { feed: feedB }], { limit: 2 })
    expect(merged.entries).toHaveLength(2)
    expect(merged.entries[0]?.source).toEqual({ name: 'Source A', url: 'https://a.example.com' })
  })

  it('de-duplicates entries by link', () => {
    const merged = mergeFeeds('Dup', [{ feed: feedA }, { feed: feedA }])
    expect(merged.entries).toHaveLength(2)
  })
})
