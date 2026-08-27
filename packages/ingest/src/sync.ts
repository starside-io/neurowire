import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  JOURNAL_MEDIA_TYPE,
  type JournalCursor,
  type JournalFeedMeta,
  type JournalRecord,
  type NeurowireEntry,
  parseJournal,
  verifyJournal,
} from '@neurowire/core'
import type { JournalStore } from './journal-store'

/**
 * The client half of `nwf-sync/1`: pull journal deltas from peers you chose to
 * trust, verify the hash chain of every response before merging it, and append
 * the entries to the local journal store.
 *
 * Sequence numbers are per journal on one node, never global: when this node
 * appends entries pulled from a peer, its own store assigns its own numbering
 * and computes its own chain. So the local head means nothing to the protocol.
 * What matters is the peer's cursor, recorded per `(peer url, journal id)` and
 * written only after the append succeeded. A crash between the two costs one
 * re-pull, which the store's entry-key dedupe absorbs; the reverse order would
 * silently lose entries.
 *
 * Full protocol in docs/formats/nwf-sync.md.
 */

/** A peer to pull from. `journals` limits the pull; omit it to sync everything published. */
export interface Peer {
  url: string
  token?: string
  journals?: string[]
}

/** A sync failure, carrying the peer (and journal, when known) that produced it. */
export class SyncError extends Error {
  readonly peer: string
  readonly journal?: string
  constructor(message: string, peer: string, journal?: string) {
    super(message)
    this.name = 'SyncError'
    this.peer = peer
    if (journal !== undefined) this.journal = journal
  }
}

/** Where a client left off in each peer's journal, keyed by `(peer, journal)`. */
export interface PeerStateStore {
  get(peer: string, journal: string): JournalCursor | undefined
  set(peer: string, journal: string, cursor: JournalCursor): void
  /** Every recorded position, keyed `"<peer>\t<journal>"`. */
  entries(): Record<string, JournalCursor>
}

export interface PullResult {
  peer: string
  journal: string
  /** Entries actually written to the local store. */
  added: number
  /** Entries the local store already held. */
  skipped: number
  /** The peer cursor now recorded, in the peer's numbering. */
  head: JournalCursor
  /** The head the peer reported when the pull started. */
  remoteHead: number
  /** HTTP requests made, including the head poll. */
  requests: number
  /** Response bytes received. */
  bytes: number
  /** True when a too-old cursor forced a snapshot bootstrap. */
  bootstrapped: boolean
  /** True when the peer's journal diverged from the recorded cursor, so it restarted. */
  reset: boolean
}

export interface PullOptions {
  /** Where peer cursors live. Defaults to the file at {@link peerStatePath}. */
  state?: PeerStateStore
  /** Injectable fetch, so tests never touch the network. */
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  /** Per-request deadline in milliseconds. Default 15000. Set 0 to disable. */
  timeoutMs?: number
  /** Max additional attempts after the first. Default 2. */
  retries?: number
  /** Base delay in milliseconds for exponential backoff with jitter. Default 500. */
  backoffMs?: number
  /** Sleep used between retries, injectable so tests need no real waits. */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Safety valve on how many segments one pull may transfer. Default 500. */
  maxSegments?: number
  /**
   * Counters incremented per request. Pass one in to learn what a pull cost even
   * when it throws partway through.
   */
  stats?: SyncStats
}

/** Mutable request and byte counters, so cost survives a thrown pull. */
export interface SyncStats {
  requests: number
  bytes: number
}

/** The `nwf-sync` version this client implements. */
export const SYNC_VERSION = 1

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_RETRIES = 2
const DEFAULT_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 30000
const DEFAULT_MAX_SEGMENTS = 500

/* -------------------------------------------------------------------------- */
/* Peer state                                                                  */
/* -------------------------------------------------------------------------- */

const STATE_VERSION = 1

const stateKey = (peer: string, journal: string): string => `${peer}\t${journal}`

/** Where peer cursors live: `$NEUROWIRE_PEERS_STATE`, else the config directory. */
export function peerStatePath(): string {
  const fromEnv = (process.env.NEUROWIRE_PEERS_STATE ?? '').trim()
  if (fromEnv) return fromEnv
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'neurowire', 'peers-state.json')
}

