import {
  type JournalEncoder,
  type NeurowireEntry,
  type NeurowireFeed,
  createJournalEncoder,
  parseDuration,
} from '@neurowire/core'
import { pollFeed, resolvePollInterval } from '@neurowire/ingest'
import { journalFeedMeta } from './pipeline'

/**
 * `neurowire tail`: a feed as a stream instead of a document.
 *
 * Everything here is pure or injectable, so the loop, the renderers, and the
 * remote SSE client are all testable without a network, a terminal, or a real
 * timer. index.ts owns argv, files, and process I/O and hands them in.
 */

/* -------------------------------------------------------------------------- */
/* Intervals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Parse a poll interval. Core's `parseDuration` covers minutes, hours, and days;
 * tail also accepts seconds, because a live stream is the one place where a
 * sub-minute cadence is a reasonable thing to ask for.
 */
export function parseIntervalMs(value: string): number | undefined {
  const seconds = /^(\d+)\s*s$/.exec(value.trim())
  if (seconds) return Number(seconds[1]) * 1000
  return parseDuration(value)
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

const paint = (color: boolean, code: string, text: string): string =>
  color ? `\x1b[${code}m${text}\x1b[0m` : text

/** Wall-clock `HH:MM:SS` in local time, the arrival stamp on a tail line. */
export function clockTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export interface TailRenderOptions {
  color?: boolean
  /** Arrival time, stamped on the first line. Defaults to now. */
  at?: number
}

/**
 * One entry as it arrives: an arrival stamp and the title, then the source and
 * publication date, then the link. Three short lines that stay readable when a
 * dozen of them land at once.
 */
export function formatTailEntry(entry: NeurowireEntry, options: TailRenderOptions = {}): string {
  const color = options.color ?? false
  const stamp = clockTime(options.at ?? Date.now())
  const indent = ' '.repeat(stamp.length + 2)

  const lines = [`${paint(color, '2', stamp)}  ${paint(color, '1', entry.title)}`]

  const meta: string[] = []
  if (entry.source?.name) meta.push(paint(color, '36', entry.source.name))
  const date = (entry.published ?? entry.updated ?? '').slice(0, 10)
  if (date) meta.push(paint(color, '33', date))
  if (entry.tags?.length) {
    meta.push(paint(color, '35', entry.tags.map((tag) => `#${tag}`).join(' ')))
  }
  if (meta.length) lines.push(`${indent}${meta.join(paint(color, '2', ' · '))}`)

  lines.push(`${indent}${paint(color, '32', entry.link)}`)
  return `${lines.join('\n')}\n`
}

/* -------------------------------------------------------------------------- */
/* Local tail loop                                                             */
/* -------------------------------------------------------------------------- */

export interface TailIo {
  /** Stream output (the entries themselves). */
  out: (text: string) => void
  /** Status output, kept off the stream so `-f nwf` pipes cleanly. */
  err: (text: string) => void
}

export interface TailOptions {
  /**
   * One tick of the local pipeline: load, filter, refine. Returning undefined
   * ends the tail, which is how a bad flag stops the loop without a second
   * error message.
   */
  tick: () => Promise<NeurowireFeed | undefined>
  intervalMs?: number
  jitter?: number
  seen?: Iterable<string>
  signal?: AbortSignal
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
  random?: () => number
  /** Emit raw NWFJ journal lines instead of the pretty view. */
  raw?: boolean
  /** Journal id written into the `J` header of the raw stream. */
  journalId?: string
  color?: boolean
  /**
   * Write a tick's fresh entries in a serialized format instead of the pretty
   * view. Set by `-f atom|json|md|rss`; `-f nwf` uses {@link TailOptions.raw}.
   */
  emit?: (feed: NeurowireFeed) => void
  /** Side effects for a tick's fresh entries: journal appends, sinks. */
  onFresh?: (feed: NeurowireFeed) => Promise<void> | void
  io: TailIo
}

/**
 * The sentinel a tick throws to end the loop after it has already reported why.
 * It is thrown alongside an abort, so the poll engine returns without treating
 * it as a tick failure and without printing a second error.
 */
export const TAIL_STOP = Symbol('tail-stop')

/**
 * Tail a feed until the signal aborts. Each tick prints only entries not seen
 * before, either as pretty terminal lines or as raw NWFJ, and hands the fresh
 * ones to `onFresh` for journaling and sinks.
 */
export async function runTail(options: TailOptions): Promise<void> {
  const controller = new AbortController()
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  const load = async (): Promise<NeurowireFeed> => {
    const feed = await options.tick()
    if (!feed) {
      controller.abort()
      throw TAIL_STOP
    }
    return feed
  }

  let encoder: JournalEncoder | undefined
  const writeRaw = (feed: NeurowireFeed, fresh: NeurowireEntry[]): void => {
    if (!encoder) {
      encoder = createJournalEncoder({ journalId: options.journalId ?? 'tail' })
      options.io.out(encoder.header())
    }
    const meta = journalFeedMeta(feed)
    for (const entry of fresh) options.io.out(encoder.push(entry, meta))
    options.io.out(encoder.checkpoint())
  }

  const ticks = pollFeed(load, {
    intervalMs: options.intervalMs,
    jitter: options.jitter,
    seen: options.seen,
    signal,
    delay: options.delay,
    random: options.random,
    onError: (error) => {
      options.io.err(`[tail] error: ${error instanceof Error ? error.message : String(error)}\n`)
    },
  })

  for await (const { fresh, feed, at } of ticks) {
    if (fresh.length === 0) continue
    if (options.raw) {
      writeRaw(feed, fresh)
    } else if (options.emit) {
      options.emit({ ...feed, entries: fresh })
    } else {
      for (const entry of fresh) {
        options.io.out(formatTailEntry(entry, { color: options.color, at }))
      }
    }
    await options.onFresh?.({ ...feed, entries: fresh })
  }
}

/* -------------------------------------------------------------------------- */
/* Remote tail: an SSE client over plain fetch                                 */
/* -------------------------------------------------------------------------- */

/** One decoded server-sent event. */
export interface SseEvent {
  /** The event name, `message` when the stream did not name one. */
  event: string
  data: string
  id?: string
}

/**
 * An incremental server-sent-events decoder. Feed it whatever arrives from the
 * socket, in whatever chunking, and it hands back the events that completed.
 * Comment lines (`: ping`) are heartbeats and are dropped.
 */
export function createSseParser(): { push: (chunk: string) => SseEvent[] } {
  let buffer = ''
  let event = ''
  let id: string | undefined
  const data: string[] = []

  const reset = (): void => {
    event = ''
    id = undefined
    data.length = 0
  }

  const consume = (line: string, out: SseEvent[]): void => {
    if (line === '') {
      if (data.length > 0 || event !== '') {
        const message: SseEvent = { event: event || 'message', data: data.join('\n') }
        if (id !== undefined) message.id = id
        out.push(message)
      }
      reset()
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') id = value
  }

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk
      const out: SseEvent[] = []
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        consume(line, out)
        index = buffer.indexOf('\n')
      }
      return out
    },
  }
}

