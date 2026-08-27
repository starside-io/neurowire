import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import { openJournalStore } from '@neurowire/ingest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TAIL_INTERVAL_MS,
  MIN_TAIL_INTERVAL_MS,
  type TailBroadcast,
  heartbeatMs,
  parseTailCursor,
  resolveTailInterval,
  resolveTailJournal,
  resolveTailTarget,
  stopAllTails,
  subscribeTail,
  tailLoopCount,
} from './tail'

/**
 * The registry is tested directly rather than through HTTP: the sleep between
 * ticks is injected, so a "tick" is whatever the test releases, and nothing
 * here waits on a real minute.
 */

const entry = (id: string): NeurowireEntry => ({
  id,
  title: `Title ${id}`,
  link: `https://example.com/${id}`,
})

const feedOf = (ids: string[]): NeurowireFeed => ({
  id: 'https://example.com/feed',
  title: 'Example',
  updated: '2026-06-01T00:00:00.000Z',
  entries: ids.map(entry),
})

/** Let pending promises and timers settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** A sleep the test releases by hand, so the loop ticks exactly when asked. */
function pacer() {
  const waiters: (() => void)[] = []
  return {
    delay: (): Promise<void> => new Promise<void>((resolve) => waiters.push(resolve)),
    async tick(): Promise<void> {
      await settle()
      waiters.shift()?.()
      await settle()
    },
  }
}

const keys = new Set<string>()
const uniqueKey = (): string => {
  const key = `test:${Math.random().toString(36).slice(2)}`
  keys.add(key)
  return key
}

afterEach(() => {
  stopAllTails()
  vi.unstubAllEnvs()
  keys.clear()
})

describe('resolveTailInterval', () => {
  it('defaults when absent or unparseable', () => {
    expect(resolveTailInterval(undefined)).toBe(DEFAULT_TAIL_INTERVAL_MS)
    expect(resolveTailInterval('soon')).toBe(DEFAULT_TAIL_INTERVAL_MS)
  })

  it('reads bare digits as seconds', () => {
    expect(resolveTailInterval('900')).toBe(900_000)
  })

  it('reads a duration string', () => {
    expect(resolveTailInterval('15m')).toBe(900_000)
  })

  it('clamps below the server floor', () => {
    expect(resolveTailInterval('1')).toBe(MIN_TAIL_INTERVAL_MS)
  })
})

describe('parseTailCursor', () => {
  it('parses a sequence number, with or without a chain hash', () => {
    expect(parseTailCursor('42')).toEqual({ seq: 42 })
    expect(parseTailCursor('42.abcd')).toEqual({ seq: 42, hash: 'abcd' })
  })

  it('rejects anything that is not a sequence number', () => {
    expect(parseTailCursor(undefined)).toBeUndefined()
    expect(parseTailCursor('')).toBeUndefined()
    expect(parseTailCursor('head')).toBeUndefined()
  })
})

describe('heartbeatMs', () => {
  it('defaults to 25 seconds and honors the override', () => {
    expect(heartbeatMs()).toBe(25_000)
    vi.stubEnv('NEUROWIRE_TAIL_HEARTBEAT_MS', '50')
    expect(heartbeatMs()).toBe(50)
    vi.stubEnv('NEUROWIRE_TAIL_HEARTBEAT_MS', 'nope')
    expect(heartbeatMs()).toBe(25_000)
  })
})

