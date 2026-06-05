import { describe, expect, it } from 'vitest'
import { finalizeFeed, normDate, resolveUrl, stripHtml } from './util'

const ctx = { sourceUrl: 'https://example.com/' }

describe('util', () => {
  it('resolveUrl resolves relative urls and returns the input on failure', () => {
    expect(resolveUrl('/a', 'https://example.com/')).toBe('https://example.com/a')
    expect(resolveUrl('also-bad', 'not-a-base')).toBe('also-bad')
  })

  it('normDate normalizes valid dates and rejects bad ones', () => {
    expect(normDate('2024-03-09T08:30:00Z')).toBe('2024-03-09T08:30:00.000Z')
    expect(normDate('nonsense')).toBeUndefined()
    expect(normDate(undefined)).toBeUndefined()
  })

  it('stripHtml strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <b>world</b></p>')).toBe('Hello world')
    expect(stripHtml('   ')).toBeUndefined()
    expect(stripHtml(undefined)).toBeUndefined()
  })

  it('finalizeFeed fills defaults, derives updated, and stamps the generator', () => {
    const withDates = finalizeFeed(
      {
        title: 'T',
        home: '/home',
        self: 'https://example.com/feed',
        authors: [{ name: 'A' }],
        entries: [
          { id: 'e1', title: 'E', link: 'https://example.com/1', updated: '2024-03-05T00:00:00Z' },
        ],
      },
      ctx,
    )
    expect(withDates.id).toBe('https://example.com/') // id defaults to sourceUrl
    expect(withDates.home).toBe('https://example.com/home') // resolved
    expect(withDates.updated).toBe('2024-03-05T00:00:00.000Z') // derived from newest entry
    expect(withDates.authors).toHaveLength(1)
    expect(withDates.generator?.name).toBe('Neurowire')

    const noDates = finalizeFeed(
      { id: 'urn:x', entries: [{ id: 'x', title: 'X', link: 'https://example.com/x' }] },
      ctx,
    )
    expect(noDates.id).toBe('urn:x') // explicit id kept
    expect(noDates.title).toBe('Untitled') // default title
    expect(typeof noDates.updated).toBe('string') // falls back to now
  })

  it('synthesizes a stable urn id for entries with no source id', () => {
    const make = () =>
      finalizeFeed({ entries: [{ id: '', title: 'Hello', link: 'https://example.com/a' }] }, ctx)
    const first = make().entries[0]?.id
    expect(first).toMatch(/^urn:nwf:[0-9a-f]{16}$/) // synthetic stable id
    expect(make().entries[0]?.id).toBe(first) // same input, same id
  })

  it('keeps a real source id untouched', () => {
    const feed = finalizeFeed(
      { entries: [{ id: 'guid-123', title: 'Hello', link: 'https://example.com/a' }] },
      ctx,
    )
    expect(feed.entries[0]?.id).toBe('guid-123')
  })

  it('gives entries that share a link but differ in title distinct ids', () => {
    const feed = finalizeFeed(
      {
        entries: [
          { id: '', title: 'One', link: 'https://example.com/a' },
          { id: '', title: 'Two', link: 'https://example.com/a' },
        ],
      },
      ctx,
    )
    expect(feed.entries[0]?.id).not.toBe(feed.entries[1]?.id)
  })
})
