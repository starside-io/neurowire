import { describe, expect, it } from 'vitest'
import type { NeurowireFeed } from '../model'
import { fromNwf, toNwf } from './nwf'

describe('nwf edge cases', () => {
  it('serializes a minimal dateless feed and round-trips it', () => {
    const feed: NeurowireFeed = {
      id: 'urn:min',
      title: 'Minimal',
      updated: '2024-01-01T00:00:00.000Z',
      entries: [{ id: 'e1', title: 'Only', link: 'https://example.com/a' }],
    }
    const text = toNwf(feed)
    expect(text).not.toMatch(/\nA\t/) // no authors dictionary
    expect(text).not.toMatch(/\nT\t/) // no tags dictionary
    expect(text).not.toMatch(/\nS\t/) // no sources dictionary
    expect(text).not.toMatch(/\nB\t/) // single entry -> no shared base

    const back = fromNwf(text)
    expect(back.entries[0]?.updated).toBeUndefined() // dateless -> delta '-'
    expect(back.entries[0]?.link).toBe('https://example.com/a')
  })

  it('round-trips authors that carry a url and email', () => {
    const feed: NeurowireFeed = {
      id: 'urn:a',
      title: 'Authors',
      updated: '2024-01-01T00:00:00.000Z',
      authors: [{ name: 'Ada', url: 'https://ada', email: 'ada@x.com' }],
      entries: [
        {
          id: 'e1',
          title: 'Post',
          link: 'https://example.com/a',
          updated: '2024-01-01T00:00:00.000Z',
          authors: [{ name: 'Grace', email: 'grace@x.com' }],
        },
      ],
    }
    const back = fromNwf(toNwf(feed))
    expect(back.authors?.[0]).toEqual({ name: 'Ada', url: 'https://ada', email: 'ada@x.com' })
    expect(back.entries[0]?.authors?.[0]).toEqual({ name: 'Grace', email: 'grace@x.com' })
  })

  it('stores absolute links when entries span different hosts', () => {
    const feed: NeurowireFeed = {
      id: 'urn:x',
      title: 'Mixed',
      updated: '2024-01-01T00:00:00.000Z',
      entries: [
        { id: 'a', title: 'A', link: 'https://aaa.example.com/1' },
        { id: 'b', title: 'B', link: 'https://bbb.example.org/2' },
      ],
    }
    const text = toNwf(feed)
    expect(text).not.toMatch(/\nB\t/) // no common base across hosts
    expect(fromNwf(text).entries.map((e) => e.link)).toEqual([
      'https://aaa.example.com/1',
      'https://bbb.example.org/2',
    ])
  })

  it('escapes control characters and round-trips a published-only entry', () => {
    const feed: NeurowireFeed = {
      id: 'urn:esc',
      title: 'tab\there and a \\backslash',
      updated: '2024-01-01T00:00:00.000Z',
      entries: [
        {
          id: 'e1',
          title: 'a\tb\nc\\d\re',
          link: 'https://example.com/a',
          published: '2024-01-01T00:00:00.000Z',
          summary: 'sum\twith\ttabs',
        },
      ],
    }
    const back = fromNwf(toNwf(feed))
    expect(back.title).toBe('tab\there and a \\backslash')
    expect(back.entries[0]?.title).toBe('a\tb\nc\\d\re')
    expect(back.entries[0]?.summary).toBe('sum\twith\ttabs')
    // a published-only entry comes back as `updated` (nwf stores one timestamp)
    expect(back.entries[0]?.updated).toBe('2024-01-01T00:00:00.000Z')
  })
})
