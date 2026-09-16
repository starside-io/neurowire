import { type NeurowireFeed, toNwf } from '@neurowire/core'
import { describe, expect, it } from 'vitest'
import { parseFeedString } from './feed'
import { parseNwf } from './nwf'

const ctx = { sourceUrl: 'https://mirror.example/feed.nwf' }

const feed: NeurowireFeed = {
  id: 'https://blog.example/',
  title: 'Blog',
  home: 'https://blog.example/',
  updated: '2026-08-25T00:00:00.000Z',
  entries: [
    {
      id: 'urn:1',
      title: 'One',
      link: 'https://blog.example/posts/1',
      published: '2026-08-24T00:00:00.000Z',
      authors: [{ name: 'Ada' }],
      tags: ['rust'],
      source: { name: 'Blog' },
    },
    {
      id: 'urn:2',
      title: 'Two',
      link: 'https://blog.example/posts/2',
      published: '2026-08-23T00:00:00.000Z',
    },
  ],
}

describe('parseNwf', () => {
  it('reads back what toNwf wrote, entries and interned fields intact', () => {
    const parsed = parseNwf(toNwf(feed), ctx)
    expect(parsed.title).toBe('Blog')
    expect(parsed.home).toBe('https://blog.example/')
    expect(parsed.entries.map((entry) => entry.title)).toEqual(['One', 'Two'])
    expect(parsed.entries[0]?.link).toBe('https://blog.example/posts/1')
    expect(parsed.entries[0]?.authors?.[0]?.name).toBe('Ada')
    expect(parsed.entries[0]?.tags).toEqual(['rust'])
    expect(parsed.entries[0]?.source?.name).toBe('Blog')
  })

  it('records where the document was fetched from, without overwriting a real self', () => {
    expect(parseNwf(toNwf(feed), ctx).self).toBe('https://mirror.example/feed.nwf')
    const published = { ...feed, self: 'https://blog.example/feed.nwf' }
    expect(parseNwf(toNwf(published), ctx).self).toBe('https://blog.example/feed.nwf')
  })

  it('is reachable through the format dispatcher', () => {
    expect(parseFeedString(toNwf(feed), ctx).entries).toHaveLength(2)
  })

  it('names NWF among the formats it recognizes', () => {
    expect(() => parseFeedString('just some text', ctx)).toThrow(/expected NWF, Atom, RSS/)
  })

  it('fails a malformed document with the line number validate would print', () => {
    expect(() => parseNwf('NWF2\nF\tid\tTitle', ctx)).toThrow(/line 1/)
    const broken = 'NWF1\nF\thttps://b.example/\tBlog\t\t\t1787771856\t\nE\tonly-one-cell\n'
    expect(() => parseNwf(broken, ctx)).toThrow(/Invalid nwf document: line \d+/)
  })
})
