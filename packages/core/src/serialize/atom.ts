import type { NeurowireEntry, NeurowireFeed, Person } from '../model'

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

/** Coerce an ISO-ish string to RFC 3339. Falls back when unparseable. */
function rfc3339(value: string | undefined, fallback: string): string {
  const source = value ?? fallback
  const ms = Date.parse(source)
  return Number.isNaN(ms) ? fallback : new Date(ms).toISOString()
}

function personXml(tag: string, p: Person, indent: string): string {
  const lines = [`${indent}<${tag}>`, `${indent}  <name>${escapeText(p.name)}</name>`]
  if (p.url) lines.push(`${indent}  <uri>${escapeText(p.url)}</uri>`)
  if (p.email) lines.push(`${indent}  <email>${escapeText(p.email)}</email>`)
  lines.push(`${indent}</${tag}>`)
  return lines.join('\n')
}

function entryXml(entry: NeurowireEntry, feedUpdated: string): string {
  const updated = rfc3339(entry.updated ?? entry.published, feedUpdated)
  const lines = [
    '  <entry>',
    `    <id>${escapeText(entry.id)}</id>`,
    `    <title>${escapeText(entry.title)}</title>`,
    `    <link rel="alternate" href="${escapeAttr(entry.link)}"/>`,
    `    <updated>${updated}</updated>`,
  ]
  if (entry.published) {
    lines.push(`    <published>${rfc3339(entry.published, updated)}</published>`)
  }
  for (const author of entry.authors ?? []) {
    lines.push(personXml('author', author, '    '))
  }
  for (const tag of entry.tags ?? []) {
    lines.push(`    <category term="${escapeAttr(tag)}"/>`)
  }
  if (entry.summary) {
    lines.push(`    <summary type="text">${escapeText(entry.summary)}</summary>`)
  }
  lines.push('  </entry>')
  return lines.join('\n')
}

/** Serialize a feed to an Atom 1.0 document. */
export function toAtom(feed: NeurowireFeed): string {
  const updated = rfc3339(feed.updated, new Date(0).toISOString())
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeText(feed.id)}</id>`,
    `  <title>${escapeText(feed.title)}</title>`,
    `  <updated>${updated}</updated>`,
  ]
  if (feed.home) lines.push(`  <link rel="alternate" href="${escapeAttr(feed.home)}"/>`)
  if (feed.self) lines.push(`  <link rel="self" href="${escapeAttr(feed.self)}"/>`)
  for (const author of feed.authors ?? []) {
    lines.push(personXml('author', author, '  '))
  }
  if (feed.generator) {
    const version = feed.generator.version ? ` version="${escapeAttr(feed.generator.version)}"` : ''
    lines.push(`  <generator${version}>${escapeText(feed.generator.name)}</generator>`)
  }
  for (const entry of feed.entries) {
    lines.push(entryXml(entry, updated))
  }
  lines.push('</feed>', '')
  return lines.join('\n')
}
