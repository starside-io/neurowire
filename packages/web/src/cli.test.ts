import type { NeurowireFeed } from '@neurowire/core'
import { describe, expect, it } from 'vitest'
import { filterByCutoff, parseDuration, resolveCutoff, startOfUtcToday } from './cli-helpers'

const feedOf = (dates: (string | undefined)[]): NeurowireFeed => ({
  id: 'f',
  title: 'Feed',
  updated: '2026-06-01T00:00:00.000Z',
  entries: dates.map((d, i) => ({
    id: String(i),
    title: `e${i}`,
    link: `https://example.com/${i}`,
    published: d,
  })),
})

describe('parseDuration', () => {
  it('parses minutes, hours, and days', () => {
    expect(parseDuration('90m')).toBe(90 * 60_000)
    expect(parseDuration('24h')).toBe(24 * 3_600_000)
    expect(parseDuration('7d')).toBe(7 * 86_400_000)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseDuration(' 1h ')).toBe(3_600_000)
  })

  it('returns undefined for an unknown unit or shape', () => {
    expect(parseDuration('5w')).toBeUndefined()
    expect(parseDuration('soon')).toBeUndefined()
    expect(parseDuration('')).toBeUndefined()
  })
})

describe('filterByCutoff', () => {
  it('keeps entries at or after the cutoff and drops dateless ones', () => {
    const cutoff = Date.parse('2026-06-05T00:00:00Z')
    const feed = feedOf(['2026-06-09T00:00:00Z', '2026-06-01T00:00:00Z', undefined])
    const out = filterByCutoff(feed, cutoff)
    expect(out.entries.map((e) => e.id)).toEqual(['0'])
  })

  it('falls back to updated when published is absent', () => {
    const cutoff = Date.parse('2026-06-05T00:00:00Z')
    const feed: NeurowireFeed = {
      id: 'f',
      title: 'F',
      updated: '2026-06-01T00:00:00.000Z',
      entries: [{ id: '1', title: 't', link: 'https://x/1', updated: '2026-06-09T00:00:00Z' }],
    }
    expect(filterByCutoff(feed, cutoff).entries).toHaveLength(1)
  })
})

describe('startOfUtcToday', () => {
  it('returns midnight UTC for the given instant', () => {
    const noon = Date.parse('2026-06-10T12:34:56Z')
    expect(startOfUtcToday(noon)).toBe(Date.parse('2026-06-10T00:00:00Z'))
  })
})

describe('resolveCutoff', () => {
  const now = Date.parse('2026-06-10T12:00:00Z')

  it('returns undefined when no window flag is set', () => {
    expect(resolveCutoff({}, now)).toEqual({ ok: true, cutoff: undefined })
  })

  it('resolves --today to midnight UTC', () => {
    expect(resolveCutoff({ today: true }, now)).toEqual({
      ok: true,
      cutoff: Date.parse('2026-06-10T00:00:00Z'),
    })
  })

  it('resolves --since to now minus the window', () => {
    expect(resolveCutoff({ since: '24h' }, now)).toEqual({
      ok: true,
      cutoff: now - 24 * 3_600_000,
    })
  })

  it('prefers --today over --since when both are set', () => {
    const r = resolveCutoff({ today: true, since: '24h' }, now)
    expect(r).toEqual({ ok: true, cutoff: Date.parse('2026-06-10T00:00:00Z') })
  })

  it('reports an error for a malformed --since', () => {
    const r = resolveCutoff({ since: 'nope' }, now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('--since')
  })
})
