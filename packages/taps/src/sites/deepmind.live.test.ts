import { fetchFeed } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { deepmindBlog } from './deepmind'

// Opt-in live test (network). Run with NEUROWIRE_LIVE=1, e.g. `pnpm test:live`.
const live = describe.skipIf(!process.env.NEUROWIRE_LIVE)

live('deepmind.google tap (live)', () => {
  it('extracts a healthy list of dated posts from the DeepMind blog', async () => {
    const feed = await fetchFeed('https://deepmind.google/discover/blog/', {
      template: deepmindBlog,
    })

    expect(feed.entries.length).toBeGreaterThanOrEqual(10)
    for (const entry of feed.entries) {
      expect(entry.title.trim().length).toBeGreaterThan(0)
      expect(entry.link).toMatch(/^https?:\/\/.+/)
    }

    const dated = feed.entries.filter((entry) => entry.published).length
    expect(dated).toBeGreaterThanOrEqual(Math.ceil(feed.entries.length * 0.8))
  }, 30_000)
})