describe('resolveTailTarget', () => {
  it('resolves a url', () => {
    const result = resolveTailTarget({ url: 'https://example.com/feed.xml' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target.key).toBe('url:https://example.com/feed.xml')
  })

  it('resolves a bundled mesh by name', () => {
    const result = resolveTailTarget({ src: 'ai-news' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target.key).toBe('mesh:ai-news')
  })

  it('resolves a bundled construct by name', () => {
    const result = resolveTailTarget({ construct: 'daily' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target.key).toBe('construct:daily')
  })

  it('404s an unknown mesh or construct', () => {
    const mesh = resolveTailTarget({ src: 'nope' })
    expect(mesh.ok).toBe(false)
    if (!mesh.ok) expect(mesh.status).toBe(404)
    const construct = resolveTailTarget({ construct: 'nope' })
    expect(construct.ok).toBe(false)
    if (!construct.ok) expect(construct.status).toBe(404)
  })

  it('400s when no target is given', () => {
    const result = resolveTailTarget({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.body.error).toContain('missing target')
    }
  })
})

describe('subscribeTail', () => {
  it('polls once per tick however many listeners are attached', async () => {
    const clock = pacer()
    const load = vi.fn(async () => feedOf(['a']))
    const key = uniqueKey()

    const seenA: TailBroadcast[] = []
    const first = subscribeTail(key, { load, delay: clock.delay }, (b) => seenA.push(b))
    await settle()
    expect(load).toHaveBeenCalledTimes(1)

    const seenB: TailBroadcast[] = []
    const second = subscribeTail(key, { load, delay: clock.delay }, (b) => seenB.push(b))
    expect(load).toHaveBeenCalledTimes(1)
    expect(tailLoopCount()).toBe(1)

    // The late joiner is handed what the shared loop already broadcast.
    expect(second.backlog.map((item) => item.entry.id)).toEqual(['a'])
    expect(seenA.flatMap((b) => b.items.map((i) => i.entry.id))).toEqual(['a'])

    first.unsubscribe()
    second.unsubscribe()
    await settle()
    expect(tailLoopCount()).toBe(0)
  })

  it('broadcasts only fresh entries on later ticks', async () => {
    const clock = pacer()
    const feeds = [feedOf(['a']), feedOf(['b', 'a']), feedOf(['b', 'a'])]
    let index = 0
    const load = async () => feeds[Math.min(index++, feeds.length - 1)] as NeurowireFeed

    const seen: string[][] = []
    const sub = subscribeTail(uniqueKey(), { load, delay: clock.delay }, (b) =>
      seen.push(b.items.map((i) => i.entry.id)),
    )
    await settle()
    await clock.tick()
    await clock.tick()
    sub.unsubscribe()
    // A tick with nothing new is not broadcast at all.
    expect(seen).toEqual([['a'], ['b']])
  })

  it('stops the loop when the last listener leaves', async () => {
    const clock = pacer()
    const load = vi.fn(async () => feedOf(['a']))
    const sub = subscribeTail(uniqueKey(), { load, delay: clock.delay }, () => {})
    await settle()
    sub.unsubscribe()
    await clock.tick()
    await clock.tick()
    expect(load).toHaveBeenCalledTimes(1)
    expect(tailLoopCount()).toBe(0)
  })

  it('starts a fresh loop after the previous one stopped', async () => {
    const clock = pacer()
    const key = uniqueKey()
    const load = vi.fn(async () => feedOf(['a']))
    subscribeTail(key, { load, delay: clock.delay }, () => {}).unsubscribe()
    await settle()
    const sub = subscribeTail(key, { load, delay: clock.delay }, () => {})
    await settle()
    expect(tailLoopCount()).toBe(1)
    expect(load).toHaveBeenCalledTimes(2)
    sub.unsubscribe()
  })

  it('reports a failing poll and keeps the loop alive', async () => {
    const clock = pacer()
    const onError = vi.fn()
    let call = 0
    const load = async () => {
      call += 1
      if (call === 1) throw new Error('upstream down')
      return feedOf(['a'])
    }
    const seen: string[][] = []
    const sub = subscribeTail(uniqueKey(), { load, delay: clock.delay, onError }, (b) =>
      seen.push(b.items.map((i) => i.entry.id)),
    )
    await settle()
    await clock.tick()
    sub.unsubscribe()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([['a']])
  })

  it('numbers items with journal sequence numbers when a journal is attached', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-'))
    try {
      const store = openJournalStore({ dir })
      store.append('live', [entry('seed')])
      const clock = pacer()
      const seen: TailBroadcast[] = []
      const sub = subscribeTail(
        uniqueKey(),
        {
          load: async () => feedOf(['a', 'b']),
          delay: clock.delay,
          journal: { store, id: 'live' },
        },
        (b) => seen.push(b),
      )
      await settle()
      sub.unsubscribe()
      expect(seen[0]?.items.map((item) => item.seq)).toEqual([2, 3])
      expect(store.head('live').seq).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps streaming when the journal cannot be written', async () => {
    const store = openJournalStore({ dir: join(tmpdir(), 'nw-tail-missing') })
    const clock = pacer()
    const seen: TailBroadcast[] = []
    const sub = subscribeTail(
      uniqueKey(),
      // An invalid id makes every store call throw, which must not be fatal.
      { load: async () => feedOf(['a']), delay: clock.delay, journal: { store, id: '../escape' } },
      (b) => seen.push(b),
    )
    await settle()
    sub.unsubscribe()
    expect(seen[0]?.items.map((item) => item.entry.id)).toEqual(['a'])
    // Ids fall back to the loop-local counter when the journal is unusable.
    expect(seen[0]?.items[0]?.seq).toBe(1)
  })

  it('does not re-broadcast entries the journal already holds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-'))
    try {
      const store = openJournalStore({ dir })
      store.append('warm', [entry('a'), entry('b')])
      const clock = pacer()
      const seen: TailBroadcast[] = []
      const sub = subscribeTail(
        uniqueKey(),
        {
          // The front page still carries a and b, which the journal already has.
          load: async () => feedOf(['c', 'b', 'a']),
          delay: clock.delay,
          journal: { store, id: 'warm' },
        },
        (b) => seen.push(b),
      )
      await settle()
      sub.unsubscribe()
      expect(seen[0]?.items.map((item) => item.entry.id)).toEqual(['c'])
      expect(seen[0]?.items[0]?.seq).toBe(3)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('carries the feed identity on every item, backlog included', async () => {
    const clock = pacer()
    const first = subscribeTail(
      'meta-key',
      { load: async () => feedOf(['a']), delay: clock.delay },
      () => {},
    )
    await settle()
    const second = subscribeTail(
      'meta-key',
      { load: async () => feedOf(['a']), delay: clock.delay },
      () => {},
    )
    expect(second.backlog[0]?.meta).toEqual({ id: 'https://example.com/feed', title: 'Example' })
    first.unsubscribe()
    second.unsubscribe()
  })
})

describe('resolveTailJournal', () => {
  it('is undefined without an id', () => {
    expect(resolveTailJournal(undefined)).toBeUndefined()
  })

  it('is undefined for a journal that does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-'))
    vi.stubEnv('NEUROWIRE_JOURNAL', dir)
    try {
      expect(resolveTailJournal('absent')).toBeUndefined()
      expect(resolveTailJournal('../escape')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves a journal the operator has created', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nw-tail-'))
    vi.stubEnv('NEUROWIRE_JOURNAL', dir)
    try {
      openJournalStore({ dir }).append('present', [entry('a')])
      expect(resolveTailJournal('present')?.id).toBe('present')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
