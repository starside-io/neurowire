import { timingSafeEqual } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { JOURNAL_MEDIA_TYPE, type JournalCursor, journalHead, parseJournal } from '@neurowire/core'
import { type JournalStore, openJournalStore } from '@neurowire/ingest'
import { type Context, Hono } from 'hono'

/**
 * The server half of `nwf-sync/1`: four read-only routes that let a peer pull
 * journal deltas instead of re-fetching every upstream source itself.
 *
 * Responses hand back whole NWFJ segments exactly as they sit on disk. That is a
 * correctness requirement, not a throughput choice: NWFJ dictionary indices are
 * per segment and the hash chain reseeds at each `J` header, so two segments
 * glued together decode and verify wrongly. One segment per response keeps every
 * body a standalone, independently verifiable document, and keeps the server's
 * work to a file read rather than a decode-and-re-encode that would renumber the
 * dictionaries and break chain continuity with what it actually stores.
 *
 * Full protocol in docs/formats/nwf-sync.md.
 */

/** Protocol version, echoed on every `/sync/*` response. */
export const SYNC_VERSION = 1

/** Header carrying {@link SYNC_VERSION}. */
export const SYNC_VERSION_HEADER = 'NWF-Sync-Version'

/** Journal ids are simple identifiers, same rule as mesh and construct names. */
const ID_PATTERN = /^[\w.-]+$/

/** What a node exposes over `/sync/*`, and the token (if any) that gates it. */
export interface SyncConfig {
  /** Journal ids to publish. The literal `*` publishes every journal in the store. */
  publish: string[]
  /** Static bearer token. When absent the endpoints are open. */
  token?: string
}

/** Where the sync config lives: `$NEUROWIRE_SYNC_CONFIG`, else the config dir. */
function syncConfigPath(): string {
  const fromEnv = (process.env.NEUROWIRE_SYNC_CONFIG ?? '').trim()
  if (fromEnv) return fromEnv
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'neurowire', 'sync.json')
}

/**
 * Read the publish list and token: `~/.config/neurowire/sync.json` first, then
 * the environment on top of it. Nothing is published by default, and a broken
 * config file publishes nothing rather than crashing the service.
 */
export function loadSyncConfig(): SyncConfig {
  const config: SyncConfig = { publish: [] }

  const path = syncConfigPath()
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { publish?: unknown; token?: unknown }
      if (Array.isArray(raw.publish)) {
        config.publish = raw.publish.filter((value): value is string => typeof value === 'string')
      }
      if (typeof raw.token === 'string' && raw.token) config.token = raw.token
    } catch {
      // A corrupt config is never fatal: it just publishes nothing.
    }
  }

  const fromEnv = (process.env.NEUROWIRE_SYNC_PUBLISH ?? '')
    .split(/[:,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (fromEnv.length) config.publish = fromEnv

  const token = (process.env.NEUROWIRE_SYNC_TOKEN ?? '').trim()
  if (token) config.token = token

  return config
}

/**
 * The journal ids this node serves: every explicitly named id, plus every
 * journal on disk when the list contains `*`. An explicitly named id is served
 * even before it holds anything, so publishing can be configured ahead of the
 * first append.
 */
export function publishedJournalIds(config: SyncConfig, store: JournalStore): string[] {
  const ids = new Set(
    config.publish.filter((id) => id !== '*' && ID_PATTERN.test(id) && !id.includes('..')),
  )
  if (config.publish.includes('*')) {
    for (const id of store.list()) ids.add(id)
  }
  return [...ids].sort()
}

/** Is this journal id exposed by the current config? */
export function isPublished(id: string, config: SyncConfig, store: JournalStore): boolean {
  return publishedJournalIds(config, store).includes(id)
}

/** Constant-time bearer token comparison, so a wrong token leaks no timing. */
function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Parse a cursor query value: a sequence number, optionally followed by the
 * chain hash it was taken at (`42` or `42.<hash>`). The hash half is a client
 * concern (clients verify the chain themselves), so the server reads only the
 * sequence number. Returns undefined for anything unparseable.
 */
export function parseSyncCursor(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return 0
  const dot = raw.indexOf('.')
  const head = dot === -1 ? raw : raw.slice(0, dot)
  if (!/^\d+$/.test(head)) return undefined
  const seq = Number(head)
  return Number.isSafeInteger(seq) ? seq : undefined
}

/** Open the journal store for one request, so `$NEUROWIRE_JOURNAL` stays live. */
function journalStore(): JournalStore {
  return openJournalStore()
}

/** How much of a segment to read when looking for a single line near either end. */
const CHUNK_BYTES = 64 * 1024

/** Read `bytes` from one end of a file, clipped to whole lines. */
function readChunk(path: string, bytes: number, from: 'start' | 'end'): string {
  const fd = openSync(path, 'r')
  try {
    // Stat through the fd, so the file cannot be swapped between stat and read.
    const size = fstatSync(fd).size
    const length = Math.min(bytes, size)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, from === 'end' ? size - length : 0)
    const text = buffer.toString('utf8')
    if (length >= size) return text
    if (from === 'end') {
      // The chunk starts mid-line, so the first fragment is not a record.
      const newline = text.indexOf('\n')
      return newline === -1 ? '' : text.slice(newline + 1)
    }
    // The chunk ends mid-line, so the last fragment is not a record.
    const newline = text.lastIndexOf('\n')
    return newline === -1 ? '' : text.slice(0, newline + 1)
  } finally {
    closeSync(fd)
  }
}

