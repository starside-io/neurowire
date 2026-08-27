import { type NeurowireEntry, type NeurowireFeed, entryKey, newEntries } from '@neurowire/core'

/**
 * The polling engine behind every live surface: the CLI's `tail` and `--watch`
 * loops and the API's `/tail` SSE route all consume this one generator, so they
 * cannot drift on cadence, dedupe, or error handling.
 *
 * The engine owns no I/O of its own. It calls a `load` function the caller
 * supplies (a `fetchFeed`, a `fetchMesh`, a whole filter pipeline), diffs the
 * result against a seen-set with core's `entryKey`/`newEntries`, and yields the
 * entries that are new. Sleeping is injectable, which is what keeps the tests
 * instant and the abort path exact.
 */

/** Shortest interval the engine will poll at, however small the caller asks. */
export const MIN_POLL_INTERVAL_MS = 30_000

/** Interval used when the caller does not specify one. */
export const DEFAULT_POLL_INTERVAL_MS = 300_000

/** Fraction of the interval added as random jitter when none is given. */
export const DEFAULT_POLL_JITTER = 0.1

export interface PollOptions {
  /** Base wait between ticks. Clamped up to {@link MIN_POLL_INTERVAL_MS}. */
  intervalMs?: number
  /** 0..1 fraction of the interval added at random, to de-synchronize pollers. */
  jitter?: number
  /** Entry keys already reported, so a restart does not replay them. */
  seen?: Iterable<string>
  /** Ends the generator, both between ticks and during a sleep. */
  signal?: AbortSignal
  /** Called when a tick's `load` throws. The generator survives and waits. */
  onError?: (error: unknown) => void
  /** Sleep between ticks. Injectable so tests never wait on a real timer. */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Source of randomness for the jitter. Injectable for deterministic tests. */
  random?: () => number
}

/** One successful poll: the feed as loaded, plus the entries not seen before. */
export interface PollTick {
  fresh: NeurowireEntry[]
  feed: NeurowireFeed
  /** Epoch milliseconds the tick completed at. */
  at: number
}

/** Clamp a requested interval into the range the engine is willing to poll at. */
export function resolvePollInterval(intervalMs?: number): number {
  if (intervalMs === undefined || !Number.isFinite(intervalMs)) return DEFAULT_POLL_INTERVAL_MS
  return Math.max(MIN_POLL_INTERVAL_MS, intervalMs)
}

/**
 * How long to wait before the next tick: the interval plus up to `jitter` of it.
 * Jitter is only ever added, never subtracted, so the configured interval stays
 * a floor and many tails on one host spread out instead of arriving together.
 */
export function nextPollDelay(intervalMs: number, jitter: number, random: () => number): number {
  const fraction = Math.min(Math.max(jitter, 0), 1)
  if (fraction === 0) return intervalMs
  return Math.round(intervalMs * (1 + fraction * random()))
}

/** Default sleep: a timer that also resolves early when the signal aborts. */
function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Poll a feed forever, yielding one tick per successful load.
 *
 * The first tick runs immediately, so a fresh tail reports what is on the front
 * page right away and only then settles into the interval. Every tick is
 * yielded, including ones with no fresh entries, so callers can report cadence
 * (`[watch] 0 new`) without a second timer.
 *
 * A `load` that throws is isolated to its tick: `onError` sees it, the engine
 * waits, and the next tick tries again. The generator ends only when `signal`
 * aborts or the consumer stops iterating.
 */
export async function* pollFeed(
  load: () => Promise<NeurowireFeed>,
  options: PollOptions = {},
): AsyncGenerator<PollTick> {
  const intervalMs = resolvePollInterval(options.intervalMs)
  const jitter = options.jitter ?? DEFAULT_POLL_JITTER
  const random = options.random ?? Math.random
  const delay = options.delay ?? defaultDelay
  const signal = options.signal
  const seen = new Set(options.seen ?? [])

  for (;;) {
    if (signal?.aborted) return
    try {
      const feed = await load()
      const fresh = newEntries(feed, seen)
      for (const entry of fresh) seen.add(entryKey(entry))
      if (signal?.aborted) return
      yield { fresh, feed, at: Date.now() }
    } catch (error) {
      // An abort during the load is the caller ending the stream, not a failure.
      if (signal?.aborted) return
      options.onError?.(error)
    }
    if (signal?.aborted) return
    await delay(nextPollDelay(intervalMs, jitter, random), signal)
  }
}