/** An in-memory {@link PeerStateStore}, for tests and one-shot pulls. */
export function createMemoryPeerState(initial: Record<string, JournalCursor> = {}): PeerStateStore {
  const positions = new Map(Object.entries(initial))
  return {
    get: (peer, journal) => positions.get(stateKey(peer, journal)),
    set: (peer, journal, cursor) => {
      positions.set(stateKey(peer, journal), cursor)
    },
    entries: () => Object.fromEntries(positions),
  }
}

/**
 * A file-backed {@link PeerStateStore}. The file is read once when opened and
 * rewritten on every `set`, which is safe at this size (one small object per
 * peer and journal) and keeps the cursor durable across a crash mid-sync.
 */
export function openPeerState(path: string = peerStatePath()): PeerStateStore {
  let positions: Record<string, JournalCursor> = {}
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { peers?: Record<string, unknown> }
      for (const [key, value] of Object.entries(raw.peers ?? {})) {
        const cursor = value as JournalCursor
        if (cursor && Number.isInteger(cursor.seq)) positions[key] = cursor
      }
    } catch {
      // A corrupt state file means "start from the beginning", never a crash:
      // re-pulling is idempotent, so the cost is bandwidth, not correctness.
      positions = {}
    }
  }

  const write = (): void => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(
      path,
      `${JSON.stringify({ version: STATE_VERSION, peers: positions }, null, 2)}\n`,
    )
  }

  return {
    get: (peer, journal) => positions[stateKey(peer, journal)],
    set: (peer, journal, cursor) => {
      positions[stateKey(peer, journal)] = cursor
      write()
    },
    entries: () => ({ ...positions }),
  }
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

interface SyncResponse {
  status: number
  headers: Headers
  body: string
  bytes: number
}

/** Build a `/sync/<name>` URL against a peer's base URL. */
export function syncEndpoint(
  base: string,
  name: string,
  params: Record<string, string> = {},
): string {
  const root = base.endsWith('/') ? base : `${base}/`
  const url = new URL(`sync/${name}`, root)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

/** Default sleep: a setTimeout that also resolves early if the signal aborts. */
function defaultDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Full-jitter exponential backoff, capped at {@link MAX_BACKOFF_MS}. */
function backoffDelay(base: number, attempt: number): number {
  return Math.min(base * 2 ** attempt * (0.5 + Math.random() / 2), MAX_BACKOFF_MS)
}

/** True for errors a fresh attempt might recover from (network blips, timeouts). */
function isRetryable(error: unknown): boolean {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true
  }
  return error instanceof TypeError
}

/**
 * One attempt: fetch and read the body inside the timeout, so a peer that
 * accepts the connection and then stalls mid-body still trips the deadline.
 *
 * `fetchDocument` is not reused here on purpose. It is feed-shaped: it hides the
 * status code and the response headers, and this protocol carries its answer in
 * both (`204`, `410`, `NWF-Sync-Complete`, `NWF-Sync-Head`).
 */