/**
 * The head cursor with its chain hash. The store's own `head()` reports only the
 * sequence number (the manifest holds no hashes), and a checkpoint is written on
 * every append, so the answer is always in the tail of the newest segment. When
 * the tail disagrees with the manifest the manifest wins and the hash is dropped.
 */
export function headCursor(store: JournalStore, id: string): JournalCursor {
  const manifest = store.manifest(id)
  const newest = manifest.segments[manifest.segments.length - 1]
  if (!newest) return { seq: 0 }
  const cursor = journalHead(readChunk(join(store.dir, newest.file), CHUNK_BYTES, 'end'))
  return cursor.seq === newest.lastSeq && cursor.hash ? cursor : { seq: newest.lastSeq }
}

/** One published journal's shape in the `/sync/journals` listing. */
export interface SyncJournalInfo {
  id: string
  title?: string
  head: number
  hash?: string
  entries: number
  segments: number
  bytes: number
  updated?: string
}

/**
 * Describe a journal for the listing. Everything but the title comes from the
 * manifest, so it costs no decoding.
 *
 * The title needs an `F` line, which is re-emitted only when identity changes,
 * so it sits at the top of the newest segment in every ordinary journal. Only a
 * bounded prefix is decoded: this endpoint is reachable without a token on an
 * open node, and a whole-segment decode per published journal per request would
 * be a free amplifier. The title is informational, and a listing that omits it
 * is better than one that costs megabytes to produce.
 */
export function describeJournal(store: JournalStore, id: string): SyncJournalInfo {
  const manifest = store.manifest(id)
  const head = headCursor(store, id)
  const info: SyncJournalInfo = {
    id,
    head: head.seq,
    entries: manifest.segments.reduce((sum, segment) => sum + segment.entries, 0),
    segments: manifest.segments.length,
    bytes: manifest.segments.reduce((sum, segment) => sum + segment.bytes, 0),
  }
  if (head.hash) info.hash = head.hash

  const times = manifest.segments
    .map((segment) => segment.maxTime)
    .filter((time): time is number => time !== undefined)
  if (times.length) info.updated = new Date(Math.max(...times) * 1000).toISOString()

  const newest = manifest.segments[manifest.segments.length - 1]
  if (newest) {
    const parsed = parseJournal(readChunk(join(store.dir, newest.file), CHUNK_BYTES, 'start'))
    const title = parsed.records[parsed.records.length - 1]?.feed?.title
    if (title) info.title = title
  }
  return info
}

/** A resolved, published journal, or the error response to send instead. */
type Gate = { ok: true; id: string; store: JournalStore } | { ok: false; res: Response }

/**
 * Validate the `journal` query and check it against the publish list. An
 * unpublished id and a nonexistent one answer the same 404 on purpose: a node's
 * journal list is exactly what it published.
 */
function gate(c: Context): Gate {
  const id = c.req.query('journal')
  if (!id) {
    return { ok: false, res: c.json({ error: 'missing required query parameter: journal' }, 400) }
  }
  if (!ID_PATTERN.test(id) || id.includes('..')) {
    return { ok: false, res: c.json({ error: `invalid journal id "${id}"` }, 400) }
  }
  const store = journalStore()
  if (!isPublished(id, loadSyncConfig(), store)) {
    return { ok: false, res: c.json({ error: `unknown journal "${id}"` }, 404) }
  }
  return { ok: true, id, store }
}

