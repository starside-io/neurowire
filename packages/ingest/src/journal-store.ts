import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  JOURNAL_EXTENSION,
  type JournalCursor,
  type JournalFeedMeta,
  type JournalIssue,
  type JournalQuery,
  type JournalRecord,
  type NeurowireEntry,
  createJournalEncoder,
  entryKey,
  matchRule,
  parseJournal,
  queryJournal,
  resumeJournalEncoder,
  verifyJournal,
} from '@neurowire/core'

/**
 * The on-disk side of the NWF journal: one journal per feed or mesh id, stored
 * as size-capped `<id>.<nnnnn>.nwfj` segments plus a `<id>.manifest.json`
 * sidecar.
 *
 * The manifest is a cache, never a second source of truth: it records each
 * segment's sequence range, date range, dictionaries, and entry keys, all of
 * which are derivable by rescanning the segments. It exists so appends can
 * dedupe in constant time and so queries can skip whole segments that provably
 * cannot match, without decoding a single entry line from them.
 */

const MANIFEST_VERSION = 1
const DEFAULT_MAX_SEGMENT_BYTES = 5 * 1024 * 1024
const SEGMENT_DIGITS = 5

/** What the manifest remembers about one segment file. */
export interface JournalSegmentInfo {
  file: string
  index: number
  firstSeq: number
  lastSeq: number
  /** Epoch seconds of the oldest and newest dated entry, absent when none are dated. */
  minTime?: number
  maxTime?: number
  authors: string[]
  tags: string[]
  sources: string[]
  /** Entry keys held by this segment, so appends can dedupe without a rescan. */
  keys: string[]
  bytes: number
  entries: number
}

/** The rebuildable index beside a journal's segments. */
export interface JournalManifest {
  id: string
  version: number
  segments: JournalSegmentInfo[]
}

export interface JournalAppendResult {
  /** Entries actually written, after dropping ones the journal already holds. */
  added: number
  /** Entries dropped as duplicates. */
  skipped: number
  head: JournalCursor
  /** The segment written to, or an empty string when nothing was written. */
  segment: string
  /** True when this append started a new segment. */
  rotated: boolean
}

export interface JournalSinceResult {
  records: JournalRecord[]
  entries: NeurowireEntry[]
  head: JournalCursor
  /**
   * True when the cursor points before the oldest retained entry, so the delta
   * cannot be complete. Callers should fall back to reading the whole journal.
   */
  tooOld: boolean
}

export interface JournalQueryResult {
  entries: NeurowireEntry[]
  /** Segment files actually opened and decoded. */
  scanned: string[]
  /** Segment files the plan proved could not match, so they were never opened. */
  skipped: string[]
}

export interface JournalStore {
  readonly dir: string
  /** Journal ids present in the directory. */
  list(): string[]
  manifest(id: string): JournalManifest
  head(id: string): JournalCursor
  append(id: string, entries: NeurowireEntry[], feed?: JournalFeedMeta): JournalAppendResult
  since(id: string, cursor?: JournalCursor | number): JournalSinceResult
  read(id: string): JournalRecord[]
  query(id: string, query?: JournalQuery): JournalQueryResult
  verify(id: string): { valid: boolean; checked: number; issues: JournalIssue[] }
  /** Drop all but the newest `keep` segments. Returns the removed file names. */
  compact(id: string, keep: number): string[]
}

export interface JournalStoreOptions {
  dir?: string
  /** Rotate to a new segment once the active one reaches this size. */
  maxSegmentBytes?: number
}

/**
 * Where journals live by default: `$NEUROWIRE_JOURNAL`, else
 * `~/.config/neurowire/journal` (honoring `XDG_CONFIG_HOME`). The same shape as
 * the mesh and tap config directories.
 */
export function journalConfigDir(): string {
  const fromEnv = (process.env.NEUROWIRE_JOURNAL ?? '').trim()
  if (fromEnv) return fromEnv
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'neurowire', 'journal')
}

/** Reject ids that could escape the journal directory or collide with the naming scheme. */
function assertId(id: string): void {
  if (!/^[\w.-]+$/.test(id) || id.includes('..')) {
    throw new Error(`invalid journal id ${JSON.stringify(id)} (use letters, digits, . _ -)`)
  }
}

const segmentName = (id: string, index: number): string =>
  `${id}.${String(index).padStart(SEGMENT_DIGITS, '0')}.${JOURNAL_EXTENSION}`

