import { describe, expect, it } from 'vitest'
import { entryKey, newEntries } from './diff'
import type { NeurowireEntry, NeurowireFeed } from './model'

const entry = (over: Partial<NeurowireEntry> & { title: string }): NeurowireEntry => ({
  id: `id:${over.title}`,
  link: `https://x.example/${over.title}`,
  ...over,
})

const feedOf = (entries: NeurowireEntry[]): NeurowireFeed => ({
  id: 'https://x.example/feed',
  title: 'Fixture',
  updated: '2024-03-15T12:00:00.000Z',
  entries,
})

const keys = (entries: NeurowireEntry[]): string[] => entries.map(entryKey)

describe('entryKey', () => {
  it('uses the id when present', () => {
    expect(entryKey(entry({ title: 'Apple' }))).toBe('id:Apple')
  })

  it('falls back to the link when the id is empty', () => {
    expect(entryKey(entry({ title: 'Apple', id: '' }))).toBe('https://x.example/Apple')
  })
})

describe('newEntries', () => {
  const a = entry({ title: 'Apple' })
  const b = entry({ title: 'Banana' })
  const c = entry({ title: 'Cherry' })
  const feed = feedOf([a, b, c])

  it('returns every entry when nothing is seen', () => {
    expect(keys(newEntries(feed, []))).toEqual(['id:Apple', 'id:Banana', 'id:Cherry'])
  })

  it('returns the subset that is not seen yet', () => {
    expect(keys(newEntries(feed, ['id:Banana']))).toEqual(['id:Apple', 'id:Cherry'])
  })

  it('returns nothing when everything is seen', () => {
    expect(newEntries(feed, ['id:Apple', 'id:Banana', 'id:Cherry'])).toEqual([])
  })

  it('preserves the original order', () => {
    const reordered = feedOf([c, a, b])
    expect(keys(newEntries(reordered, []))).toEqual(['id:Cherry', 'id:Apple', 'id:Banana'])
  })

  it('dedups by id', () => {
    expect(keys(newEntries(feed, new Set(['id:Apple'])))).toEqual(['id:Banana', 'id:Cherry'])
  })

  it('dedups by link when the id is empty', () => {
    const linkOnly = entry({ title: 'Apple', id: '' })
    const out = newEntries(feedOf([linkOnly, b]), ['https://x.example/Apple'])
    expect(keys(out)).toEqual(['id:Banana'])
  })
})
