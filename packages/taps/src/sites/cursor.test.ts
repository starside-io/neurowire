import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ingestDocument } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { registerTaps } from '../index'

const fixture = readFileSync(
  fileURLToPath(new URL('../__fixtures__/cursor-blog.html', import.meta.url)),
  'utf8',
)

describe('cursor.com tap', () => {
  it('extracts post links (the card is the link) and excludes topic filters', async () => {
    registerTaps()
    const feed = await ingestDocument({
      url: 'https://cursor.com/blog',
      contentType: 'text/html',
      body: fixture,
    })

    expect(feed.title).toBe('Cursor Blog')
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries.map((e) => e.link)).toEqual([
      'https://cursor.com/blog/third-era',
      'https://cursor.com/blog/teams-pricing',
    ])
    expect(feed.entries[0]?.title).toBe('The third era of AI software development')
    expect(feed.entries[0]?.published).toMatch(/^2026-02/)
    expect(feed.entries.every((e) => !e.link.includes('/blog/topic/'))).toBe(true)
  })
})
