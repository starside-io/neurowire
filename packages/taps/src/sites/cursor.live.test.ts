import { fetchFeed } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { cursorBlog } from './cursor'

// Opt-in live test (network). Run with NEUROWIRE_LIVE=1, e.g. `pnpm test:live`.
const live = describe.skipIf(!process.env.NEUROWIRE_LIVE)

live('cursor.com tap (live)', () => {
  it('extracts a healthy list of dated posts from cursor.com/blog', async () => {
    const feed = await fetchFeed('https://cursor.com/blog', { template: cursorBlog })

    expect(feed.entries.length).toBeGreaterThanOrEqual(10)
    for (const entry of feed.entries) {
      expect(entry.title.trim().length).toBeGreaterThan(0)
      expect(entry.link).toMatch(/^https:\/\/cursor\.com\/blog\/.+/)
      expect(entry.link).not.toMatch(/\/blog\/topic\//)
    }

    const dated = feed.entries.filter((entry) => entry.published).length
    expect(dated).toBeGreaterThanOrEqual(Math.ceil(feed.entries.length * 0.8))
  }, 30_000)
})
