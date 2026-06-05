import type { CheerioAPI } from 'cheerio'
import { load } from 'cheerio'
import { type FeedTemplate, applyTemplate } from './template'

/** A proposed tap plus a preview of what it extracts, so a user can author a tap without DOM-spelunking. */
export interface TemplateProposal {
  template: FeedTemplate
  matched: number
  sampleTitles: string[]
}

const HEADING_SELECTOR = 'h1, h2, h3, h4'
const TITLE_CANDIDATES = ['h2', 'h3', 'h1', 'h4']

/** Hostname for a URL, or undefined when it cannot be parsed. */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

/** A candidate "item" container has a link and a heading-ish title inside it. */
function looksLikeItem($: CheerioAPI, el: unknown): boolean {
  const $el = $(el as never)
  const hasLink = $el.is('a[href]') || $el.find('a[href]').length > 0
  const hasTitle = $el.find(HEADING_SELECTOR).length > 0 || $el.is('a[href]')
  return hasLink && hasTitle
}

/** Build a stable-ish selector for an element from its tag and a single class. */
function selectorFor($: CheerioAPI, el: unknown): string {
  const $el = $(el as never)
  const tag = ($el.prop('tagName') ?? 'div').toLowerCase()
  const className = ($el.attr('class') ?? '').trim()
  if (!className) return tag
  const first = className.split(/\s+/)[0]
  return first ? `${tag}.${first}` : tag
}

/** Collect candidate item selectors, each mapped to the count of matching item-like elements. */
function candidateSelectors($: CheerioAPI): string[] {
  const counts = new Map<string, number>()
  // Containers first, then bare anchors (e.g. a card grid where each card is an <a>).
  $('article, li, div, a[href]').each((_, el) => {
    if (!looksLikeItem($, el)) return
    const selector = selectorFor($, el)
    counts.set(selector, (counts.get(selector) ?? 0) + 1)
  })
  // Plain semantic selectors are worth trying even without a class signature.
  for (const base of ['article']) {
    const n = $(base).filter((_, el) => looksLikeItem($, el)).length
    if (n > 0) counts.set(base, Math.max(counts.get(base) ?? 0, n))
  }
  // Prefer larger matched sets; on ties prefer container selectors over bare anchors.
  const anchorRooted = (selector: string) => selector === 'a' || selector.startsWith('a.')
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || Number(anchorRooted(a[0])) - Number(anchorRooted(b[0])))
    .map(([selector]) => selector)
}

/** Pick the title selector relative to an item: the item itself when it is the link, else a heading. */
function titleSelectorFor($: CheerioAPI, itemSelector: string): string | undefined {
  const $first = $(itemSelector).first()
  if ($first.is('a[href]') && !$first.find(HEADING_SELECTOR).length) return 'a'
  for (const candidate of TITLE_CANDIDATES) {
    if ($first.find(candidate).first().text().trim()) return candidate
  }
  if ($first.find('a[href]').first().text().trim()) return 'a'
  return undefined
}

/** Whether each matched item is itself the anchor (so `link` should be omitted). */
function itemIsLink($: CheerioAPI, itemSelector: string): boolean {
  let total = 0
  let anchors = 0
  $(itemSelector).each((_, el) => {
    total += 1
    if ($(el).is('a[href]')) anchors += 1
  })
  return total > 0 && anchors === total
}

/** A link selector relative to the item, or undefined when the item element is itself the link. */
function linkSelectorFor(
  $: CheerioAPI,
  itemSelector: string,
  titleSelector: string,
): string | undefined {
  if (itemIsLink($, itemSelector)) return undefined
  const $first = $(itemSelector).first()
  // Prefer the anchor wrapping the title, else any anchor in the item.
  if ($first.find(`${titleSelector} a[href]`).length) return `${titleSelector} a`
  return 'a'
}

/** A date selector if items carry an obvious <time> (or date-classed) element, else undefined. */
function dateSelectorFor($: CheerioAPI, itemSelector: string): string | undefined {
  const $first = $(itemSelector).first()
  if ($first.find('time').length) return 'time'
  if ($first.find('[datetime]').length) return '[datetime]'
  return undefined
}

/** The feed title for the page: <title> first, then the first <h1>. */
function feedTitleOf($: CheerioAPI): string | undefined {
  const title = $('title').first().text().trim()
  if (title) return title
  const h1 = $('h1').first().text().trim()
  return h1 || undefined
}

/**
 * Inspect a feed-less HTML page and PROPOSE a FeedTemplate (CSS selectors) for it.
 *
 * Heuristic: find repeated item-like containers (sibling `article`/`li`/class-patterned
 * `div`s that each hold a heading and an `<a href>`), pick the selector whose matched set
 * is largest and consistent, then derive `title`/`link`/`date` selectors relative to the
 * item. The candidate is validated by running `applyTemplate`: a proposal is returned only
 * when it extracts at least one entry, otherwise `undefined`.
 */
export function proposeTemplate(html: string, url: string): TemplateProposal | undefined {
  const $ = load(html)
  const ctx = { sourceUrl: url }

  let best: TemplateProposal | undefined
  for (const itemSelector of candidateSelectors($)) {
    const titleSelector = titleSelectorFor($, itemSelector)
    if (!titleSelector) continue

    const template: FeedTemplate = { item: itemSelector, title: titleSelector }
    const host = hostOf(url)
    if (host) template.host = host
    const feedTitle = feedTitleOf($)
    if (feedTitle) template.feedTitle = feedTitle
    const link = linkSelectorFor($, itemSelector, titleSelector)
    if (link) template.link = link
    const date = dateSelectorFor($, itemSelector)
    if (date) template.date = date

    const feed = applyTemplate($, template, ctx)
    const matched = feed.entries.length
    if (matched === 0) continue
    if (!best || matched > best.matched) {
      best = {
        template,
        matched,
        sampleTitles: feed.entries.slice(0, 5).map((e) => e.title),
      }
    }
  }

  return best
}
