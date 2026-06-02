import { describe, expect, it } from 'vitest'
import { mergeFeeds } from './merge'
import type { NeurowireFeed } from './model'

describe('mergeFeeds edge cases', () => {
  it('uses now for dateless entries, honors options.id, and falls back link -> id', () => {
    const feed: NeurowireFeed = {
      id: 'x',
      title: '',
      updated: '2024-01-01T00:00:00.000Z',
      entries: [{ id: 'a', title: 'A', link: '' }],
    }
    const merged = mergeFeeds('Edge', [{ feed }], { id: 'custom:id' })

    expect(merged.id).toBe('custom:id')
    expect(merged.entries).toHaveLength(1)
    expect(typeof merged.updated).toBe('string')
    // no source.name (feed title empty) and no source.url (no home) -> empty source
    expect(merged.entries[0]?.source).toEqual({})
  })
})
