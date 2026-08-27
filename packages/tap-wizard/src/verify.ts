import type { RawDocument } from '@neurowire/ingest'
import { load } from 'cheerio'
import { type DraftTemplate, type TapPreview, previewTemplate } from './preview'
import { countMatches } from './suggest'

/** One deterministic assertion about what a template extracts. */
export interface VerifyCheck {
  name: string
  ok: boolean
  detail?: string
}

/** The verdict on a candidate template. Nothing writes a tap without `ok`. */
export interface VerifyReport {
  /** Share of applicable checks that passed, 0..1. */
  score: number
  matched: number
  checks: VerifyCheck[]
  /** `score >= threshold` and no hard check failed. */
  ok: boolean
}

export interface VerifyOptions {
  /** Fewest items a healthy listing page yields. Default 3. */
  minItems?: number
  /** Lowest acceptable share of matched items carrying title text. Default 0.8. */
  minTitleRate?: number
  /** Lowest acceptable date-extraction rate when a `date` selector is claimed. Default 0.5. */
  minDateRate?: number
  /** Lowest acceptable share of links on the page's own host. Default 0.5. */
  minHostRate?: number
  /** Lowest passing score. Default 0.75. */
  threshold?: number
}

/** A check plus whether failing it alone sinks the template. */
interface GatedCheck extends VerifyCheck {
  hard: boolean
}

/** Page chrome: matched items living in here are navigation, not articles. */
const CHROME_SELECTOR = 'nav, footer, aside, [role=navigation], [role=banner], [role=contentinfo]'

/** Share of items that must hang off one parent for the ancestor probe to pass. */
const MIN_SIBLING_RATE = 0.6

/**
 * Share of items that may sit in page chrome before the selector is judged to be
 * scraping the navigation. A listing page that also renders a "related posts" aside
 * reusing the article class is normal, a selector that is mostly nav links is not.
 */
const MAX_CHROME_RATE = 0.5

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

/** How many of the raw item matches yield non-empty title text. */
function countTitled(html: string, itemSelector: string, titleSelector: string): number {
  if (!titleSelector.trim()) return 0
  try {
    const $ = load(html)
    let titled = 0
    $(itemSelector).each((_, el) => {
      if ($(el).find(titleSelector).first().text().trim()) titled += 1
    })
    return titled
  } catch {
    return 0
  }
}

/**
 * The nav/footer probe: matched items should be siblings under one container, not
 * scattered across the page chrome. A selector that rakes in the nav bar fails here
 * even when it happens to produce plenty of titled links.
 */
function probeAncestor(html: string, itemSelector: string): GatedCheck {
  let total = 0
  let inChrome = 0
  const parents = new Map<unknown, number>()

  try {
    const $ = load(html)
    $(itemSelector).each((_, el) => {
      total += 1
      if ($(el).parents(CHROME_SELECTOR).length > 0) inChrome += 1
      const parent = $(el).parent().get(0)
      if (parent) parents.set(parent, (parents.get(parent) ?? 0) + 1)
    })
  } catch {
    return { name: 'ancestor', ok: false, detail: 'could not inspect the page', hard: true }
  }

  if (total === 0) {
    return { name: 'ancestor', ok: false, detail: 'nothing matched', hard: true }
  }
  if (inChrome / total > MAX_CHROME_RATE) {
    return {
      name: 'ancestor',
      ok: false,
      detail: `${inChrome}/${total} inside nav, footer, or aside`,
      hard: true,
    }
  }

  const dominant = Math.max(...parents.values())
  const ok = dominant / total >= MIN_SIBLING_RATE
  return {
    name: 'ancestor',
    ok,
    detail: `${dominant}/${total} share a parent`,
    hard: true,
  }
}

/** Build the link-shape checks (absolute, on-host, unique) over the extracted entries. */
function linkChecks(
  preview: TapPreview,
  doc: RawDocument,
  template: DraftTemplate,
  minHostRate: number,
): GatedCheck[] {
  const links = preview.entries.map((entry) => entry.link)
  const absolute = links.filter((link) => /^https?:\/\//i.test(link))
  const host = template.host ?? hostOf(doc.url)
  const onHost = absolute.filter((link) => hostOf(link) === host)
  const unique = new Set(links).size

  return [
    {
      name: 'links',
      ok: links.length > 0 && absolute.length === links.length,
      detail: `${absolute.length}/${links.length} absolute`,
      hard: true,
    },
    {
      name: 'link-host',
      ok: links.length > 0 && onHost.length / links.length >= minHostRate,
      detail: `${onHost.length}/${links.length} on ${host ?? 'the page host'}`,
      hard: false,
    },
    {
      name: 'unique-links',
      ok: links.length > 0 && unique === links.length,
      detail: `${unique}/${links.length} unique`,
      hard: true,
    },
  ]
}

/**
 * Decide, deterministically, whether a template is good enough to save.
 *
 * Runs the real engine once (via {@link previewTemplate}) and then asserts: a
 * minimum item count, a title on every matched item, links that resolve absolute,
 * are mostly on-host, and are unique (a selector that grabs the same nav anchor per
 * item dies here), a date-extraction rate when a `date` selector is claimed, and the
 * nav/footer ancestor probe. No model, no network, same answer every run.
 */
export async function verifyTemplate(
  doc: RawDocument,
  template: DraftTemplate,
  options: VerifyOptions = {},
): Promise<VerifyReport> {
  const minItems = options.minItems ?? 3
  const minTitleRate = options.minTitleRate ?? 0.8
  const minDateRate = options.minDateRate ?? 0.5
  const minHostRate = options.minHostRate ?? 0.5
  const threshold = options.threshold ?? 0.75

  const preview = await previewTemplate(doc, template)
  if (preview.error) {
    return {
      score: 0,
      matched: 0,
      checks: [{ name: 'extract', ok: false, detail: preview.error }],
      ok: false,
    }
  }

  const rawItems = countMatches(doc.body, template.item)
  const titled = countTitled(doc.body, template.item, template.title)

  const gated: GatedCheck[] = [
    {
      name: 'items',
      ok: preview.matched >= minItems,
      detail: `${preview.matched} extracted, ${minItems} needed`,
      hard: true,
    },
    {
      // A rate, not a clean sweep: `applyTemplate` skips a title-less item, so one
      // promo card sharing the article class is not a broken tap.
      name: 'titles',
      ok: rawItems > 0 && titled / rawItems >= minTitleRate,
      detail: `${titled}/${rawItems} non-empty`,
      hard: true,
    },
    ...linkChecks(preview, doc, template, minHostRate),
    probeAncestor(doc.body, template.item),
  ]

  if (template.date) {
    const dated = preview.entries.filter((entry) => entry.date).length
    gated.push({
      name: 'dates',
      ok: preview.entries.length > 0 && dated / preview.entries.length >= minDateRate,
      detail: `${dated}/${preview.entries.length} parsed`,
      hard: false,
    })
  }

  const passed = gated.filter((check) => check.ok).length
  const score = passed / gated.length
  const hardFailure = gated.some((check) => check.hard && !check.ok)

  return {
    score,
    matched: preview.matched,
    checks: gated.map(({ hard: _hard, ...check }) => check),
    ok: score >= threshold && !hardFailure,
  }
}