async function attemptRequest(
  url: string,
  peer: Peer,
  options: PullOptions,
): Promise<SyncResponse> {
  const headers: Record<string, string> = {
    accept: `${JOURNAL_MEDIA_TYPE}, application/json;q=0.9`,
  }
  if (peer.token) headers.authorization = `Bearer ${peer.token}`

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer =
    timeoutMs > 0
      ? setTimeout(
          () => controller.abort(new DOMException('nwf-sync request timed out', 'TimeoutError')),
          timeoutMs,
        )
      : undefined
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  try {
    const impl = options.fetch ?? globalThis.fetch
    const res = await impl(url, { headers, signal, redirect: 'follow' })
    const body = res.status === 204 ? '' : await res.text()
    return { status: res.status, headers: res.headers, body, bytes: Buffer.byteLength(body) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Reject a body from a protocol version this client does not implement. An
 * absent header is tolerated (a proxy may have stripped it, and every other
 * check still applies); a header naming another version is not, because v2 is
 * free to change what a segment or a cursor means.
 */
function assertVersion(peer: Peer, journal: string | undefined, res: SyncResponse): void {
  const version = res.headers.get('NWF-Sync-Version')
  if (version !== null && version !== String(SYNC_VERSION)) {
    throw new SyncError(
      `peer speaks nwf-sync/${version}, this client speaks nwf-sync/${SYNC_VERSION}`,
      peer.url,
      journal,
    )
  }
}

/**
 * Send one request with bounded retries. A 5xx or 429 is retried with jittered
 * backoff and then handed back as-is, so the caller reports the peer's own
 * status rather than a synthesized one.
 */
async function send(peer: Peer, url: string, options: PullOptions): Promise<SyncResponse> {
  const retries = options.retries ?? DEFAULT_RETRIES
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const delay = options.delay ?? defaultDelay

  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) {
      throw new SyncError(`the pull of ${url} was aborted by the caller`, peer.url)
    }
    try {
      // Counted per attempt, including retries: a report that hides the cost of
      // three failed attempts is worst exactly when someone is investigating.
      if (options.stats) options.stats.requests += 1
      const res = await attemptRequest(url, peer, options)
      if (options.stats) options.stats.bytes += res.bytes
      if (attempt >= retries || (res.status < 500 && res.status !== 429)) return res
    } catch (error) {
      if (options.signal?.aborted || attempt >= retries || !isRetryable(error)) throw error
    }
    await delay(backoffDelay(backoffMs, attempt), options.signal)
  }
}

/** Turn a non-success status into a SyncError with the peer's own detail, when it sent one. */
function statusError(
  peer: Peer,
  journal: string | undefined,
  res: SyncResponse,
  what: string,
): SyncError {
  let detail = ''
  try {
    const parsed = JSON.parse(res.body) as { error?: unknown }
    if (typeof parsed.error === 'string') detail = `: ${parsed.error}`
  } catch {
    // A non-JSON body (an HTML error page from a proxy) adds nothing useful.
  }
  return new SyncError(`peer answered ${res.status} for ${what}${detail}`, peer.url, journal)
}

/* -------------------------------------------------------------------------- */
/* Merging                                                                     */
/* -------------------------------------------------------------------------- */

const feedKey = (feed: JournalFeedMeta): string =>
  [feed.id, feed.title, feed.home ?? '', feed.self ?? ''].join('')

/**
 * Split records into runs sharing one feed identity, so the local journal keeps
 * the same `F` line boundaries the peer recorded instead of flattening them.
 */
function groupByFeed(
  records: JournalRecord[],
): { feed?: JournalFeedMeta; entries: NeurowireEntry[] }[] {
  const runs: { key: string; feed?: JournalFeedMeta; entries: NeurowireEntry[] }[] = []
  for (const record of records) {
    const key = record.feed ? feedKey(record.feed) : ''
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.entries.push(record.entry)
    else runs.push({ key, feed: record.feed, entries: [record.entry] })
  }
  return runs.map(({ feed, entries }) => (feed ? { feed, entries } : { entries }))
}

interface MergeResult {
  added: number
  skipped: number
  lastSeq: number
  hash?: string
}

/**
 * Verify one pulled segment and merge it. Verification happens before any
 * append, so a flipped byte in transit contributes nothing: segments already
 * merged in this pull were each verified on their own, and re-pulling them is
 * free because the store dedupes by entry key.
 */
function mergeSegment(
  peer: Peer,
  journal: string,
  store: JournalStore,
  res: SyncResponse,
  cursor: number,
): MergeResult {
  const text = res.body
  const parsed = parseJournal(text)

  if (parsed.header && parsed.header.journalId !== journal) {
    throw new SyncError(
      `peer sent journal "${parsed.header.journalId}" when asked for "${journal}"`,
      peer.url,
      journal,
    )
  }

  const verification = verifyJournal(text)
  if (!verification.valid) {
    const first = verification.issues[0]
    throw new SyncError(
      `chain verification failed for journal "${journal}"${first ? `: ${first.message}` : ''}`,
      peer.url,
      journal,
    )
  }
  if (parsed.records.length > 0 && verification.checked === 0) {
    throw new SyncError(
      `journal "${journal}" arrived with entries but no checkpoint to verify`,
      peer.url,
      journal,
    )
  }

  // The range header states what the peer meant to send. A body that stops short
  // of it was truncated somewhere the chain cannot see, since a cut just after a
  // checkpoint still verifies. A body that runs past it is not an error: the
  // peer appended to that segment between describing it and streaming it, and
  // those extra records are verified like any others.
  const range = res.headers.get('NWF-Sync-Range')
  const declared = range ? Number(range.split('-')[1]) : Number.NaN
  if (Number.isInteger(declared) && parsed.head.seq < declared) {
    throw new SyncError(
      `journal "${journal}" ended at seq ${parsed.head.seq}, but the peer declared ${declared}`,
      peer.url,
      journal,
    )
  }

  // A response carries whole segments, so it normally includes records at or
  // before the cursor. Dropping them keeps the reported counts truthful.
  const fresh = parsed.records.filter((record) => record.seq > cursor)
  let added = 0
  let skipped = 0
  for (const run of groupByFeed(fresh)) {
    const result = store.append(journal, run.entries, run.feed)
    added += result.added
    skipped += result.skipped
  }

  const merge: MergeResult = { added, skipped, lastSeq: parsed.head.seq }
  if (parsed.head.hash) merge.hash = parsed.head.hash
  return merge
}

/* -------------------------------------------------------------------------- */
/* Pulling                                                                     */
/* -------------------------------------------------------------------------- */

/** The journal ids a peer publishes. */
export async function listPeerJournals(peer: Peer, options: PullOptions = {}): Promise<string[]> {
  const res = await send(peer, syncEndpoint(peer.url, 'journals'), options)
  if (res.status !== 200) throw statusError(peer, undefined, res, '/sync/journals')
  assertVersion(peer, undefined, res)
  let parsed: { journals?: { id?: unknown }[] }
  try {
    parsed = JSON.parse(res.body) as { journals?: { id?: unknown }[] }
  } catch {
    throw new SyncError('peer sent an unreadable /sync/journals body', peer.url)
  }
  return (parsed.journals ?? [])
    .map((journal) => journal.id)
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Pull one journal from one peer into the local store.
 *
 * Polls the peer's head first and stops there when the recorded cursor already
 * matches, which is the steady state: one request, no body. Otherwise it walks
 * segments until the peer reports the transfer complete, verifying and merging
 * each one, and recording the new cursor only after the append lands.
 */
export async function pullJournal(
  peer: Peer,
  journalId: string,
  store: JournalStore,
  options: PullOptions = {},
): Promise<PullResult> {
  const state = options.state ?? openPeerState()
  const start = state.get(peer.url, journalId) ?? { seq: 0 }
  // Counters live in the options bag so the cost survives a throw: the caller
  // may pass its own, and syncPeers does, to report a failed pull honestly.
  const stats: SyncStats = options.stats ?? { requests: 0, bytes: 0 }
  const scoped: PullOptions = { ...options, stats }

  const headRes = await send(peer, syncEndpoint(peer.url, 'head', { journal: journalId }), scoped)
  if (headRes.status !== 200) throw statusError(peer, journalId, headRes, '/sync/head')
  assertVersion(peer, journalId, headRes)

  let remoteHead: number
  let remoteHash: string | undefined
  try {
    const parsed = JSON.parse(headRes.body) as { head?: unknown; hash?: unknown }
    if (!Number.isInteger(parsed.head)) throw new Error('head is not an integer')
    remoteHead = parsed.head as number
    if (typeof parsed.hash === 'string') remoteHash = parsed.hash
  } catch {
    throw new SyncError('peer sent an unreadable /sync/head body', peer.url, journalId)
  }

  const result: PullResult = {
    peer: peer.url,
    journal: journalId,
    added: 0,
    skipped: 0,
    head: { ...start },
    remoteHead,
    requests: stats.requests,
    bytes: stats.bytes,
    bootstrapped: false,
    reset: false,
  }

  // A head that moved backwards, or a chain value that disagrees at the very
  // sequence number the cursor names, means this is no longer the journal the
  // cursor points into: it was rebuilt, restored from a backup, or the store dir
  // was repointed. Without this the cursor sits past the new head forever and
  // every sync reports "0 new" with a clean exit code. Starting over is cheap,
  // since the entry-key dedupe makes the re-pull add only what is genuinely new.
  const diverged =
    remoteHead < start.seq ||
    (remoteHead === start.seq &&
      start.hash !== undefined &&
      remoteHash !== undefined &&
      remoteHash !== start.hash)

  if (diverged) {
    result.reset = true
    result.head = { seq: 0 }
  } else if (remoteHead <= start.seq) {
    return result
  }

  const maxSegments = options.maxSegments ?? DEFAULT_MAX_SEGMENTS
  let route: 'since' | 'snapshot' = 'since'
  let cursor = diverged ? 0 : start.seq

  for (let round = 0; round < maxSegments; round++) {
    const res = await send(
      peer,
      syncEndpoint(peer.url, route, { journal: journalId, cursor: String(cursor) }),
      scoped,
    )
    result.requests = stats.requests
    result.bytes = stats.bytes

    if (res.status === 204) {
      // A reset that finds nothing to pull still has to land, or the stale
      // cursor survives to stall the next sync too.
      if (result.reset) state.set(peer.url, journalId, result.head)
      return result
    }
    if (res.status === 410 && route === 'since') {
      // Compaction dropped the segment this cursor pointed into. Re-bootstrap
      // from what the peer still retains; the entry-key dedupe absorbs the
      // overlap, so recovery is safe if inelegant.
      route = 'snapshot'
      cursor = 0
      result.bootstrapped = true
      continue
    }
    if (res.status !== 200) throw statusError(peer, journalId, res, `/sync/${route}`)
    assertVersion(peer, journalId, res)

    const merged = mergeSegment(peer, journalId, store, res, cursor)
    if (merged.lastSeq <= cursor) {
      throw new SyncError(
        `peer did not advance past cursor ${cursor} for journal "${journalId}"`,
        peer.url,
        journalId,
      )
    }
    result.added += merged.added
    result.skipped += merged.skipped
    cursor = merged.lastSeq
    result.head = merged.hash ? { seq: cursor, hash: merged.hash } : { seq: cursor }

    // Only now, with the entries durably appended, is the cursor safe to record.
    state.set(peer.url, journalId, result.head)

    if (res.headers.get('NWF-Sync-Complete') === '1') return result
  }

  throw new SyncError(
    `journal "${journalId}" needed more than ${maxSegments} segments in one pull`,
    peer.url,
    journalId,
  )
}

/** One journal's outcome inside a {@link SyncReport}. */
export interface SyncJournalReport {
  journal: string
  added: number
  skipped: number
  head: JournalCursor
  requests: number
  bytes: number
  bootstrapped: boolean
  reset: boolean
  error?: string
}

/** One peer's outcome inside a {@link SyncReport}. */
export interface SyncPeerReport {
  url: string
  journals: SyncJournalReport[]
  /** Requests and bytes spent listing the peer's journals, outside any one journal. */
  requests: number
  bytes: number
  /** Set when the peer itself could not be reached or listed. */
  error?: string
}

export interface SyncReport {
  peers: SyncPeerReport[]
  added: number
  requests: number
  bytes: number
  errors: number
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Pull every selected journal from every peer, sequentially, and report what
 * happened. Failures are collected rather than thrown: one unreachable peer must
 * not cost you the deltas the others were ready to hand over.
 */
export async function syncPeers(
  peers: Peer[],
  store: JournalStore,
  options: PullOptions = {},
): Promise<SyncReport> {
  // One shared state store across peers, so a file-backed default is opened once.
  const state = options.state ?? openPeerState()
  const scoped: PullOptions = { ...options, state }

  const report: SyncReport = { peers: [], added: 0, requests: 0, bytes: 0, errors: 0 }

  for (const peer of peers) {
    const peerReport: SyncPeerReport = { url: peer.url, journals: [], requests: 0, bytes: 0 }
    report.peers.push(peerReport)

    let journals: string[]
    const listing: SyncStats = { requests: 0, bytes: 0 }
    try {
      journals = peer.journals?.length
        ? peer.journals
        : await listPeerJournals(peer, { ...scoped, stats: listing })
    } catch (error) {
      peerReport.error = describeError(error)
      report.errors += 1
      continue
    } finally {
      // Counted whether or not the listing succeeded: a peer that costs three
      // failed attempts should say so.
      peerReport.requests = listing.requests
      peerReport.bytes = listing.bytes
      report.requests += listing.requests
      report.bytes += listing.bytes
    }

    for (const journal of journals) {
      // A fresh counter per journal, so one journal's cost is its own, and a
      // throw partway through still reports what it spent getting there.
      const stats: SyncStats = { requests: 0, bytes: 0 }
      try {
        const pulled = await pullJournal(peer, journal, store, { ...scoped, stats })
        peerReport.journals.push({
          journal,
          added: pulled.added,
          skipped: pulled.skipped,
          head: pulled.head,
          requests: pulled.requests,
          bytes: pulled.bytes,
          bootstrapped: pulled.bootstrapped,
          reset: pulled.reset,
        })
        report.added += pulled.added
      } catch (error) {
        peerReport.journals.push({
          journal,
          added: 0,
          skipped: 0,
          head: state.get(peer.url, journal) ?? { seq: 0 },
          requests: stats.requests,
          bytes: stats.bytes,
          bootstrapped: false,
          reset: false,
          error: describeError(error),
        })
        report.errors += 1
      }
      report.requests += stats.requests
      report.bytes += stats.bytes
    }
  }

  return report
}
