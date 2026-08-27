import type { FeedTemplate } from '@neurowire/ingest'
import { load } from 'cheerio'

/** The fields a tap can carry selectors for, in walkthrough order. */
export const TAP_FIELDS = ['item', 'title', 'link', 'date', 'summary', 'author', 'tags'] as const

/** One authorable tap field. */
export type TapField = (typeof TAP_FIELDS)[number]

/** Ranked candidate selectors per tap field, best first. */
export type TapCandidates = Record<TapField, string[]>

/** The shape of a parsed DOM element this module reads. Structurally a cheerio `Element`. */
interface TaggedElement {
  tagName?: string
  name?: string
  attribs?: Record<string, string>
}

/** A candidate set with every field empty. */
export function emptyCandidates(): TapCandidates {
  return { item: [], title: [], link: [], date: [], summary: [], author: [], tags: [] }
}

/** Per-field cap on how many candidates are offered. */
const LIMITS: Record<TapField, number> = {
  item: 6,
  title: 6,
  link: 5,
  date: 5,
  summary: 5,
  author: 5,
  tags: 5,
}

/** Repeat window for an item selector: fewer is noise, more is a whole-page match. */
const MIN_REPEATS = 3
const MAX_REPEATS = 300

/**
 * A class name that can be spliced into a selector as-is. Utility frameworks emit
 * classes CSS cannot address unescaped (`md:flex`, `w-1/2`, `text-[13px]`), and
 * concatenating one produces a selector that throws when it is parsed.
 */
const PLAIN_CLASS = /^[A-Za-z_-][A-Za-z0-9_-]*$/

/**
 * A short, stable-ish selector for an element: `tag.first-class`, or the bare tag
 * when it carries no usable class. Single-character and `is-`/`has-`/`js-` state
 * classes are skipped, since those flip at runtime and make a brittle selector, as
 * are classes that are not plain CSS identifiers.
 */
function elementSelector(el: TaggedElement): string {
  const tag = String(el.tagName ?? el.name ?? '').toLowerCase()
  const classes = String(el.attribs?.class ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => c.length > 1 && !/^(is|has|js)-/.test(c) && PLAIN_CLASS.test(c))
  return classes.length ? `${tag}.${classes[0]}` : tag
}

/** Keep the first `limit` distinct non-empty values, order preserved. */
function dedupeTop(values: string[], limit: number): string[] {
  const out: string[] = []
  for (const value of values) {
    if (value && !out.includes(value)) out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/** The seed's own answer for a field, as a one-element array (or empty). */
function seeded(seed: FeedTemplate | undefined, field: TapField): string[] {
  const value = seed?.[field]
  return value ? [value] : []
}

/**
 * Suggest ranked candidate selectors for every tap field, from page structure alone.
 *
 * The `item` pass counts `article`/`li`/`div`/`section` elements that contain a
 * link, keyed by `tag.first-class`, and keeps those repeating {@link MIN_REPEATS}
 * to {@link MAX_REPEATS} times, ranked by frequency. The remaining fields are read
 * inside the FIRST element matching the best item selector, so the suggestions are
 * relative to an item exactly like the template engine expects.
 *
 * A `seed` (typically `proposeTemplate(...).template`) is always candidate zero for
 * each field it fills, so the existing heuristic's answer stays the default.
 */
export function suggestCandidates(html: string, seed?: FeedTemplate): TapCandidates {
  const candidates = emptyCandidates()

  let $: ReturnType<typeof load>
  try {
    $ = load(html)
  } catch {
    // Unparseable input: all that can honestly be offered is the seed itself.
    return { ...emptyCandidates(), item: seeded(seed, 'item'), title: seeded(seed, 'title') }
  }

  const counts = new Map<string, number>()
  $('article, li, div, section').each((_, el) => {
    if ($(el).find('a[href]').length === 0) return
    const selector = elementSelector(el)
    // A class-less selector (a bare `div`) matches far too much to be a useful item.
    if (!selector || !selector.includes('.')) return
    counts.set(selector, (counts.get(selector) ?? 0) + 1)
  })

  const repeated = [...counts.entries()]
    .filter(([, n]) => n >= MIN_REPEATS && n <= MAX_REPEATS)
    .sort((a, b) => b[1] - a[1])
    .map(([selector]) => selector)
  candidates.item = dedupeTop([...seeded(seed, 'item'), ...repeated], LIMITS.item)

  const itemSelector = candidates.item[0] ?? seed?.item
  if (!itemSelector) return candidates

  // A seeded selector is whatever the caller had on file, so it may not parse.
  let $item: ReturnType<typeof $>
  try {
    $item = $(itemSelector).first()
  } catch {
    return candidates
  }
  if ($item.length === 0) return candidates

  /** Selectors of every element inside the sample item matching `within`. */
  const inside = (within: string): string[] =>
    $item
      .find(within)
      .map((_i, el) => elementSelector(el))
      .get()

  /** Keep only those of `selectors` that actually match inside the sample item. */
  const present = (selectors: string[]): string[] =>
    selectors.filter((selector) => $item.find(selector).length > 0)

  const titleish: string[] = []
  $item.find("h1,h2,h3,h4,[class*='title'],[class*='headline'],a").each((_, el) => {
    if ($(el).text().trim()) titleish.push(elementSelector(el))
  })
  candidates.title = dedupeTop([...seeded(seed, 'title'), ...titleish], LIMITS.title)

  candidates.link = dedupeTop(
    [...seeded(seed, 'link'), ...present(['a[href]']), ...inside('a[href]')],
    LIMITS.link,
  )

  const dateish = inside(
    "time,[datetime],[class*='date'],[class*='time'],[class*='published'],[class*='meta']",
  )
  candidates.date = dedupeTop(
    [...seeded(seed, 'date'), ...present(['time', '[datetime]']), ...dateish],
    LIMITS.date,
  )

  const summaryish = inside(
    "p,[class*='summary'],[class*='excerpt'],[class*='desc'],[class*='dek']",
  )
  candidates.summary = dedupeTop([...seeded(seed, 'summary'), ...summaryish], LIMITS.summary)

  const authorish = inside("[class*='author'],[class*='byline'],[rel='author']")
  candidates.author = dedupeTop([...seeded(seed, 'author'), ...authorish], LIMITS.author)

  const tagish = inside("[class*='tag'],[class*='category'],[class*='label'],[rel='tag']")
  candidates.tags = dedupeTop([...seeded(seed, 'tags'), ...tagish], LIMITS.tags)

  return candidates
}

/** How many elements a selector matches on the page. 0 for a blank or invalid selector. */
export function countMatches(html: string, selector: string): number {
  if (!selector.trim()) return 0
  try {
    return load(html)(selector).length
  } catch {
    return 0
  }
}
