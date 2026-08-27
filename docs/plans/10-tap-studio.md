# Epic 10: Tap Studio (deterministic tap authoring and repair)

## Goal

Kill the two walls that cap the taps concept: **authoring** (someone has to
hand-write CSS selectors per site) and **rot** (sites redesign and taps break
silently). Do it with **no AI in the loop**: heuristics propose, a step-by-step
walkthrough lets a human confirm, and a deterministic verifier decides whether a
tap is good.

- `neurowire tap studio <url>`: an interactive terminal walkthrough. It analyzes
  the page, suggests candidate selectors per field, previews what each choice
  extracts, and writes a verified tap.
- `neurowire tap check`: does a registered tap still match? Deterministic, no
  network beyond the fetch, CI-safe, exits non-zero on breakage.
- `neurowire tap repair <tap>`: a site changed. Re-run the analyzer against the
  live page, show what the old selectors used to match versus what the
  candidates match now, and let a human pick the replacement.

**Any LLM involvement lives in Epic 13 (MCP)**, where an agent drives these same
deterministic primitives as tools. The library and CLI never call a model, never
need an API key, and never depend on network weather beyond fetching the page.

## Why this is not an AI problem

Picking a repeating block and the title inside it is a *structural* question the
DOM already answers: find elements that repeat, contain a link, and sit under a
common ancestor. `proposeTemplate` in ingest already does a first pass. What was
missing is not intelligence, it is **iteration with feedback**: candidates,
a preview of what each one extracts, and a way to correct one field without
restarting.

That machinery already exists and is proven in production. `neurowire-app` ships
a working wizard (`src/components/TapWizard.tsx` plus
`src/lib/engine/tapHelper.ts`): six steps, candidate chips per field, and a live
preview that re-runs on every pick. This epic **lifts that logic out of the app
into the library** so the CLI, the app, and later the MCP server all share one
implementation instead of three.

## Package design

New workspace package `@neurowire/tap-studio`.

- Runtime deps: `@neurowire/core`, `@neurowire/ingest`, `cheerio`. **No LLM SDK,
  no HTTP client beyond ingest's**, no API keys anywhere.
- Chain position: `core` <- `ingest` <- `tap-studio` <- (`cli`, and later `mcp`).
  `taps` and `taps-pack` are untouched.
- Everything except the fetch is pure and synchronous over an HTML string, so it
  tests against saved fixtures with no network.

### 1. Candidate suggestion (`suggest.ts`)

Port of `buildCandidates` from the app, generalized and tested.

```ts
interface TapCandidates {
  item: string[]; title: string[]; link: string[]
  date: string[]; summary: string[]; author: string[]; tags: string[]
}
function suggestCandidates(html: string, seed?: FeedTemplate): TapCandidates
```

How it picks, all of it structural:

- **item**: count `article, li, div, section` elements that contain `a[href]`,
  keyed by a short stable selector (`tag.first-class`, skipping `is-`/`has-`/`js-`
  utility classes). Keep those repeating 3 to 300 times, ranked by frequency.
- **per-field**, read inside the first matched item: headings and
  `[class*=title|headline]` for title, `a[href]` for link, `time`/`[datetime]`/
  `[class*=date|time|published]` for date, `p`/`[class*=summary|excerpt|dek]`
  for summary, `[class*=tag|category|label]`/`[rel=tag]` for tags.
- Any `proposeTemplate` result is seeded first so the heuristic's own answer is
  always candidate zero.

### 2. Preview (`preview.ts`)

```ts
interface TapPreview {
  matched: number
  entries: { title: string; link: string; date: string; summary: string; tags: string[] }[]
  error?: string
}
function previewTemplate(doc: RawDocument, template: FeedTemplate): Promise<TapPreview>
```

Runs the real `ingestDocument` with the candidate template, so the preview is
the actual engine output, never a second implementation that could disagree.
With only `item` chosen and no `title` yet, it reports the raw match count so
step one gives feedback before a title exists (the app's behavior, kept).

### 3. Verification gate (`verify.ts`)

The deterministic judgment, and the thing that makes the whole epic safe:

```ts
interface VerifyReport {
  score: number            // 0..1
  matched: number
  checks: { name: string; ok: boolean; detail?: string }[]
  ok: boolean              // score >= threshold and no hard failure
}
function verifyTemplate(doc: RawDocument, template: FeedTemplate): Promise<VerifyReport>
```

Checks: a minimum item count (default 3); every item has a non-empty title;
links resolve absolute and are on-host or declared-host; links are unique (a
selector that grabs one nav anchor per item fails here); date extraction rate
when a date selector is claimed; and a **nav/footer probe**, that matched items
share a near common ancestor rather than being scattered across the chrome.

Nothing writes a tap without passing this gate: not the wizard, not repair, not
the MCP tool in Epic 13.

### 4. Session state (`session.ts`)

A small pure state machine so the terminal walkthrough, the web wizard, and an
agent can drive the same flow:

```ts
const s = createTapSession(doc)          // analyzes once
s.steps                                   // ordered field steps, required flags
s.candidates('title')                     // suggestions for a field
await s.choose('title', 'h3.entry-title') // record a pick, returns fresh preview
s.template                                // the template so far
await s.verify()                          // the gate
```

One fetch per session. Choosing a field never refetches; the document is held
and re-applied. That is what makes the walkthrough feel instant and keeps a
noisy site from being hammered.

## CLI surface

```
neurowire tap studio <url> [-o file] [--yes]
neurowire tap check [path|--all] [--json]
neurowire tap repair <path> [--yes]
```

- **studio**: renders each step with numbered candidates, a `matched: N` line,
  and a 3-entry sample. Type a number to accept, paste a selector to override,
  Enter to skip an optional field. Refuses to save a template that fails
  `verifyTemplate`, printing which checks failed. `--yes` accepts every top
  candidate non-interactively, which is the "just do it" path for a site the
  heuristics already handle, and still refuses on a failed gate.
- **check**: LLM-free and network-cheap, so it belongs in CI. Reports a health
  table (healthy / degraded / broken) and exits 1 on any broken tap. This is
  what stops `taps-pack` rotting silently.
- **repair**: shows the old template's report beside fresh candidates, marks
  which fields still match, and walks only the broken ones. Writes user taps
  back to `~/.config/neurowire/taps/` with a `.bak`. Bundled taps in
  `taps`/`taps-pack` are code, not user files, so repair prints the proposed
  JSON diff and never writes into the repo or `node_modules`.

`tap doctor` stays as the existing one-shot proposal printer; `studio` is its
interactive successor and `doctor` may become an alias later.

## Reuse in `neurowire-app`

The app's `tapHelper.ts` becomes a thin wrapper: keep `assertPublicUrl` (the
SSRF guard is app policy and stays there), delegate `analyzeSource` and
`previewTap` to `@neurowire/tap-studio`, and delete the duplicated candidate
logic. `TapWizard.tsx` keeps its UI and calls the same session API. One engine,
two front ends, and the app stops drifting from the library.

