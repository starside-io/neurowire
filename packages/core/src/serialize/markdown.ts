import type { NeurowireEntry, NeurowireFeed } from '../model'

const DOT = ' · '

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? value : new Date(ms).toISOString().slice(0, 10)
}

function entryMd(entry: NeurowireEntry): string {
  const lines = [`### [${entry.title}](${entry.link})`]
  const meta: string[] = []
  const date = formatDate(entry.updated ?? entry.published)
  if (date) meta.push(date)
  if (entry.authors?.length) meta.push(entry.authors.map((a) => a.name).join(', '))
  if (entry.tags?.length) meta.push(entry.tags.map((t) => `\`${t}\``).join(' '))
  if (meta.length) lines.push('', meta.join(DOT))
  if (entry.summary) lines.push('', entry.summary)
  return lines.join('\n')
}

/** Serialize a feed to a human-readable Markdown digest. */
export function toMarkdown(feed: NeurowireFeed): string {
  const header = [`# ${feed.title}`]
  const meta: string[] = []
  const updated = formatDate(feed.updated)
  if (updated) meta.push(`Updated ${updated}`)
  if (feed.home) meta.push(`[Home](${feed.home})`)
  if (feed.self) meta.push(`[Feed](${feed.self})`)
  if (meta.length) header.push('', meta.join(DOT))

  return `${[header.join('\n'), ...feed.entries.map(entryMd)].join('\n\n')}\n`
}
