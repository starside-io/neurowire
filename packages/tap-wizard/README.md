# @neurowire/tap-wizard

Deterministic tap authoring and healing for [Neurowire](https://github.com/starside-io/neurowire). A tap is a per-host `FeedTemplate` (a set of CSS selectors) for a site with no RSS or Atom feed. This package proposes the selectors, previews what each one extracts, and decides whether the result is good enough to save.

**No model, no API key, no network beyond fetching the page once.** Picking the block that repeats once per article is a structural question the DOM already answers. What was missing was not intelligence, it was iteration with feedback.

## Install

```bash
npm install @neurowire/tap-wizard
```

## What it gives you

- **`suggestCandidates(html, seed?)`**: ranked candidate selectors per field (`item`, `title`, `link`, `date`, `summary`, `author`, `tags`), read from page structure. Any `proposeTemplate` result is seeded as candidate zero.
- **`previewTemplate(doc, template)`**: what a candidate template actually extracts, via the real engine (`ingestDocument` with an explicit template), so a preview can never disagree with a fetch.
- **`verifyTemplate(doc, template, options?)`**: the gate. A minimum item count, a title on every item, links that are absolute, mostly on-host, and unique, a date-extraction rate when a `date` selector is claimed, and a nav/footer ancestor probe.
- **`createTapSession(doc)` / `openTapSession(url)`**: the step machine. One fetch per session: choosing a field re-applies against the held document rather than hitting the site again.
- **`autoComplete(session)`**: accept the top candidate for every field, the non-interactive path.

## Usage

```ts
import { openTapSession } from '@neurowire/tap-wizard'

const session = await openTapSession('https://example.com/blog')

for (const step of session.steps) {
  console.log(step.label, session.candidates(step.field))
}

await session.choose('item', 'article.post-card')
const preview = await session.choose('title', 'h2.post-title')
console.log(preview.matched, preview.entries.slice(0, 3))

const report = await session.verify()
if (report.ok) console.log(JSON.stringify(session.template, null, 2))
```

The CLI drives exactly this: `neurowire tap wizard <url>`, `neurowire tap check`, and `neurowire tap heal <path>`.

## License

Apache-2.0
