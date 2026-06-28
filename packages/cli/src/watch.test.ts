import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import { describe, expect, it } from 'vitest'
import { partitionNew } from './pipeline'

/**
 * The watch loop in index.ts polls a feed each tick, emits the entries not yet
 * in its seen-set, then records their keys (optionally persisted to a state
 * file). These tests model that per-tick behavior with partitionNew and a plain
 * Set, so the dedup contract is locked without spawning a process or real
 * timers. The fetch is a scripted array of feeds (the injected "clock" is just
 * the tick index).
 */

const entry = (id: string): NeurowireEntry => ({
  id,
  title: id,
  link: `https://example.com/${id}`,
})

const feedOf = (ids: string[]): NeurowireFeed => ({
  id: 'https://example.com/feed',
  title: 'Feed',
  updated: '2026-06-01T00:00:00.000Z',
  entries: ids.map(entry),
})

/** Run `ticks` polls against a scripted fetch, returning what each tick emits. */
function runTicks(feeds: NeurowireFeed[], initialSeen: string[] = []): string[][] {
  const seen = new Set(initialSeen)
  const emitted: string[][] = []
  for (const feed of feeds) {
    const { fresh, keys } = partitionNew(feed, seen)
    emitted.push(fresh.map((e) => e.id))
    for (const key of keys) seen.add(key)
  }
  return emitted
}

describe('watch dedup', () => {
  it('emits every entry on the first poll', () => {
    const emitted = runTicks([feedOf(['a', 'b', 'c'])])
    expect(emitted[0]).toEqual(['a', 'b', 'c'])
  })

  it('emits nothing when the feed is unchanged on the next poll', () => {
    const feed = feedOf(['a', 'b'])
    const emitted = runTicks([feed, feed])
    expect(emitted[0]).toEqual(['a', 'b'])
    expect(emitted[1]).toEqual([])
  })

  it('emits only the newly added entries on a later poll', () => {
    const emitted = runTicks([feedOf(['a', 'b']), feedOf(['c', 'a', 'b']), feedOf(['c', 'a', 'b'])])
    expect(emitted[0]).toEqual(['a', 'b'])
    expect(emitted[1]).toEqual(['c'])
    expect(emitted[2]).toEqual([])
  })

  it('starts from a persisted seen-set so a restart skips known entries', () => {
    // Simulates loading a --state file: ids a and b were already reported.
    const emitted = runTicks([feedOf(['a', 'b', 'c'])], ['a', 'b'])
    expect(emitted[0]).toEqual(['c'])
  })

  it('round-trips the seen-set as JSON like the --state file', () => {
    const seen = new Set<string>()
    const feed = feedOf(['a', 'b'])
    const { keys } = partitionNew(feed, seen)
    for (const key of keys) seen.add(key)

    const serialized = JSON.stringify([...seen])
    const restored = new Set<string>(JSON.parse(serialized) as string[])
    const next = partitionNew(feedOf(['a', 'b', 'c']), restored)
    expect(next.fresh.map((e) => e.id)).toEqual(['c'])
  })
})
