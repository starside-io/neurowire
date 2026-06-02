import { fetchFeed } from '@neurowire/ingest'
import { describe, expect, it } from 'vitest'
import { claudeBlog } from './claude'

// Live test: hits the real claude.com/blog to catch a site redesign that breaks
// the tap. Opt-in (network + nondeterministic) so the default suite stays
// offline: run with NEUROWIRE_LIVE=1, e.g. `pnpm test:live`.
// It asserts structural invariants only, never specific posts (those change).
const live = describe.skipIf(!process.env.NEUROWIRE_LIVE)

live('claude.com tap (live)', () => {
  it('extracts a healthy list of dated posts from claude.com/blog', async () => {
    // Force the tap so broken selectors fail here, instead of silently
    // falling back to heuristic auto-detect.
    const feed = await fetchFeed('https://claude.com/blog', { template: claudeBlog })

    expect(feed.entries.length).toBeGreaterThanOrEqual(5)

    for (const entry of feed.entries) {
      expect(entry.title.trim().length).toBeGreaterThan(0)
      expect(entry.link).toMatch(/^https:\/\/claude\.com\/blog\/.+/)
    }

    // The tap's whole job is the dates + categories auto-detect cannot reach,
    // so most posts should carry a parseable date and at least one a category.
    const dated = feed.entries.filter((entry) => entry.published).length
    expect(dated).toBeGreaterThanOrEqual(Math.ceil(feed.entries.length * 0.8))
    expect(feed.entries.some((entry) => entry.tags?.length)).toBe(true)
  }, 30_000)
})
