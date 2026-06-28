import type { NeurowireFeed } from '@neurowire/core'

/** Parse a window like "24h", "90m", or "7d" into milliseconds. */
export function parseDuration(value: string): number | undefined {
  const match = /^(\d+)\s*([mhd])$/.exec(value.trim())
  if (!match) return undefined
  const amount = Number(match[1])
  const unitMs = match[2] === 'm' ? 60_000 : match[2] === 'h' ? 3_600_000 : 86_400_000
  return amount * unitMs
}

/** Keep only entries dated at or after `cutoff` (epoch ms); drop dateless entries. */
export function filterByCutoff(feed: NeurowireFeed, cutoff: number): NeurowireFeed {
  const entries = feed.entries.filter((entry) => {
    const when = Date.parse(entry.published ?? entry.updated ?? '')
    return !Number.isNaN(when) && when >= cutoff
  })
  return { ...feed, entries }
}

/** Midnight UTC at the start of the current day, relative to `now` (epoch ms). */
export function startOfUtcToday(now: number = Date.now()): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Resolve the date-window cutoff (epoch ms) for the web CLI from its flags.
 * Returns the cutoff, undefined when no window flag is set, or an error message
 * when --since is malformed. `now` is injected so the window is testable.
 */
export function resolveCutoff(
  flags: { today?: boolean; since?: string },
  now: number = Date.now(),
): { ok: true; cutoff: number | undefined } | { ok: false; error: string } {
  if (flags.today) return { ok: true, cutoff: startOfUtcToday(now) }
  if (flags.since !== undefined) {
    const windowMs = parseDuration(flags.since)
    if (windowMs === undefined) {
      return { ok: false, error: `invalid --since "${flags.since}" (use e.g. 24h, 36h, 7d)` }
    }
    return { ok: true, cutoff: now - windowMs }
  }
  return { ok: true, cutoff: undefined }
}
