import type { NeurowireEntry, NeurowireFeed } from './model'

/**
 * Pure dedup helpers for watch-style polling. They compute a stable identity per
 * entry and select the entries a caller has not seen yet. No I/O, no clock, no
 * network: the seen-state lives entirely in the calling app layer.
 */

/** Stable identity for dedup: the entry id when present, else its link. */
export function entryKey(entry: NeurowireEntry): string {
  return entry.id || entry.link
}

/**
 * The feed's entries whose {@link entryKey} is not in `seen`, in original order.
 * `seen` is any iterable of keys (an array, a Set, ...); it is read once.
 */
export function newEntries(feed: NeurowireFeed, seen: Iterable<string>): NeurowireEntry[] {
  const known = new Set(seen)
  return feed.entries.filter((entry) => !known.has(entryKey(entry)))
}
