import type { NeurowireEntry, Person } from '../model'

/**
 * The shared cell grammar behind the line-oriented Neurowire formats: `nwf`
 * (a snapshot) and `nwfj` (an append-only journal). Both split lines on LF and
 * cells on TAB, escape the same four characters, and join the sub-fields of a
 * person or a source with the ASCII Unit Separator. Keeping the grammar in one
 * module means the two formats cannot drift apart.
 */

export const SEP = '\t'
export const UNIT = String.fromCharCode(31)

export type EntrySource = NonNullable<NeurowireEntry['source']>

export const enc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')

export const dec = (s: string): string =>
  s.replace(/\\(.)/g, (_, c: string) =>
    c === 't' ? '\t' : c === 'r' ? '\r' : c === 'n' ? '\n' : c,
  )

/** Seconds since the epoch for an ISO date, or undefined when absent/unparseable. */
export function toEpoch(iso: string | undefined): number | undefined {
  if (!iso) return undefined
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

export const fromEpoch = (sec: number): string => new Date(sec * 1000).toISOString()

export function encPerson(p: Person): string {
  const parts = [p.name]
  if (p.url !== undefined || p.email !== undefined) parts.push(p.url ?? '')
  if (p.email !== undefined) parts.push(p.email ?? '')
  return parts.map(enc).join(UNIT)
}

export function decPerson(cell: string): Person {
  const [name = '', url, email] = cell.split(UNIT).map(dec)
  const person: Person = { name }
  if (url) person.url = url
  if (email) person.email = email
  return person
}

export function encSource(source: EntrySource): string {
  const name = enc(source.name ?? '')
  return source.url ? `${name}${UNIT}${enc(source.url)}` : name
}

export function decSource(cell: string): EntrySource {
  const [name = '', url] = cell.split(UNIT).map(dec)
  const source: EntrySource = {}
  if (name) source.name = name
  if (url) source.url = url
  return source
}

/** A source cell is worth writing only when it carries a name or a url. */
export function hasSource(source: EntrySource | undefined): source is EntrySource {
  return source !== undefined && (Boolean(source.name) || Boolean(source.url))
}

/** Parse a comma-separated dictionary reference cell into indices. */
export function parseRefs(cell: string | undefined): number[] {
  if (!cell) return []
  return cell.split(',').map((n) => Number.parseInt(n, 10))
}

/** Interning key for a person, stable across equal name/url/email triples. */
export function personKey(p: Person): string {
  return `${p.name}${UNIT}${p.url ?? ''}${UNIT}${p.email ?? ''}`
}

/** Interning key for an entry source. */
export function sourceKey(source: EntrySource): string {
  return `${source.name ?? ''}${UNIT}${source.url ?? ''}`
}