/** Base delay for the reconnect backoff, in milliseconds. */
export const SSE_BACKOFF_MS = 1000

/** Upper bound on a reconnect wait, so a long outage does not stall forever. */
export const SSE_MAX_BACKOFF_MS = 30_000

/** Exponential reconnect backoff, capped, with the attempt counted from zero. */
export function sseBackoffMs(attempt: number): number {
  return Math.min(SSE_BACKOFF_MS * 2 ** Math.max(attempt, 0), SSE_MAX_BACKOFF_MS)
}

export interface RemoteTailOptions {
  signal?: AbortSignal
  /** Cursor to resume from, sent as `Last-Event-ID`. */
  lastEventId?: string
  fetchImpl?: typeof fetch
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Stop after this many connection attempts. Unbounded when absent. */
  maxAttempts?: number
  onError?: (error: unknown) => void
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Consume a remote `/tail` SSE stream, reconnecting with exponential backoff and
 * resuming from the last event id seen. Yields every event, so the caller
 * decides what `init`, `entry`, and anything else mean.
 */
export async function* streamRemoteTail(
  url: string,
  options: RemoteTailOptions = {},
): AsyncGenerator<SseEvent> {
  const doFetch = options.fetchImpl ?? fetch
  const delay = options.delay ?? sleep
  let lastEventId = options.lastEventId
  // Two counters on purpose: `connections` bounds the loop for tests, while
  // `backoff` is reset by a delivered event so a healthy stream that drops
  // reconnects promptly instead of inheriting an old wait.
  let connections = 0
  let backoff = 0

  for (;;) {
    if (options.signal?.aborted) return
    if (options.maxAttempts !== undefined && connections >= options.maxAttempts) return
    connections += 1

    try {
      const headers: Record<string, string> = { accept: 'text/event-stream' }
      if (lastEventId !== undefined) headers['last-event-id'] = lastEventId
      const res = await doFetch(url, { headers, signal: options.signal })
      if (!res.ok) {
        // Drain the error body so the connection is not left half-open.
        await res.body?.cancel().catch(() => {})
        throw new Error(`tail source responded ${res.status} ${res.statusText}`)
      }
      if (!res.body) throw new Error('tail source returned no body')

      const parser = createSseParser()
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          for (const message of parser.push(value)) {
            if (message.id !== undefined) lastEventId = message.id
            backoff = 0
            yield message
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
    } catch (error) {
      if (options.signal?.aborted) return
      options.onError?.(error)
    }

    if (options.signal?.aborted) return
    if (options.maxAttempts !== undefined && connections >= options.maxAttempts) return
    const wait = sseBackoffMs(backoff)
    backoff += 1
    await delay(wait, options.signal)
  }
}

export interface RunRemoteTailOptions extends RemoteTailOptions {
  io: TailIo
  color?: boolean
  raw?: boolean
  journalId?: string
  onEntry?: (entry: NeurowireEntry) => Promise<void> | void
}

/**
 * Render a remote `/tail` stream locally: `init` becomes a status line on
 * stderr, every `entry` becomes a tail line (or a raw NWFJ record) on stdout.
 *
 * The remote stream is expected to carry JSON entries (`/tail`'s default), so
 * the local `-f nwf` output is re-encoded here rather than relayed: that keeps
 * one encoder in charge of the sequence numbers and the chain.
 */
export async function runRemoteTail(url: string, options: RunRemoteTailOptions): Promise<void> {
  let encoder: JournalEncoder | undefined

  for await (const message of streamRemoteTail(url, options)) {
    if (message.event === 'init') {
      options.io.err(`[tail] connected to ${url}\n`)
      continue
    }
    if (message.event !== 'entry') continue

    const entry = parseEntryEvent(message.data)
    if (!entry) {
      options.io.err('[tail] skipped an event that is not a JSON entry (use format=json)\n')
      continue
    }

    if (options.raw) {
      if (!encoder) {
        encoder = createJournalEncoder({ journalId: options.journalId ?? 'tail' })
        options.io.out(encoder.header())
      }
      options.io.out(encoder.push(entry))
      options.io.out(encoder.checkpoint())
    } else {
      options.io.out(formatTailEntry(entry, { color: options.color }))
    }
    await options.onEntry?.(entry)
  }
}

/** Decode an `entry` event's JSON payload, ignoring anything malformed. */
export function parseEntryEvent(data: string): NeurowireEntry | undefined {
  try {
    const parsed = JSON.parse(data) as Partial<NeurowireEntry>
    if (typeof parsed.title !== 'string' || typeof parsed.link !== 'string') return undefined
    return { ...parsed, id: parsed.id ?? parsed.link, title: parsed.title, link: parsed.link }
  } catch {
    return undefined
  }
}

/** Resolve the poll interval for tail from the CLI's raw `--interval` value. */
export function tailIntervalMs(
  raw: string | undefined,
): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: resolvePollInterval(undefined) }
  const parsed = parseIntervalMs(raw)
  if (parsed === undefined) {
    return { ok: false, error: `invalid --interval "${raw}" (use e.g. 30s, 15m, 6h, 1d)` }
  }
  return { ok: true, value: resolvePollInterval(parsed) }
}
