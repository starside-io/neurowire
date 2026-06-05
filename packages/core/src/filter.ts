import type { NeurowireEntry, NeurowireFeed } from './model'

/**
 * Pure, deterministic entry filtering by field and pattern. A rule matches a
 * single field (title, summary, source, author, tag) against a substring or a
 * regular expression. `filterEntries` keeps entries that satisfy an include set
 * and avoid an exclude set. No I/O, no clock, no DOM.
 */

export type FilterField = 'title' | 'summary' | 'source' | 'author' | 'tag'

export interface FilterRule {
  field: FilterField
  pattern: string
  regex?: boolean
}

export interface FilterSpec {
  include?: FilterRule[]
  exclude?: FilterRule[]
}

/** The candidate values an entry exposes for a given field. */
function fieldValues(entry: NeurowireEntry, field: FilterField): string[] {
  switch (field) {
    case 'title':
      return [entry.title]
    case 'summary':
      return [entry.summary ?? '']
    case 'source':
      return [entry.source?.name ?? '']
    case 'author':
      return [(entry.authors ?? []).map((a) => a.name).join(' ')]
    case 'tag':
      return entry.tags ?? []
  }
}

/** Does any of the entry's values for the rule's field match the pattern? */
export function matchRule(entry: NeurowireEntry, rule: FilterRule): boolean {
  const values = fieldValues(entry, rule.field)
  if (rule.regex) {
    const re = new RegExp(rule.pattern, 'i')
    return values.some((value) => re.test(value))
  }
  const needle = rule.pattern.toLowerCase()
  return values.some((value) => value.toLowerCase().includes(needle))
}

/**
 * Keep an entry iff it matches at least one include rule (or there are none)
 * and matches none of the exclude rules. An empty spec returns the feed
 * entries unchanged.
 */
export function filterEntries(feed: NeurowireFeed, spec: FilterSpec): NeurowireFeed {
  const include = spec.include ?? []
  const exclude = spec.exclude ?? []
  if (include.length === 0 && exclude.length === 0) return feed

  const kept = feed.entries.filter((entry) => {
    if (include.length > 0 && !include.some((rule) => matchRule(entry, rule))) return false
    if (exclude.some((rule) => matchRule(entry, rule))) return false
    return true
  })
  return { ...feed, entries: kept }
}