/**
 * Serve the one segment that continues the journal after `cursor`. `clamp` is
 * the difference between the two range endpoints: `since` reports a cursor older
 * than retention as `410`, `snapshot` silently starts from the oldest segment it
 * still has.
 */
function serveSegment(c: Context, clamp: boolean): Response {
  const resolved = gate(c)
  if (!resolved.ok) return resolved.res

  const { id, store } = resolved
  const raw = c.req.query('cursor')
  const cursor = parseSyncCursor(raw)
  if (cursor === undefined) {
    return c.json(
      { error: `invalid cursor "${raw}" (use a sequence number, e.g. 42 or 42.<hash>)` },
      400,
    )
  }

  const manifest = store.manifest(id)
  const head = store.head(id)

  c.header('NWF-Sync-Journal', id)
  c.header('NWF-Sync-Head', String(head.seq))

  if (cursor >= head.seq) {
    c.header('NWF-Sync-Complete', '1')
    return c.body(null, 204)
  }

  // A cursor of 0 is never too old: "I hold nothing" is answered by whatever is
  // still retained, which is the best any node can do after compaction.
  const oldest = manifest.segments[0]
  if (!clamp && cursor > 0 && oldest !== undefined && cursor < oldest.firstSeq - 1) {
    return c.json(
      {
        error: `cursor ${cursor} predates the oldest retained entry (${oldest.firstSeq})`,
        oldest: oldest.firstSeq,
        snapshot: `/sync/snapshot?journal=${encodeURIComponent(id)}`,
      },
      410,
    )
  }

  const segment = manifest.segments.find((candidate) => candidate.lastSeq > cursor)
  // Unreachable: cursor < head means some segment ends past it, but a store
  // mutated mid-request should answer honestly rather than throw.
  if (!segment) {
    c.header('NWF-Sync-Complete', '1')
    return c.body(null, 204)
  }

  c.header('Content-Type', JOURNAL_MEDIA_TYPE)
  c.header('Cache-Control', 'no-store')
  c.header('NWF-Sync-Range', `${segment.firstSeq}-${segment.lastSeq}`)
  c.header('NWF-Sync-Segment', String(segment.index))
  c.header('NWF-Sync-Complete', segment.lastSeq >= head.seq ? '1' : '0')

  // Stream exactly the bytes the manifest described. A live hub appends to its
  // newest segment while serving, so without this clip a request that read the
  // manifest just before an append would send a body ending past the range it
  // declared, and the client would read a benign race as tampering.
  const file = createReadStream(join(store.dir, segment.file), { end: segment.bytes - 1 })
  return c.body(Readable.toWeb(file) as ReadableStream)
}

/** The `/sync/*` routes, mounted by `app.ts`. */
export const sync = new Hono()

// Auth runs before anything else, so an unauthenticated caller cannot use 404 vs
// 200 to enumerate the journals a node holds. The version header goes on every
// response, errors included.
sync.use('*', async (c, next) => {
  const { token } = loadSyncConfig()
  if (token) {
    const header = c.req.header('authorization') ?? ''
    const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!presented || !tokenMatches(token, presented)) {
      c.header(SYNC_VERSION_HEADER, String(SYNC_VERSION))
      c.header('WWW-Authenticate', 'Bearer')
      return c.json({ error: 'missing or invalid bearer token' }, 401)
    }
  }
  await next()
  c.header(SYNC_VERSION_HEADER, String(SYNC_VERSION))
})

sync.get('/journals', (c) => {
  const store = journalStore()
  const journals = publishedJournalIds(loadSyncConfig(), store).map((id) =>
    describeJournal(store, id),
  )
  return c.json({ version: SYNC_VERSION, journals })
})

sync.get('/head', (c) => {
  const resolved = gate(c)
  if (!resolved.ok) return resolved.res
  const head = headCursor(resolved.store, resolved.id)
  const body: { journal: string; head: number; hash?: string } = {
    journal: resolved.id,
    head: head.seq,
  }
  if (head.hash) body.hash = head.hash
  return c.json(body)
})

sync.get('/since', (c) => serveSegment(c, false))

sync.get('/snapshot', (c) => serveSegment(c, true))
