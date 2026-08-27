import {
  type JournalCursor,
  type JournalFeedMeta,
  type NeurowireEntry,
  type NeurowireFeed,
  createJournalEncoder,
  entryKey,
  parseDuration,
} from '@neurowire/core'
import {
  type JournalStore,
  createMemoryCache,
  fetchConstruct,
  fetchFeed,
  fetchMesh,
  flattenConstruct,
  openJournalStore,
  pollFeed,
} from '@neurowire/ingest'
import type { Context } from 'hono'
import { type SSEMessage, streamSSE } from 'hono/streaming'
import { listConstructNames, resolveConstruct } from './constructs'
import { listMeshNames, resolveMesh } from './meshes'

/**
 * `GET /tail`: a feed, mesh, or construct as a server-sent event stream.
 *
 * The route is a thin shell around two pieces: a registry of shared poll loops
 * (one upstream poll per distinct target, however many clients are attached)
 * and an optional journal, which is what turns `Last-Event-ID` into a real
 * resume instead of a best effort.
 */

/** Shortest interval the server will poll a target at, whatever a client asks. */
export const MIN_TAIL_INTERVAL_MS = 60_000

/** Interval used when a client does not ask for one. */
export const DEFAULT_TAIL_INTERVAL_MS = 300_000

/** How often a comment is written to keep buffering proxies from closing the connection. */
export function heartbeatMs(): number {
  const raw = Number(process.env.NEUROWIRE_TAIL_HEARTBEAT_MS ?? 25_000)
  return Number.isFinite(raw) && raw > 0 ? raw : 25_000
}

/** Newest items a late subscriber is caught up with when it joins a running loop. */
const BACKLOG_LIMIT = 50

// The conditional cache rides along with every tail poll, so an unchanged source
// costs a 304 rather than a full body on each tick.
const upstreamCache = createMemoryCache()

/* -------------------------------------------------------------------------- */
/* Targets                                                                     */
/* -------------------------------------------------------------------------- */

/** What a connection is following, and how to load it. */
export interface TailTarget {
  /** Registry key: connections that share it share one poll loop. */
  key: string
  /** Human label for the `init` event. */
  label: string
  load: () => Promise<NeurowireFeed>
}

export type TailTargetResult =
  | { ok: true; target: TailTarget }
  | { ok: false; status: 400 | 404; body: Record<string, unknown> }

/**
 * Resolve `?url=`, `?src=<mesh>`, or `?construct=<name>` into a loadable target,
 * mirroring the /feed, /mesh, and /construct routes. Anything unresolvable is a
 * JSON error, never a stream that fails after the headers are already out.
 */
export function resolveTailTarget(query: {
  url?: string
  src?: string
  construct?: string
}): TailTargetResult {
  if (query.url) {
    const url = query.url
    return {
      ok: true,
      target: {
        key: `url:${url}`,
        label: url,
        load: () => fetchFeed(url, { cache: upstreamCache }),
      },
    }
  }

  if (query.src) {
    const src = query.src
    const mesh = resolveMesh(src)
    if (!mesh) {
      return {
        ok: false,
        status: 404,
        body: { error: `unknown mesh "${src}"`, meshes: listMeshNames() },
      }
    }
    return {
      ok: true,
      target: {
        key: `mesh:${src}`,
        label: mesh.name,
        load: () => fetchMesh(mesh, { cache: upstreamCache }),
      },
    }
  }

  if (query.construct) {
    const name = query.construct
    const construct = resolveConstruct(name)
    if (!construct) {
      return {
        ok: false,
        status: 404,
        body: { error: `unknown construct "${name}"`, constructs: listConstructNames() },
      }
    }
    return {
      ok: true,
      target: {
        key: `construct:${name}`,
        label: construct.name,
        load: async () =>
          flattenConstruct(
            await fetchConstruct(construct, { cache: upstreamCache, resolver: resolveMesh }),
          ),
      },
    }
  }

  return {
    ok: false,
    status: 400,
    body: {
      error: 'missing target: pass one of url, src, or construct',
      meshes: listMeshNames(),
      constructs: listConstructNames(),
    },
  }
}

/**
 * Parse a requested interval: bare digits are seconds (`interval=90`), anything
 * else goes through core's duration parser (`interval=15m`). The result is
 * clamped to {@link MIN_TAIL_INTERVAL_MS} so a client cannot make the server
 * hammer an upstream.
 */
