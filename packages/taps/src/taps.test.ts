import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ingestDocument } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { loadTaps, registerTaps, registerTapsFrom } from './index'

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
const fixture = (name: string): string => readFileSync(fixturePath(name), 'utf8')

describe('claude.com tap', () => {
  it('extracts dates and categories that auto-detect would miss', async () => {
    registerTaps()
    const feed = await ingestDocument({
      url: 'https://claude.com/blog',
      contentType: 'text/html',
      body: fixture('claude-blog.html'),
    })

    expect(feed.title).toBe('Claude Blog')
    expect(feed.entries).toHaveLength(2)

    const first = feed.entries[0]
    expect(first?.link).toBe('https://claude.com/blog/introducing-dynamic-workflows-in-claude-code')
    expect(first?.published).toMatch(/^2026-05/)
    expect(first?.tags).toEqual(['Product announcements'])
  })
})

describe('user taps', () => {
  it('loads and validates a tap from a JSON file', () => {
    const loaded = loadTaps(fixturePath('custom-tap.json'))
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.host).toBe('example.dev')
  })

  it('registers a user tap so ingest uses it for that host', async () => {
    registerTapsFrom(fixturePath('custom-tap.json'))
    const feed = await ingestDocument({
      url: 'https://example.dev/',
      contentType: 'text/html',
      body: fixture('example-dev.html'),
    })

    expect(feed.title).toBe('Example Dev')
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries[0]?.link).toBe('https://example.dev/p/1')
  })
})