/** Epoch seconds an entry sorts by, matching the live path's published-then-updated order. */
function entryTime(entry: NeurowireEntry): number | undefined {
  const ms = Date.parse(entry.published ?? entry.updated ?? '')
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

/** Describe one segment file by decoding it. Used to build or repair the manifest. */
function scanSegment(path: string, file: string, index: number): JournalSegmentInfo {
  const text = readFileSync(path, 'utf8')
  const parsed = parseJournal(text)
  const times = parsed.records
    .map((record) => entryTime(record.entry))
    .filter((time): time is number => time !== undefined)

  const authors = new Set<string>()
  const tags = new Set<string>()
  const sources = new Set<string>()
  for (const { entry } of parsed.records) {
    for (const person of entry.authors ?? []) authors.add(person.name)
    for (const tag of entry.tags ?? []) tags.add(tag)
    if (entry.source?.name) sources.add(entry.source.name)
  }

  const info: JournalSegmentInfo = {
    file,
    index,
    firstSeq: parsed.records[0]?.seq ?? 0,
    lastSeq: parsed.head.seq,
    authors: [...authors],
    tags: [...tags],
    sources: [...sources],
    keys: parsed.records.map((record) => entryKey(record.entry)),
    bytes: Buffer.byteLength(text),
    entries: parsed.records.length,
  }
  if (times.length) {
    info.minTime = Math.min(...times)
    info.maxTime = Math.max(...times)
  }
  return info
}

/**
 * Can this segment be ruled out for a query without opening it? Only ever
 * answers true when the manifest alone proves no entry inside could match.
 */
function canSkip(info: JournalSegmentInfo, query: JournalQuery): boolean {
  const { from, to, filter } = query

  // Date range. A segment with no dated entries cannot satisfy a date bound at
  // all, since undated entries are dropped whenever a bound is set.
  if (from !== undefined || to !== undefined) {
    if (info.maxTime === undefined || info.minTime === undefined) return true
    if (from !== undefined && info.maxTime * 1000 < from) return true
    if (to !== undefined && info.minTime * 1000 > to) return true
  }

  // Dictionary vocabulary. Include rules are OR-ed, so the segment can only be
  // ruled out when every rule is dictionary-backed and none of them matches.
  const include = filter?.include ?? []
  if (include.length === 0) return false

  const vocabulary: Record<string, string[] | undefined> = {
    tag: info.tags,
    author: info.authors,
    source: info.sources,
  }
  return include.every((rule) => {
    const values = vocabulary[rule.field]
    if (!values) return false // title/summary rules cannot be pruned
    // Reuse the live matcher so pruning can never disagree with filtering.
    return !values.some((value) => {
      const probe: NeurowireEntry = { id: '', title: '', link: '' }
      if (rule.field === 'tag') probe.tags = [value]
      if (rule.field === 'author') probe.authors = [{ name: value }]
      if (rule.field === 'source') probe.source = { name: value }
      return matchRule(probe, rule)
    })
  })
}

/** Open (and create) a journal store rooted at `dir`. */
export function openJournalStore(options: JournalStoreOptions = {}): JournalStore {
  const dir = options.dir ?? journalConfigDir()
  const maxSegmentBytes = options.maxSegmentBytes ?? DEFAULT_MAX_SEGMENT_BYTES

  const ensureDir = (): void => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  const segmentFiles = (id: string): { file: string; index: number }[] => {
    if (!existsSync(dir)) return []
    const prefix = `${id}.`
    const suffix = `.${JOURNAL_EXTENSION}`
    return readdirSync(dir)
      .filter((file) => file.startsWith(prefix) && file.endsWith(suffix))
      .map((file) => ({
        file,
        index: Number.parseInt(file.slice(prefix.length, -suffix.length), 10),
      }))
      .filter(({ index }) => Number.isInteger(index))
      .sort((a, b) => a.index - b.index)
  }

  const manifestPath = (id: string): string => join(dir, `${id}.manifest.json`)

  const rebuild = (id: string): JournalManifest => ({
    id,
    version: MANIFEST_VERSION,
    segments: segmentFiles(id).map(({ file, index }) => scanSegment(join(dir, file), file, index)),
  })

  const writeManifest = (manifest: JournalManifest): void => {
    ensureDir()
    writeFileSync(manifestPath(manifest.id), `${JSON.stringify(manifest, null, 2)}\n`)
  }

  /**
   * Load the manifest, checking it against what is actually on disk. Any
   * disagreement (missing file, unparseable JSON, a segment added, removed, or
   * resized behind our back) means the cache is stale, so it gets rebuilt.
   */
  const loadManifest = (id: string): JournalManifest => {
    assertId(id)
    const files = segmentFiles(id)
    const path = manifestPath(id)

    if (existsSync(path)) {
      try {
        const cached = JSON.parse(readFileSync(path, 'utf8')) as JournalManifest
        const sameShape =
          cached.version === MANIFEST_VERSION &&
          cached.segments.length === files.length &&
          cached.segments.every((segment, i) => {
            const actual = files[i]
            return (
              actual !== undefined &&
              actual.file === segment.file &&
              statSync(join(dir, actual.file)).size === segment.bytes
            )
          })
        if (sameShape) return cached
      } catch {
        // Fall through to a rebuild: a corrupt cache is never fatal.
      }
    }

    const fresh = rebuild(id)
    if (files.length) writeManifest(fresh)
    return fresh
  }

  const headOf = (manifest: JournalManifest): JournalCursor => {
    const last = manifest.segments[manifest.segments.length - 1]
    return { seq: last?.lastSeq ?? 0 }
  }

  const readRecords = (files: string[]): JournalRecord[] =>
    files.flatMap((file) => parseJournal(readFileSync(join(dir, file), 'utf8')).records)

  return {
    dir,

    list(): string[] {
      if (!existsSync(dir)) return []
      const suffix = `.${JOURNAL_EXTENSION}`
      const ids = new Set<string>()
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(suffix)) continue
        const withoutExt = file.slice(0, -suffix.length)
        const dot = withoutExt.lastIndexOf('.')
        if (dot > 0) ids.add(withoutExt.slice(0, dot))
      }
      return [...ids].sort()
    },

    manifest: loadManifest,

    head(id: string): JournalCursor {
      return headOf(loadManifest(id))
    },

    append(id: string, entries: NeurowireEntry[], feed?: JournalFeedMeta): JournalAppendResult {
      const manifest = loadManifest(id)
      const known = new Set(manifest.segments.flatMap((segment) => segment.keys))

      const fresh: NeurowireEntry[] = []
      for (const entry of entries) {
        const key = entryKey(entry)
        if (known.has(key)) continue
        known.add(key)
        fresh.push(entry)
      }

      const last = manifest.segments[manifest.segments.length - 1]
      if (fresh.length === 0) {
        return {
          added: 0,
          skipped: entries.length,
          head: headOf(manifest),
          segment: last?.file ?? '',
          rotated: false,
        }
      }

      ensureDir()
      const rotate = last === undefined || last.bytes >= maxSegmentBytes
      let file: string
      let body: string

      if (rotate) {
        const index = (last?.index ?? 0) + 1
        file = segmentName(id, index)
        const encoder = createJournalEncoder({ journalId: id, startSeq: last?.lastSeq ?? 0 })
        body = encoder.header()
        for (const entry of fresh) body += encoder.push(entry, feed)
        body += encoder.checkpoint()
        writeFileSync(join(dir, file), body)
      } else {
        file = last.file
        const path = join(dir, file)
        const encoder = resumeJournalEncoder(readFileSync(path, 'utf8'))
        body = ''
        for (const entry of fresh) body += encoder.push(entry, feed)
        body += encoder.checkpoint()
        appendFileSync(path, body)
      }

      // Re-describe only the touched segment; the others are unchanged.
      const info = scanSegment(join(dir, file), file, rotate ? (last?.index ?? 0) + 1 : last.index)
      const segments = rotate
        ? [...manifest.segments, info]
        : manifest.segments.map((segment) => (segment.file === file ? info : segment))
      const updated: JournalManifest = { ...manifest, segments }
      writeManifest(updated)

      return {
        added: fresh.length,
        skipped: entries.length - fresh.length,
        head: headOf(updated),
        segment: file,
        rotated: rotate,
      }
    },

    since(id: string, cursor: JournalCursor | number = 0): JournalSinceResult {
      const from = typeof cursor === 'number' ? { seq: cursor } : cursor
      const manifest = loadManifest(id)
      const oldest = manifest.segments[0]

      const tooOld =
        from.seq > 0 &&
        oldest !== undefined &&
        oldest.firstSeq > 0 &&
        from.seq < oldest.firstSeq - 1

      const files = manifest.segments
        .filter((segment) => segment.lastSeq > from.seq)
        .map((segment) => segment.file)
      const records = readRecords(files).filter((record) => record.seq > from.seq)

      return {
        records,
        entries: records.map((record) => record.entry),
        head: headOf(manifest),
        tooOld,
      }
    },

    read(id: string): JournalRecord[] {
      return readRecords(loadManifest(id).segments.map((segment) => segment.file))
    },

    query(id: string, query: JournalQuery = {}): JournalQueryResult {
      const manifest = loadManifest(id)
      const scanned: string[] = []
      const skipped: string[] = []
      for (const segment of manifest.segments) {
        if (canSkip(segment, query)) skipped.push(segment.file)
        else scanned.push(segment.file)
      }
      // Decode only the survivors, then run the same query the live path runs so
      // sort and limit apply across the whole archive rather than per segment.
      return { entries: queryJournal(readRecords(scanned), query), scanned, skipped }
    },

    verify(id: string) {
      const issues: JournalIssue[] = []
      let checked = 0
      for (const segment of loadManifest(id).segments) {
        const result = verifyJournal(readFileSync(join(dir, segment.file), 'utf8'))
        checked += result.checked
        issues.push(...result.issues)
      }
      return { valid: issues.length === 0, checked, issues }
    },

    compact(id: string, keep: number): string[] {
      const manifest = loadManifest(id)
      const dropCount = Math.max(0, manifest.segments.length - Math.max(0, keep))
      const drop = manifest.segments.slice(0, dropCount)
      for (const segment of drop) rmSync(join(dir, segment.file))
      if (drop.length) {
        writeManifest({ ...manifest, segments: manifest.segments.slice(drop.length) })
      }
      return drop.map((segment) => segment.file)
    },
  }
}