export function resolveTailInterval(raw: string | undefined): number {
  if (!raw) return DEFAULT_TAIL_INTERVAL_MS
  const seconds = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) * 1000 : parseDuration(raw)
  if (seconds === undefined || !Number.isFinite(seconds)) return DEFAULT_TAIL_INTERVAL_MS
  return Math.max(MIN_TAIL_INTERVAL_MS, seconds)
}

/** Parse a cursor from `?since=` or `Last-Event-ID`: `42` or `42.<hash>`. */
export function parseTailCursor(value: string | undefined): JournalCursor | undefined {
  if (!value) return undefined
  const dot = value.indexOf('.')
  const head = dot === -1 ? value : value.slice(0, dot)
  if (!/^\d+$/.test(head)) return undefined
  const cursor: JournalCursor = { seq: Number(head) }
  if (dot !== -1) cursor.hash = value.slice(dot + 1)
  return cursor
}

/** The identity recorded in a journal for the feed being appended. */
function feedMeta(feed: NeurowireFeed): JournalFeedMeta {
  const meta: JournalFeedMeta = { id: feed.id, title: feed.title }
  if (feed.home) meta.home = feed.home
  if (feed.self) meta.self = feed.self
  return meta
}

/* -------------------------------------------------------------------------- */
/* Shared poll loops                                                           */
/* -------------------------------------------------------------------------- */

/** One entry on the wire, with its journal cursor when the target is journaled. */
export interface TailItem {
  entry: NeurowireEntry
  seq?: number
  /**
   * Feed identity in effect for this entry. Carried on the item, not the
   * broadcast, so a client catching up on the backlog encodes exactly what a
   * client that was there at the time encoded.
   */
  meta?: JournalFeedMeta
}

export interface TailBroadcast {
  items: TailItem[]
  feed: NeurowireFeed
  at: number
}

export type TailListener = (broadcast: TailBroadcast) => void

/** A journal a tail loop writes through, so live event ids are real cursors. */
export interface TailJournal {
  store: JournalStore
  id: string
}

export interface TailLoopOptions {
  load: () => Promise<NeurowireFeed>
  intervalMs?: number
  journal?: TailJournal
  onError?: (error: unknown) => void
  /** Injectable sleep, so tests drive the cadence without waiting. */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
  jitter?: number
}

export interface TailSubscription {
  /** Items the loop has already broadcast, so a late joiner is not behind. */
  backlog: TailItem[]
  unsubscribe: () => void
}

interface TailLoop {
  listeners: Set<TailListener>
  backlog: TailItem[]
  stop: () => void
}

const loops = new Map<string, TailLoop>()

/** How many poll loops are running. Exposed so tests can assert cleanup. */
export function tailLoopCount(): number {
  return loops.size
}

/**
 * Turn a tick's fresh entries into wire items.
 *
 * With a journal attached the entries are appended first and carry their
 * journal sequence number, which is what a client later resumes from. Without
 * one the ids come from a counter local to this loop: still monotonic, still
 * usable as SSE event ids, but only a real cursor when journaling is on.
 */
function toItems(
  fresh: NeurowireEntry[],
  feed: NeurowireFeed,
  counter: { value: number },
  journal?: TailJournal,
): TailItem[] {
  const meta = feedMeta(feed)
  const numbered = (entries: NeurowireEntry[]): TailItem[] =>
    entries.map((entry) => {
      counter.value += 1
      return { entry, seq: counter.value, meta }
    })

  if (!journal || fresh.length === 0) return numbered(fresh)

  try {
    const before = journal.store.head(journal.id)
    journal.store.append(journal.id, fresh, meta)
    const added = journal.store.since(journal.id, before)
    const seqByKey = new Map(added.records.map((record) => [entryKey(record.entry), record.seq]))
    return fresh.map((entry) => {
      const seq = seqByKey.get(entryKey(entry))
      // An entry the journal already held has a cursor we cannot name, so it
      // streams without an id rather than with a misleading one.
      if (seq === undefined) return { entry, meta }
      // Keep the counter at or above the journal, so that if a later append
      // fails the fallback ids continue upward instead of restarting at 1.
      counter.value = Math.max(counter.value, seq)
      return { entry, seq, meta }
    })
  } catch {
    // A journal that cannot be written must not take the live stream down.
    return numbered(fresh)
  }
}

