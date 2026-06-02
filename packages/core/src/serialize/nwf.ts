import type { NeurowireEntry, NeurowireFeed, Person } from '../model'

/**
 * Neurowire Feed v1 (`nwf`): a compact, line-oriented feed format.
 *
 * Layout (TAB-separated cells, LF-separated lines):
 *   NWF1
 *   F  id  title  home  self  updatedEpoch  feedAuthorRefs
 *   A  author0  author1  ...        (authors dictionary, interned)
 *   T  tag0  tag1  ...              (tags dictionary, interned)
 *   S  source0  source1  ...        (sources dictionary, interned; used by merged meshes)
 *   B  baseUrl                      (shared link prefix)
 *   E  id  delta  link  authorRefs  tagRefs  title  summary  sourceRef
 *
 * The compactness comes from interning authors/tags/sources (referenced by
 * index), storing links relative to a shared base, and storing entry timestamps
 * as a delta in seconds from the feed's `updated`. It round-trips the list
 * essentials (feed id/title/home/self/updated/authors and entry id/title/link/
 * updated/summary/authors/tags/source). It does not carry `generator`.
 *
 * Within an author or source cell the sub-fields are joined by the ASCII Unit
 * Separator (0x1f), which never appears in feed text. The `sourceRef` column is
 * appended last, so older NWF1 documents that omit it still parse.
 */

const SEP = '\t'
const UNIT = String.fromCharCode(31)

type EntrySource = NonNullable<NeurowireEntry['source']>

const enc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')

const dec = (s: string): string =>
  s.replace(/\\(.)/g, (_, c: string) =>
    c === 't' ? '\t' : c === 'r' ? '\r' : c === 'n' ? '\n' : c,
  )

