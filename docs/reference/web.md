# @neurowire/web

Static HTML page generator (version 0.5.0). Renders a [`NeurowireFeed`](/reference/core#model)
or a fetched construct into a self-contained, dark-themed HTML news page (inline CSS and
JS, no external assets). This is the library surface; the `neurowire-web` bin wraps it. Not
a React app.

```bash
npm install @neurowire/web
```

Depends on `core`, [`ingest`](/reference/ingest), and [`taps`](/reference/taps).

::: tip Why HTML lives here, not in core
HTML is deliberately not a core output format. Keeping presentation out of
[`@neurowire/core`](/reference/core) leaves it format-pure and dependency-light. The grouped,
multi-page construct view is owned entirely by this package.
:::

## Rendering a feed

```ts
function toHtml(feed: NeurowireFeed): string
```

Render a feed to a single self-contained HTML page (header with brand and counts, a
client-side filter box, one item per entry, footer). Each distinct source gets an accent
color.

## Rendering a construct

A construct keeps its per-mesh grouping. Render it as one overview page, or a full set of
pages (overview plus one per mesh).

```ts
interface ConstructPage {
  filename: string
  html: string
}

interface ConstructHtmlOptions {
  meshHref?: (part: FetchedConstruct['parts'][number], index: number) => string | undefined
}

function toConstructHtml(
  construct: FetchedConstruct,
  options?: ConstructHtmlOptions,
): string

function toConstructPages(construct: FetchedConstruct): ConstructPage[]

function meshSlug(name: string, index: number): string
```

| Export | Description |
|--------|-------------|
| `ConstructPage` | A self-contained page produced from a construct: a relative `filename` (e.g. `index.html` or `ai-news.html`) and its `html`. Write the set into one directory. |
| `ConstructHtmlOptions` | Options for `toConstructHtml`. `meshHref(part, index)` returns the href each recap card links to (or `undefined` for no link). |
| `toConstructHtml(construct, options?)` | Render a single overview page: one recap card per mesh, with counts and a preview of each mesh's latest entries. |
| `toConstructPages(construct)` | Render the full set: an `index.html` overview plus one page per mesh. Mesh filenames are de-duplicated so two meshes that slugify the same get distinct files. |
| `meshSlug(name, index)` | Slugify a mesh name into a filename stem, falling back to `mesh-<n>` (1-based) when empty. |

`toConstructHtml` accepts a [`FetchedConstruct`](/reference/ingest#constructs) (from
`fetchConstruct`), and `toConstructPages` returns one `ConstructPage` per file to write.

## Style assets

```ts
const STYLE: string
const WIRE: string
```

| Export | Description |
|--------|-------------|
| `STYLE` | The inlined CSS for a page (embedded in a `<style>` block). |
| `WIRE` | The inline "wire" SVG decoration used in the page header. |

## Usage

```ts
import { fetchMesh } from '@neurowire/ingest'
import { toHtml } from '@neurowire/web'
import { writeFileSync } from 'node:fs'

const feed = await fetchMesh(mesh)
writeFileSync('out.html', toHtml(feed))
```

For a construct:

```ts
import { fetchConstruct, createConfigMeshResolver } from '@neurowire/ingest'
import { toConstructPages } from '@neurowire/web'
import { writeFileSync } from 'node:fs'

const fetched = await fetchConstruct(construct, {
  resolver: createConfigMeshResolver(),
})
for (const page of toConstructPages(fetched)) {
  writeFileSync(`dist/${page.filename}`, page.html)
}
```

::: tip CLI
`pnpm page -- --mesh <file> --out <html>` runs the generator from a mesh or feed URL. The
`neurowire-web` bin can also emit a combined single page (`--combined`) or the multi-page
construct set.
:::
