import type { NeurowireEntry, NeurowireFeed } from './model'

/**
 * Pure, deterministic feed refinement: a time-window filter, a sort, and a
 * limit. These operate on the canonical model and never touch the clock or the
 * network themselves. Callers pass `now` (epoch ms) into `resolveWindow`, which
 * keeps the whole module testable and side-effect free.
 */

export type SortKey = 'date' | 'title' | 'source'
export type SortOrder = 'asc' | 'desc'

export interface SelectOptions {
  /** Keep entries dated at or after this epoch-ms bound (inclusive). */
  from?: number
  /** Keep entries dated at or before this epoch-ms bound (inclusive). */
  to?: number
  sort?: SortKey
  order?: SortOrder
  /** Keep at most this many entries after filtering and sorting. */
  limit?: number
}

const DAY = 86_400_000
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const

/** Parse a duration like "24h", "90m", or "7d" into milliseconds. */
export function parseDuration(value: string): number | undefined {
  const match = /^(\d+)\s*([mhd])$/.exec(value.trim())
  if (!match) return undefined
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS]
}

/** Midnight UTC of the day containing `now`. */
function startOfUtcDay(now: number): number {
  return Math.floor(now / DAY) * DAY
}

/** Midnight UTC of the most recent Monday at or before `now`. */
function startOfUtcWeek(now: number): number {
  const dayNumber = Math.floor(now / DAY)
  // Epoch day 0 (1970-01-01) was a Thursday, so Monday = (dayNumber + 3) % 7 === 0.
  const weekday = ((((dayNumber % 7) + 3) % 7) + 7) % 7
  return (dayNumber - weekday) * DAY
}

export interface WindowSpec {
  /** Within this duration before now, e.g. "24h". */
  since?: string
  /** Drop anything older than this duration, e.g. "7d". Same window as `since`. */
  maxAge?: string
  /** Since midnight UTC today. */
  today?: boolean
  /** Since midnight UTC of the current week (Monday). */
  thisWeek?: boolean
  /** An explicit [start, end] pair of ISO dates (or anything Date.parse reads). */
  between?: [string, string]
}

export interface TimeWindow {
  from?: number
  to?: number
}

/**
 * Turn a high-level window spec into concrete epoch-ms bounds, relative to
 * `now`. Precedence when several are set: between > today > thisWeek > since/maxAge.
 * Unparseable values yield an open-ended bound on that side.
 */
export function resolveWindow(spec: WindowSpec, now: number): TimeWindow {
  if (spec.between) {
    const from = Date.parse(spec.between[0])
    const to = Date.parse(spec.between[1])
    return {
      from: Number.isNaN(from) ? undefined : from,
      to: Number.isNaN(to) ? undefined : to,
    }
  }
  if (spec.today) return { from: startOfUtcDay(now) }
  if (spec.thisWeek) return { from: startOfUtcWeek(now) }
  const duration = spec.since ?? spec.maxAge
  if (duration !== undefined) {
    const ms = parseDuration(duration)
    return ms === undefined ? {} : { from: now - ms }
  }
  return {}
}

/** Published-or-updated date of an entry as epoch ms, or NaN when absent/unparseable. */
function entryTime(entry: NeurowireEntry): number {
  return Date.parse(entry.published ?? entry.updated ?? '')
}

/** Compare two entries by date; undated entries sort as the oldest. */
function compareByTime(a: NeurowireEntry, b: NeurowireEntry): number {
  const ta = entryTime(a)
  const tb = entryTime(b)
  const aMissing = Number.isNaN(ta)
  const bMissing = Number.isNaN(tb)
  if (aMissing && bMissing) return 0
  if (aMissing) return -1
  if (bMissing) return 1
  return ta - tb
}

function compare(key: SortKey, a: NeurowireEntry, b: NeurowireEntry): number {
  if (key === 'title') return a.title.localeCompare(b.title)
  if (key === 'source') {
    return (a.source?.name ?? '').localeCompare(b.source?.name ?? '') || compareByTime(a, b)
  }
  return compareByTime(a, b)
}

/**
 * Apply a date window, an optional sort, and an optional limit to a feed.
 * Date sorts default to newest-first; title and source sorts default to A-Z.
 * Entries without a parseable date are dropped only when a date bound is set.
 */
export function selectEntries(feed: NeurowireFeed, opts: SelectOptions): NeurowireFeed {
  const { from, to, sort, order, limit } = opts
  let entries = feed.entries

  if (from !== undefined || to !== undefined) {
    entries = entries.filter((entry) => {
      const t = entryTime(entry)
      if (Number.isNaN(t)) return false
      if (from !== undefined && t < from) return false
      if (to !== undefined && t > to) return false
      return true
    })
  }

  if (sort) {
    const direction = (order ?? (sort === 'date' ? 'desc' : 'asc')) === 'asc' ? 1 : -1
    entries = [...entries].sort((a, b) => direction * compare(sort, a, b))
  }

  if (limit !== undefined && limit >= 0) {
    entries = entries.slice(0, limit)
  }

  return { ...feed, entries }
}