function toEpoch(iso: string | undefined): number | undefined {
  if (!iso) return undefined
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

const fromEpoch = (sec: number): string => new Date(sec * 1000).toISOString()

function encPerson(p: Person): string {
  const parts = [p.name]
  if (p.url !== undefined || p.email !== undefined) parts.push(p.url ?? '')
  if (p.email !== undefined) parts.push(p.email ?? '')
  return parts.map(enc).join(UNIT)
}

function decPerson(cell: string): Person {
  const [name = '', url, email] = cell.split(UNIT).map(dec)
  const person: Person = { name }
  if (url) person.url = url
  if (email) person.email = email
  return person
}

function encSource(source: EntrySource): string {
  const name = enc(source.name ?? '')
  return source.url ? `${name}${UNIT}${enc(source.url)}` : name
}

function decSource(cell: string): EntrySource {
  const [name = '', url] = cell.split(UNIT).map(dec)
  const source: EntrySource = {}
  if (name) source.name = name
  if (url) source.url = url
  return source
}

function hasSource(source: EntrySource | undefined): source is EntrySource {
  return source !== undefined && (Boolean(source.name) || Boolean(source.url))
}

function parseRefs(cell: string | undefined): number[] {
  if (!cell) return []
  return cell.split(',').map((n) => Number.parseInt(n, 10))
}

/** Longest shared link prefix, trimmed to a path boundary (keeps scheme + host). */
function commonBase(links: string[]): string {
  if (links.length < 2) return ''
  let prefix = links[0] ?? ''
  for (let i = 1; i < links.length; i++) {
    const link = links[i] ?? ''
    let n = 0
    while (n < prefix.length && n < link.length && prefix[n] === link[n]) n++
    prefix = prefix.slice(0, n)
    if (!prefix) break
  }
  const cut = prefix.lastIndexOf('/')
  return cut > 8 ? prefix.slice(0, cut + 1) : ''
}

/** Serialize a feed to the compact Neurowire Feed format. */
export function toNwf(feed: NeurowireFeed): string {
  const updatedEpoch = toEpoch(feed.updated) ?? 0

  const authors: Person[] = []
  const authorKeys = new Map<string, number>()
  const internAuthor = (p: Person): number => {
    const key = `${p.name}${UNIT}${p.url ?? ''}${UNIT}${p.email ?? ''}`
    const existing = authorKeys.get(key)
    if (existing !== undefined) return existing
    const index = authors.length
    authors.push(p)
    authorKeys.set(key, index)
    return index
  }

  const tags: string[] = []
  const tagKeys = new Map<string, number>()
  const internTag = (t: string): number => {
    const existing = tagKeys.get(t)
    if (existing !== undefined) return existing
    const index = tags.length
    tags.push(t)
    tagKeys.set(t, index)
    return index
  }

  const sources: EntrySource[] = []
  const sourceKeys = new Map<string, number>()
  const internSource = (source: EntrySource): number => {
    const key = `${source.name ?? ''}${UNIT}${source.url ?? ''}`
    const existing = sourceKeys.get(key)
    if (existing !== undefined) return existing
    const index = sources.length
    sources.push(source)
    sourceKeys.set(key, index)
    return index
  }

  const feedAuthorRefs = (feed.authors ?? []).map(internAuthor)
  const rows = feed.entries.map((entry) => ({
    entry,
    authorRefs: (entry.authors ?? []).map(internAuthor),
    tagRefs: (entry.tags ?? []).map(internTag),
    sourceRef: hasSource(entry.source) ? String(internSource(entry.source)) : '',
  }))

  const base = commonBase(feed.entries.map((e) => e.link))

  const lines: string[] = ['NWF1']
  lines.push(
    [
      'F',
      enc(feed.id),
      enc(feed.title),
      enc(feed.home ?? ''),
      enc(feed.self ?? ''),
      String(updatedEpoch),
      feedAuthorRefs.join(','),
    ].join(SEP),
  )
  if (authors.length) lines.push(['A', ...authors.map(encPerson)].join(SEP))
  if (tags.length) lines.push(['T', ...tags.map(enc)].join(SEP))
  if (sources.length) lines.push(['S', ...sources.map(encSource)].join(SEP))
  if (base) lines.push(['B', enc(base)].join(SEP))

  for (const { entry, authorRefs, tagRefs, sourceRef } of rows) {
    const epoch = toEpoch(entry.updated ?? entry.published)
    const delta = epoch === undefined ? '-' : String(updatedEpoch - epoch)
    const link =
      base && entry.link.startsWith(base) ? `~${entry.link.slice(base.length)}` : entry.link
    lines.push(
      [
        'E',
        enc(entry.id),
        delta,
        enc(link),
        authorRefs.join(','),
        tagRefs.join(','),
        enc(entry.title),
        enc(entry.summary ?? ''),
        sourceRef,
      ].join(SEP),
    )
  }

  return `${lines.join('\n')}\n`
}

/** Parse a compact Neurowire Feed back into the canonical model. */
export function fromNwf(text: string): NeurowireFeed {
  const lines = text.split('\n')
  if (lines[0] !== 'NWF1') {
    throw new Error('Not a Neurowire Feed (missing NWF1 header)')
  }

  let id = ''
  let title = ''
  let home = ''
  let self = ''
  let updatedEpoch = 0
  let feedAuthorRefs: number[] = []
  let authors: Person[] = []
  let tags: string[] = []
  let sources: EntrySource[] = []
  let base = ''
  const entries: NeurowireEntry[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const cells = line.split(SEP)
    switch (cells[0]) {
      case 'F':
        id = dec(cells[1] ?? '')
        title = dec(cells[2] ?? '')
        home = dec(cells[3] ?? '')
        self = dec(cells[4] ?? '')
        updatedEpoch = Number.parseInt(cells[5] ?? '0', 10) || 0
        feedAuthorRefs = parseRefs(cells[6])
        break
      case 'A':
        authors = cells.slice(1).map(decPerson)
        break
      case 'T':
        tags = cells.slice(1).map(dec)
        break
      case 'S':
        sources = cells.slice(1).map(decSource)
        break
      case 'B':
        base = dec(cells[1] ?? '')
        break
      case 'E': {
        const rawLink = dec(cells[3] ?? '')
        const entry: NeurowireEntry = {
          id: dec(cells[1] ?? ''),
          title: dec(cells[6] ?? ''),
          link: rawLink.startsWith('~') ? base + rawLink.slice(1) : rawLink,
        }
        const delta = cells[2] ?? '-'
        if (delta !== '-') {
          entry.updated = fromEpoch(updatedEpoch - (Number.parseInt(delta, 10) || 0))
        }
        const entryAuthors = parseRefs(cells[4])
          .map((r) => authors[r])
          .filter((a): a is Person => a !== undefined)
        if (entryAuthors.length) entry.authors = entryAuthors
        const entryTags = parseRefs(cells[5])
          .map((r) => tags[r])
          .filter((t): t is string => t !== undefined)
        if (entryTags.length) entry.tags = entryTags
        const summary = dec(cells[7] ?? '')
        if (summary) entry.summary = summary
        const sourceRef = cells[8] ?? ''
        if (sourceRef !== '') {
          const source = sources[Number.parseInt(sourceRef, 10)]
          if (source) entry.source = source
        }
        entries.push(entry)
        break
      }
    }
  }

  const feed: NeurowireFeed = { id, title, updated: fromEpoch(updatedEpoch), entries }
  if (home) feed.home = home
  if (self) feed.self = self
  const fAuthors = feedAuthorRefs.map((r) => authors[r]).filter((a): a is Person => a !== undefined)
  if (fAuthors.length) feed.authors = fAuthors
  return feed
}

/** A problem found while validating a Neurowire Feed, with a 1-based line number. */
export interface NwfIssue {
  line: number
  message: string
}

/** Result of validating an nwf document. */
export interface NwfValidation {
  valid: boolean
  errors: NwfIssue[]
  warnings: NwfIssue[]
  /** The parsed feed, present when there are no errors. */
  feed?: NeurowireFeed
}

const isUint = (s: string | undefined): boolean => s !== undefined && /^\d+$/.test(s)

function checkRefs(
  cell: string | undefined,
  dictSize: number,
  label: string,
  line: number,
  errors: NwfIssue[],
): void {
  if (!cell) return
  for (const part of cell.split(',')) {
    if (!/^\d+$/.test(part)) {
      errors.push({ line, message: `${label}: "${part}" is not an integer index` })
    } else if (Number(part) >= dictSize) {
      errors.push({
        line,
        message: `${label}: index ${part} is out of range (dictionary has ${dictSize})`,
      })
    }
  }
}

/**
 * Validate a Neurowire Feed document: the header, the feed line, line kinds,
 * cell counts, timestamp deltas, and that every dictionary reference is in
 * range. Then parse it. Returns errors and warnings with 1-based line numbers.
 */
export function validateNwf(text: string): NwfValidation {
  const errors: NwfIssue[] = []
  const warnings: NwfIssue[] = []
  const lines = text.split('\n')

  if (lines[0] !== 'NWF1') {
    errors.push({
      line: 1,
      message: `expected "NWF1" header, got ${JSON.stringify(lines[0] ?? '')}`,
    })
    return { valid: false, errors, warnings }
  }

  // Dictionary sizes, needed to range-check references.
  let authorCount = 0
  let tagCount = 0
  let sourceCount = 0
  for (let i = 1; i < lines.length; i++) {
    const cells = (lines[i] ?? '').split(SEP)
    if (cells[0] === 'A') authorCount = cells.length - 1
    else if (cells[0] === 'T') tagCount = cells.length - 1
    else if (cells[0] === 'S') sourceCount = cells.length - 1
  }

  let feedLines = 0
  let entryCount = 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const lineNo = i + 1
    const cells = line.split(SEP)
    switch (cells[0]) {
      case 'F': {
        feedLines++
        if (cells.length < 6) {
          errors.push({
            line: lineNo,
            message: `F line needs at least 6 cells, got ${cells.length}`,
          })
        }
        if (!isUint(cells[5])) {
          errors.push({
            line: lineNo,
            message: `F updatedEpoch must be an integer, got ${JSON.stringify(cells[5] ?? '')}`,
          })
        }
        checkRefs(cells[6], authorCount, 'F authorRefs', lineNo, errors)
        break
      }
      case 'A':
      case 'T':
      case 'S':
        break
      case 'B':
        if (!cells[1]) warnings.push({ line: lineNo, message: 'B line has no base URL' })
        break
      case 'E': {
        entryCount++
        if (cells.length < 7) {
          errors.push({
            line: lineNo,
            message: `E line needs at least 7 cells, got ${cells.length}`,
          })
          break
        }
        if (!cells[1]) errors.push({ line: lineNo, message: 'E entry has an empty id' })
        const delta = cells[2] ?? ''
        if (delta !== '-' && !/^-?\d+$/.test(delta)) {
          errors.push({
            line: lineNo,
            message: `E delta must be "-" or an integer, got ${JSON.stringify(delta)}`,
          })
        }
        if (!cells[3]) warnings.push({ line: lineNo, message: 'E entry has an empty link' })
        checkRefs(cells[4], authorCount, 'E authorRefs', lineNo, errors)
        checkRefs(cells[5], tagCount, 'E tagRefs', lineNo, errors)
        const sourceRef = cells[8]
        if (sourceRef) {
          if (!/^\d+$/.test(sourceRef)) {
            errors.push({
              line: lineNo,
              message: `E sourceRef must be an integer index, got ${JSON.stringify(sourceRef)}`,
            })
          } else if (Number(sourceRef) >= sourceCount) {
            errors.push({
              line: lineNo,
              message: `E sourceRef ${sourceRef} is out of range (S has ${sourceCount})`,
            })
          }
        }
        break
      }
      default:
        errors.push({
          line: lineNo,
          message: `unknown line kind ${JSON.stringify(cells[0] ?? '')}`,
        })
    }
  }

  if (feedLines === 0)
    errors.push({ line: 1, message: 'missing the required F (feed header) line' })
  if (feedLines > 1)
    errors.push({ line: 1, message: `expected exactly one F line, found ${feedLines}` })
  if (entryCount === 0) warnings.push({ line: 1, message: 'feed has no entries' })

  // The header is validated above, so fromNwf cannot throw here.
  const feed = errors.length === 0 ? fromNwf(text) : undefined
  return { valid: errors.length === 0, errors, warnings, feed }
}
