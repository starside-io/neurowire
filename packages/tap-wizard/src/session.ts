import {
  type FeedTemplate,
  type RawDocument,
  fetchDocument,
  proposeTemplate,
} from '@neurowire/ingest'
import { load } from 'cheerio'
import { type DraftTemplate, type TapPreview, previewTemplate } from './preview'
import { type TapField, suggestCandidates } from './suggest'
import { type VerifyOptions, type VerifyReport, verifyTemplate } from './verify'

/** One field of the walkthrough, in the order a human is asked about it. */
export interface TapStep {
  field: TapField
  label: string
  required: boolean
  hint: string
}

/** The ordered walkthrough. `item` and `title` are the only fields a tap cannot omit. */
export const TAP_STEPS: readonly TapStep[] = [
  {
    field: 'item',
    label: 'Article block',
    required: true,
    hint: 'Pick the block that repeats once for each article on the page.',
  },
  {
    field: 'title',
    label: 'Title',
    required: true,
    hint: 'The headline text inside each block.',
  },
  {
    field: 'link',
    label: 'Link',
    required: false,
    hint: "The article link. Often the title's own anchor, leave blank to use it.",
  },
  {
    field: 'date',
    label: 'Date',
    required: false,
    hint: 'The publish date or time, if the page shows one.',
  },
  {
    field: 'summary',
    label: 'Summary',
    required: false,
    hint: 'A short description or excerpt, if present.',
  },
  {
    field: 'author',
    label: 'Author',
    required: false,
    hint: 'The byline, if the page shows one.',
  },
  {
    field: 'tags',
    label: 'Tags',
    required: false,
    hint: 'Category or tag labels, if present.',
  },
]

/**
 * A tap being authored against one held document. The page is analyzed once at
 * creation and never refetched: every pick is re-applied against the document in
 * memory, which is what keeps the walkthrough instant and the publisher unbothered.
 */
export interface TapSession {
  /** The document the whole session runs against. */
  readonly doc: RawDocument
  readonly steps: readonly TapStep[]
  /** The template as chosen so far. `item`/`title` are blank until picked. */
  readonly template: DraftTemplate
  /** The heuristic's own first answer, seeded as candidate zero. Undefined when it found nothing. */
  readonly seed: FeedTemplate | undefined
  /** Ranked suggestions for a field. */
  candidates(field: TapField): string[]
  /** Record a pick (blank clears an optional field) and return a fresh preview. */
  choose(field: TapField, selector: string): Promise<TapPreview>
  /** What the template extracts right now. */
  preview(): Promise<TapPreview>
  /** The deterministic gate over the current template. */
  verify(options?: VerifyOptions): Promise<VerifyReport>
}

/** The page's own `<title>`, used as the tap's feed title when the page has one. */
function pageTitle(html: string): string | undefined {
  try {
    return load(html)('title').first().text().trim() || undefined
  } catch {
    return undefined
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

/**
 * Start a tap-authoring session over an already-fetched document.
 *
 * Analysis happens exactly once here: `proposeTemplate` supplies the seed and
 * `suggestCandidates` ranks the alternatives. `host` and `feedTitle` are prefilled
 * from the page, since neither is a selector a human should have to type.
 */
export function createTapSession(doc: RawDocument): TapSession {
  const seed = proposeTemplate(doc.body, doc.url)?.template
  const candidates = suggestCandidates(doc.body, seed)

  const template: DraftTemplate = { item: '', title: '' }
  const host = seed?.host ?? hostOf(doc.url)
  if (host) template.host = host
  const feedTitle = seed?.feedTitle ?? pageTitle(doc.body)
  if (feedTitle) template.feedTitle = feedTitle

  const required = new Set(TAP_STEPS.filter((step) => step.required).map((step) => step.field))

  return {
    doc,
    steps: TAP_STEPS,
    seed,
    get template() {
      return { ...template }
    },
    candidates(field: TapField): string[] {
      return [...candidates[field]]
    },
    async choose(field: TapField, selector: string): Promise<TapPreview> {
      const value = selector.trim()
      if (!value && !required.has(field)) {
        delete (template as Partial<DraftTemplate>)[field]
      } else {
        template[field] = value
      }
      return previewTemplate(doc, template)
    },
    preview(): Promise<TapPreview> {
      return previewTemplate(doc, template)
    },
    verify(options?: VerifyOptions): Promise<VerifyReport> {
      return verifyTemplate(doc, template, options)
    },
  }
}

export interface OpenTapSessionOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * Fetch a page once and open a session over it. This is the only network call the
 * package makes: everything downstream reads the held document.
 */
export async function openTapSession(
  url: string,
  options: OpenTapSessionOptions = {},
): Promise<TapSession> {
  const doc = await fetchDocument(url, options)
  return createTapSession(doc)
}

/**
 * Accept the top candidate for every field, skipping any with no suggestion. The
 * non-interactive path: it produces a template but decides nothing about saving it,
 * which stays the verification gate's call.
 */
export async function autoComplete(session: TapSession): Promise<TapPreview> {
  let preview: TapPreview = { matched: 0, entries: [], error: 'no item selector yet' }
  for (const step of session.steps) {
    const top = session.candidates(step.field)[0]
    if (!top) continue
    preview = await session.choose(step.field, top)
  }
  return preview
}
