import { describe, expect, it } from 'vitest'
import { fetchMesh } from './mesh'

// Opt-in live test (network + nondeterministic). Run with NEUROWIRE_LIVE=1,
// e.g. `pnpm test:live`. Asserts structural invariants only.
const live = describe.skipIf(!process.env.NEUROWIRE_LIVE)

live('mesh (live)', () => {
  it('fetches and merges multiple real sources into one feed', async () => {
    const feed = await fetchMesh({
      name: 'Test Mesh',
      sources: [
        {
          name: 'Claude Code Releases',
          url: 'https://github.com/anthropics/claude-code/releases.atom',
        },
        { name: 'Claude Blog', url: 'https://claude.com/blog' },
      ],
    })

    expect(feed.title).toBe('Test Mesh')
    expect(feed.entries.length).toBeGreaterThanOrEqual(10)

    // Each entry is tagged with the source it came from.
    const sources = new Set(feed.entries.map((entry) => entry.source?.name))
    expect(sources.has('Claude Code Releases')).toBe(true)
    expect(sources.has('Claude Blog')).toBe(true)

    // Entries are sorted newest first.
    const times = feed.entries.map((entry) => {
      const value = entry.updated ?? entry.published
      const ms = value ? Date.parse(value) : 0
      return Number.isNaN(ms) ? 0 : ms
    })
    expect(times).toEqual([...times].sort((a, b) => b - a))
  }, 30_000)
})