## Non-goals

- **No LLM anywhere in this package.** Not for suggestion, not for repair, not
  behind a flag. Agent-driven authoring is Epic 13's job, through these tools.
- No autonomous background repair daemon. `check` reports; a human runs `repair`.
- No headless browser. Static HTML only, so a JS-rendered site remains out of
  scope (and `check` will honestly report it as unmatched).
- No bundled-tap auto-editing; repo taps get a printed diff.

## Dependencies

None. Fully parallel to Epics 11 and 12. Epic 13 consumes it.

## Files touched

| File | Change |
|------|--------|
| `packages/tap-studio/package.json`, `tsconfig.json`, `tsup.config.ts` | new package |
| `packages/tap-studio/src/suggest.ts` + test | candidate selectors from structure |
| `packages/tap-studio/src/preview.ts` + test | preview via the real engine |
| `packages/tap-studio/src/verify.ts` + test | the deterministic gate |
| `packages/tap-studio/src/session.ts` + test | the pure step machine |
| `packages/tap-studio/src/index.ts` | exports |
| `packages/cli/src/tap-studio.ts` + test | prompt rendering, pure input parsing |
| `packages/cli/src/index.ts` | `tap studio` / `tap check` / `tap repair` routing |
| `vitest.config.ts` | thresholds for `tap-studio` (95/95/95: it is pure and fixture-driven) |
| `docs/guide/taps.md`, `docs/concepts/taps.md` | authoring and repair workflow |
| `docs/reference/tap-studio.md` | new reference page; nav entry |
| `README.md` | package table row |

## Steps

1. `suggest.ts` + `verify.ts` against saved-HTML fixtures, reusing the fixture
   style in ingest's autodetect tests. Both are useful standalone.
2. `preview.ts` and `session.ts` on top.
3. CLI `tap studio` with a `--yes` non-interactive path (that path is what the
   tests drive; interactive prompting stays a thin uncovered shell).
4. `tap check`, then `tap repair`.
5. Point `neurowire-app`'s `tapHelper.ts` at the package, delete the duplicate.
6. Docs, changelog, `pnpm docs:build`.

## Tests

- Suggestion: a fixture with a clean article list yields the right `item` first;
  a nav-heavy fixture does not rank the nav; utility classes are skipped.
- Verification: a good template passes; one whose links are all identical fails
  the uniqueness check; a nav-matching template fails the ancestor probe; the
  minimum-count boundary.
- Preview: matches `ingestDocument` output exactly for the same template;
  item-only returns a count with no entries.
- Session: choosing a field never refetches (assert one fetch per session);
  skipping optional fields; `verify` reflects the current template.
- CLI: `--yes` on a fixture-backed page writes a tap that then serves the feed;
  a page the heuristics cannot handle exits non-zero with the failed checks
  listed, and writes nothing.
- `check`: healthy/degraded/broken classification, exit codes, `--json` shape.

## Risks

- **Heuristics miss on unusual markup.** That is precisely why the walkthrough
  exists: the human is the fallback, not a model. `--yes` is opt-in.
- **Sites needing JS.** Out of scope and reported honestly rather than guessed
  at; a wrong tap is worse than a missing one.
- **Duplication with the app during migration.** Mitigate by porting the app's
  logic verbatim first (tests pinned to the same fixtures), then swapping the
  app over in the same change.

## Acceptance

- `neurowire tap studio <feed-less site>` produces a tap that `neurowire <url>
  --taps <file>` then serves correctly, with zero model calls and no API key.
- Breaking a fixture's markup makes `tap check` exit 1 and `tap repair` walk the
  broken field to a passing template.
- `neurowire-app`'s wizard runs on the shared package with its candidate logic
  deleted, behavior unchanged.
- All tests offline; thresholds green; docs build passes.
