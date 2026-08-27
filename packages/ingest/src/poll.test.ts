import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  type PollTick,
  nextPollDelay,
  pollFeed,
  resolvePollInterval,
} from './poll'

/**
 * The engine never sleeps for real here: `delay` is injected, so a "tick" is
 * just the next turn of the loop and the whole suite runs in microseconds.
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

/** A load function that walks a script of feeds, repeating the last one. */
function scripted(feeds: NeurowireFeed[]): () => Promise<NeurowireFeed> {
  let index = 0
  return async () => feeds[Math.min(index++, feeds.length - 1)] as NeurowireFeed
}

/** Drain `count` ticks from a generator, then stop iterating. */
async function take(source: AsyncGenerator<PollTick>, count: number): Promise<PollTick[]> {
  const ticks: PollTick[] = []
  for await (const tick of source) {
    ticks.push(tick)
    if (ticks.length >= count) break
  }
  return ticks
}

const noDelay = async () => {}

describe('resolvePollInterval', () => {
  it('defaults to five minutes', () => {
    expect(resolvePollInterval()).toBe(DEFAULT_POLL_INTERVAL_MS)
    expect(resolvePollInterval(Number.NaN)).toBe(DEFAULT_POLL_INTERVAL_MS)
  })

  it('clamps anything shorter than the floor', () => {
    expect(resolvePollInterval(1000)).toBe(MIN_POLL_INTERVAL_MS)
    expect(resolvePollInterval(0)).toBe(MIN_POLL_INTERVAL_MS)
  })

  it('keeps an interval at or above the floor', () => {
    expect(resolvePollInterval(900_000)).toBe(900_000)
  })
})

describe('nextPollDelay', () => {
  it('returns the interval unchanged when jitter is off', () => {
    expect(nextPollDelay(60_000, 0, () => 1)).toBe(60_000)
    expect(nextPollDelay(60_000, -1, () => 1)).toBe(60_000)
  })

  it('stays within [interval, interval * (1 + jitter)]', () => {
    for (const roll of [0, 0.25, 0.5, 0.999]) {
      const delay = nextPollDelay(60_000, 0.1, () => roll)
      expect(delay).toBeGreaterThanOrEqual(60_000)
      expect(delay).toBeLessThanOrEqual(66_000)
    }
  })

  it('caps the jitter fraction at one interval', () => {
    expect(nextPollDelay(60_000, 5, () => 1)).toBe(120_000)
  })
})

describe('pollFeed', () => {
  it('yields every entry on the first tick', async () => {
    const ticks = await take(pollFeed(scripted([feedOf(['a', 'b'])]), { delay: noDelay }), 1)
    expect(ticks[0]?.fresh.map((e) => e.id)).toEqual(['a', 'b'])
    expect(ticks[0]?.feed.entries).toHaveLength(2)
    expect(ticks[0]?.at).toBeGreaterThan(0)
  })

  it('yields only what is new on later ticks', async () => {
    const source = pollFeed(scripted([feedOf(['a', 'b']), feedOf(['c', 'a', 'b'])]), {
      delay: noDelay,
    })
    const ticks = await take(source, 3)
    expect(ticks.map((t) => t.fresh.map((e) => e.id))).toEqual([['a', 'b'], ['c'], []])
  })

  it('starts from a resumed seen-set', async () => {
    const source = pollFeed(scripted([feedOf(['a', 'b', 'c'])]), {
      delay: noDelay,
      seen: ['a', 'b'],
    })
    const ticks = await take(source, 1)
    expect(ticks[0]?.fresh.map((e) => e.id)).toEqual(['c'])
  })

  it('survives a tick whose load throws and reports it', async () => {
    let call = 0
    const load = async () => {
      call += 1
      if (call === 1) throw new Error('upstream down')
      return feedOf(['a'])
    }
    const onError = vi.fn()
    const ticks = await take(pollFeed(load, { delay: noDelay, onError }), 1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('upstream down')
    expect(ticks[0]?.fresh.map((e) => e.id)).toEqual(['a'])
  })

  it('tolerates a failing tick with no onError handler', async () => {
    let call = 0
    const load = async () => {
      call += 1
      if (call === 1) throw new Error('boom')
      return feedOf(['a'])
    }
    const ticks = await take(pollFeed(load, { delay: noDelay }), 1)
    expect(ticks[0]?.fresh.map((e) => e.id)).toEqual(['a'])
  })

  it('ends immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const load = vi.fn(async () => feedOf(['a']))
    const ticks = await take(pollFeed(load, { delay: noDelay, signal: controller.signal }), 1)
    expect(ticks).toEqual([])
    expect(load).not.toHaveBeenCalled()
  })

  it('ends cleanly when aborted between ticks', async () => {
    const controller = new AbortController()
    const source = pollFeed(scripted([feedOf(['a']), feedOf(['b', 'a'])]), {
      delay: noDelay,
      signal: controller.signal,
    })
    const ticks: PollTick[] = []
    for await (const tick of source) {
      ticks.push(tick)
      controller.abort()
    }
    expect(ticks).toHaveLength(1)
  })

  it('ends cleanly when aborted during a load', async () => {
    const controller = new AbortController()
    const load = async () => {
      controller.abort()
      throw new Error('aborted mid-flight')
    }
    const onError = vi.fn()
    const ticks = await take(
      pollFeed(load, { delay: noDelay, signal: controller.signal, onError }),
      1,
    )
    expect(ticks).toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })

  it('ends cleanly when the load resolves after an abort', async () => {
    const controller = new AbortController()
    const load = async () => {
      controller.abort()
      return feedOf(['a'])
    }
    const ticks = await take(pollFeed(load, { delay: noDelay, signal: controller.signal }), 1)
    expect(ticks).toEqual([])
  })

  it('waits the clamped interval between ticks', async () => {
    const waits: number[] = []
    const source = pollFeed(scripted([feedOf(['a'])]), {
      intervalMs: 1000,
      jitter: 0,
      delay: async (ms) => {
        waits.push(ms)
      },
    })
    await take(source, 2)
    expect(waits).toEqual([MIN_POLL_INTERVAL_MS])
  })

  it('drives a real timer when no delay is injected', async () => {
    vi.useFakeTimers()
    try {
      const ticks: PollTick[] = []
      const controller = new AbortController()
      const source = pollFeed(scripted([feedOf(['a']), feedOf(['b', 'a'])]), {
        intervalMs: MIN_POLL_INTERVAL_MS,
        jitter: 0,
        signal: controller.signal,
      })
      const run = (async () => {
        for await (const tick of source) {
          ticks.push(tick)
          if (ticks.length === 2) controller.abort()
        }
      })()
      await vi.advanceTimersByTimeAsync(MIN_POLL_INTERVAL_MS + 1)
      await run
      expect(ticks.map((t) => t.fresh.map((e) => e.id))).toEqual([['a'], ['b']])
    } finally {
      vi.useRealTimers()
    }
  })

  it('cuts a real sleep short when the signal aborts', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const ticks: PollTick[] = []
      // Abort while the engine is asleep, not from inside the loop body, so the
      // sleep itself has to notice the signal and resolve early.
      setTimeout(() => controller.abort(), 5)
      const source = pollFeed(scripted([feedOf(['a'])]), {
        intervalMs: 3_600_000,
        jitter: 0,
        signal: controller.signal,
      })
      const run = (async () => {
        for await (const tick of source) ticks.push(tick)
      })()
      await vi.advanceTimersByTimeAsync(10)
      await run
      expect(ticks).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