/**
 * Entry keys the journal already holds, used to seed a loop's seen-set. A
 * restarted loop would otherwise treat the whole front page as new and
 * re-broadcast entries every reader has already been given.
 */
function journaledKeys(journal?: TailJournal): string[] {
  if (!journal) return []
  try {
    // The manifest carries the keys, so this costs no segment decoding.
    return journal.store.manifest(journal.id).segments.flatMap((segment) => segment.keys)
  } catch {
    return []
  }
}

/** The journal's head sequence number, or 0 when there is no usable journal. */
function journalHeadSeq(journal?: TailJournal): number {
  if (!journal) return 0
  try {
    return journal.store.head(journal.id).seq
  } catch {
    return 0
  }
}

/**
 * Attach to the poll loop for `key`, starting it if this is the first listener.
 * The loop stops as soon as the last listener leaves, so an idle server holds no
 * timers and no upstream traffic.
 */
export function subscribeTail(
  key: string,
  options: TailLoopOptions,
  listener: TailListener,
): TailSubscription {
  let loop = loops.get(key)

  if (!loop) {
    const controller = new AbortController()
    const started: TailLoop = {
      listeners: new Set(),
      backlog: [],
      stop: () => controller.abort(),
    }
    loops.set(key, started)
    loop = started

    void (async () => {
      // Start where the journal left off, so ids stay monotonic across restarts.
      const counter = { value: journalHeadSeq(options.journal) }
      try {
        const ticks = pollFeed(options.load, {
          intervalMs: options.intervalMs,
          jitter: options.jitter,
          seen: journaledKeys(options.journal),
          signal: controller.signal,
          delay: options.delay,
          onError: options.onError,
        })
        for await (const tick of ticks) {
          const items = toItems(tick.fresh, tick.feed, counter, options.journal)
          if (items.length === 0) continue
          started.backlog.push(...items)
          if (started.backlog.length > BACKLOG_LIMIT) {
            started.backlog.splice(0, started.backlog.length - BACKLOG_LIMIT)
          }
          const broadcast: TailBroadcast = { items, feed: tick.feed, at: tick.at }
          for (const each of [...started.listeners]) each(broadcast)
        }
      } finally {
        // Only clear the registry slot if it is still ours: a later subscriber
        // may already have started a fresh loop under the same key.
        if (loops.get(key) === started) loops.delete(key)
      }
    })()
  }

  const attached = loop
  attached.listeners.add(listener)

  return {
    backlog: [...attached.backlog],
    unsubscribe: () => {
      attached.listeners.delete(listener)
      if (attached.listeners.size === 0) {
        if (loops.get(key) === attached) loops.delete(key)
        attached.stop()
      }
    },
  }
}

/** Stop every running loop. For tests and shutdown, never on a request path. */
export function stopAllTails(): void {
  for (const loop of [...loops.values()]) {
    loop.listeners.clear()
    loop.stop()
  }
  loops.clear()
}

/* -------------------------------------------------------------------------- */
/* Route                                                                       */
/* -------------------------------------------------------------------------- */

/** Open the journal store the route replays from and writes through. */
function tailStore(): JournalStore {
  return openJournalStore({})
}

/**
 * Resolve `?journal=<id>` to a journal the operator has actually created. An
 * unknown id is not an error: the tail runs live-only, and the `init` event says
 * so. This is also why the route can never create a journal of its own.
 */
export function resolveTailJournal(id: string | undefined): TailJournal | undefined {
  if (!id) return undefined
  try {
    const store = tailStore()
    return store.list().includes(id) ? { store, id } : undefined
  } catch {
    return undefined
  }
}

/**
 * Build the `entry` encoder for one connection. In `nwf` the events carry
 * journal lines, and the very first one is prefixed with the `J` header so the
 * stream as a whole is a valid NWFJ document rather than a headerless tail.
 *
 * `startSeq` is where this connection's records are numbered from. Against a
 * journal that is the cursor the client resumed at, so the `E` line's sequence
 * number and the SSE event id are the same number rather than two counts of the
 * same entries.
 */
