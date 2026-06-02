import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFeedString } from './feed'

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), 'utf8')

const ctx = { sourceUrl: 'https://blog.example.com/' }

describe('parseFeedString', () => {
  it('parses an Atom feed', () => {
    const feed = parseFeedString(fixture('atom.xml'), ctx)
    expect(feed.title).toBe('Example Atom Blog')
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries[0].link).toBe('https://blog.example.com/posts/atom-one')
    expect(feed.entries[0].tags).toContain('typescript')
    expect(feed.entries[0].published).toBe('2024-03-09T08:30:00.000Z')
  })

  it('parses an RSS feed (RFC 822 dates, dc:creator)', () => {
    const feed = parseFeedString(fixture('rss.xml'), ctx)
    expect(feed.title).toBe('Example RSS Blog')
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries[0].authors?.[0]?.name).toBe('Ada Lovelace')
    expect(feed.entries[0].published).toBe('2024-03-09T08:30:00.000Z')
    expect(feed.entries[1].summary).toBe('The second rss post body.')
  })

  it('parses a JSON Feed', () => {
    const feed = parseFeedString(fixture('jsonfeed.json'), ctx)
    expect(feed.title).toBe('Example JSON Feed')
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries[1].link).toBe('https://blog.example.com/posts/json-two')
    expect(feed.entries[0].tags).toEqual(['typescript', 'feeds'])
  })
})
