# @neurowire/tap-wizard

Deterministic tap authoring and healing (version 0.1.0). Candidate selectors from page
structure, a preview through the real engine, and a verification gate no tap is written
without. See [taps](/concepts/taps#authoring-a-tap-with-the-wizard).

```bash
npm install @neurowire/tap-wizard
```

Depends on `core` and [`ingest`](/reference/ingest). It does **not** depend on
[`@neurowire/taps`](/reference/taps): the wizard authors taps, it does not carry them.

::: tip No model in the loop
Nothing here calls an LLM, behind a flag or otherwise, and nothing needs an API key. The
only network call in the package is the single page fetch in `openTapSession`.
:::

## Candidate suggestion

```ts
const TAP_FIELDS: readonly ['item', 'title', 'link', 'date', 'summary', 'author', 'tags']
type TapField = (typeof TAP_FIELDS)[number]
type TapCandidates = Record<TapField, string[]>

function suggestCandidates(html: string, seed?: FeedTemplate): TapCandidates
function emptyCandidates(): TapCandidates
function countMatches(html: string, selector: string): number
```

`suggestCandidates` ranks selectors per field, best first, purely from structure:

- **`item`**: `article`/`li`/`div`/`section` elements containing an `a[href]`, keyed as
  `tag.first-class` and ranked by repeat count. Only selectors repeating 3 to 300 times
  qualify; class-less selectors are dropped (a bare `div` matches far too much),
  `is-` / `has-` / `js-` state classes are skipped when keying, and so are classes that
  are not plain CSS identifiers (`md:flex`, `w-1/2`, `text-[13px]`), which would produce
  a selector that throws when parsed.
- **every other field**: read inside the FIRST element matching the best item selector,
  so a candidate is relative to an item exactly as [`applyTemplate`](/reference/ingest)
  expects.

A `seed` (typically [`proposeTemplate(...).template`](/reference/ingest)) is candidate zero
for each field it fills. Per-field caps: 6 for `item` and `title`, 5 for the rest.

`countMatches` returns 0 for a blank or invalid selector rather than throwing.

## Preview

```ts
interface TapPreviewEntry {
  title: string; link: string; date: string
  summary: string; author: string; tags: string[]
}

interface TapPreview {
  matched: number
  entries: TapPreviewEntry[]
  error?: string
}

function previewTemplate(doc: RawDocument, template: FeedTemplate): Promise<TapPreview>
```

Runs `ingestDocument` with an explicit template, which short-circuits every other
resolution step, so the preview IS the engine output and cannot drift from what a real
fetch would produce. It never throws: a bad selector comes back as `error`.

With `item` chosen but `title` still blank there is nothing to extract, so `matched`
reports the raw item match count and `entries` is empty. That is what gives step one of
the walkthrough feedback before a title exists.

## The verification gate

```ts
interface VerifyCheck { name: string; ok: boolean; detail?: string }

interface VerifyReport {
  score: number      // share of applicable checks that passed, 0..1
  matched: number
  checks: VerifyCheck[]
  ok: boolean        // score >= threshold and no hard check failed
}

interface VerifyOptions {
  minItems?: number      // default 3
  minTitleRate?: number  // default 0.8
  minDateRate?: number   // default 0.5
  minHostRate?: number   // default 0.5
  threshold?: number     // default 0.75
}

function verifyTemplate(
  doc: RawDocument,
  template: FeedTemplate,
  options?: VerifyOptions,
): Promise<VerifyReport>
```

The checks, and which are hard failures, are listed under
[the verification gate](/concepts/taps#the-verification-gate). A template whose selector
cannot be applied at all comes back with a single failed `extract` check and a score of 0.

## The session

```ts
interface TapStep { field: TapField; label: string; required: boolean; hint: string }
const TAP_STEPS: readonly TapStep[]

interface TapSession {
  readonly doc: RawDocument
  readonly steps: readonly TapStep[]
  readonly template: FeedTemplate
  readonly seed: FeedTemplate | undefined
  candidates(field: TapField): string[]
  choose(field: TapField, selector: string): Promise<TapPreview>
  preview(): Promise<TapPreview>
  verify(options?: VerifyOptions): Promise<VerifyReport>
}

function createTapSession(doc: RawDocument): TapSession
function openTapSession(url: string, options?: OpenTapSessionOptions): Promise<TapSession>
function autoComplete(session: TapSession): Promise<TapPreview>
```

`createTapSession` analyzes the page once (`proposeTemplate` for the seed,
`suggestCandidates` for the alternatives) and prefills `host` and `feedTitle`, neither of
which is a selector a human should have to type. `item` and `title` start blank.

**A pick never refetches.** The document is held for the life of the session and
re-applied on every `choose`, which is what keeps the walkthrough instant and a noisy site
from being hammered. `openTapSession` is the only function in the package that touches the
network, exactly once.

`choose` with a blank selector clears an optional field and leaves a required one blank.
`template` and `candidates()` hand out copies, so a caller cannot mutate the session.

```ts
import { openTapSession } from '@neurowire/tap-wizard'

const session = await openTapSession('https://example.com/blog')
await session.choose('item', session.candidates('item')[0])
const preview = await session.choose('title', 'h2.post-title')

const report = await session.verify()
if (report.ok) console.log(JSON.stringify(session.template, null, 2))
```

`autoComplete` accepts the top candidate for every field the page offers, skipping the
ones with no suggestion. It is what the CLI's `--yes` runs, and it decides nothing about
saving: that stays the gate's call.