function createEntryEncoder(
  format: 'json' | 'nwf',
  journalId: string,
  startSeq = 0,
): (item: TailItem) => SSEMessage {
  const encoder = createJournalEncoder({ journalId, startSeq })
  let headerSent = false

  return (item) => {
    let data: string
    if (format === 'nwf') {
      const head = headerSent ? '' : encoder.header()
      headerSent = true
      data = `${head}${encoder.push(item.entry, item.meta)}`.trimEnd()
    } else {
      data = JSON.stringify(item.entry)
    }
    const message: SSEMessage = { event: 'entry', data }
    if (item.seq !== undefined) message.id = String(item.seq)
    return message
  }
}

/**
 * The `GET /tail` handler. Errors are decided before the stream opens, so a bad
 * target is a plain JSON 400 or 404 rather than a stream that dies on its first
 * event.
 */
export function tailHandler(c: Context): Response {
  const resolved = resolveTailTarget({
    url: c.req.query('url'),
    src: c.req.query('src'),
    construct: c.req.query('construct'),
  })
  if (!resolved.ok) return c.json(resolved.body, resolved.status)

  const format = c.req.query('format') ?? 'json'
  if (format !== 'json' && format !== 'nwf') {
    return c.json({ error: `unknown tail format "${format}"`, formats: ['json', 'nwf'] }, 400)
  }

  const intervalMs = resolveTailInterval(c.req.query('interval'))
  const journal = resolveTailJournal(c.req.query('journal'))
  const cursor = parseTailCursor(c.req.header('Last-Event-ID') ?? c.req.query('since'))
  const target = resolved.target

  // Buffering proxies would otherwise hold events until the response ends.
  c.header('X-Accel-Buffering', 'no')

  // The loop key carries the journal and the interval, not just the target: two
  // clients asking for different cadences (or one journaled and one not) must
  // not silently ride the same loop and be told they got what they asked for.
  const loopKey = `${target.key}|${intervalMs}|${journal?.id ?? ''}`

  return streamSSE(c, async (stream) => {
    const replayFrom = journal && cursor ? cursor.seq : journalHeadSeq(journal)
    const encodeEntry = createEntryEncoder(format, journal?.id ?? 'tail', replayFrom)
    const sent = new Set<string>()
    const queue: SSEMessage[] = []
    let alive = true
    let wake: (() => void) | undefined

    const push = (message: SSEMessage): void => {
      queue.push(message)
      wake?.()
    }

    stream.onAbort(() => {
      alive = false
      wake?.()
    })

    const replay = journal && cursor ? journal.store.since(journal.id, cursor) : undefined

    await stream.writeSSE({
      event: 'init',
      data: JSON.stringify({
        target: target.label,
        title: target.label,
        format,
        intervalMs,
        resume: journal ? 'journal' : 'live',
        journal: journal?.id,
        head: journal ? journal.store.head(journal.id).seq : undefined,
        replayed: replay?.records.length ?? 0,
        incomplete: replay?.tooOld ?? false,
      }),
    })

    for (const record of replay?.records ?? []) {
      sent.add(entryKey(record.entry))
      await stream.writeSSE(
        encodeEntry({ entry: record.entry, seq: record.seq, meta: record.feed }),
      )
    }

    const subscription = subscribeTail(
      loopKey,
      { load: target.load, intervalMs, journal },
      (broadcast) => {
        for (const item of broadcast.items) {
          const key = entryKey(item.entry)
          if (sent.has(key)) continue
          sent.add(key)
          push(encodeEntry(item))
        }
      },
    )

    // Catch a late joiner up with what the shared loop already broadcast.
    for (const item of subscription.backlog) {
      const key = entryKey(item.entry)
      if (sent.has(key)) continue
      sent.add(key)
      push(encodeEntry(item))
    }

    try {
      const beat = heartbeatMs()
      while (alive && !stream.aborted && !stream.closed) {
        while (queue.length > 0 && alive) {
          const message = queue.shift()
          if (message) await stream.writeSSE(message)
        }
        if (!alive || stream.aborted || stream.closed) break
        const woken = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            wake = undefined
            resolve(false)
          }, beat)
          wake = () => {
            clearTimeout(timer)
            wake = undefined
            resolve(true)
          }
        })
        if (!woken && alive && !stream.aborted) await stream.write(': ping\n\n')
      }
    } finally {
      subscription.unsubscribe()
    }
  })
}
