# HTML page

`@neurowire/web` renders a feed, mesh, or construct into a self-contained HTML news page. The renderer lives in `packages/web/src/render.ts`.

::: info Not a core format
HTML is deliberately **not** a core feed format. It is presentation, not a serializer, so it lives in `@neurowire/web` (`toHtml`) rather than in `@neurowire/core`. This keeps core format-pure and dependency-light. HTML is not part of `serialize()` and the API does not serve it.
:::

| Function | Output |
|---|---|
| `toHtml(feed)` | One self-contained HTML page for a feed. |
| `toConstructHtml(construct, options?)` | A construct overview page (one recap card per mesh). |
| `toConstructPages(construct)` | A full set: an `index.html` overview plus one page per mesh. |

```ts
import { toHtml, toConstructHtml, toConstructPages } from '@neurowire/web'

const page = toHtml(feed)
const overview = toConstructHtml(fetchedConstruct)
const pages = toConstructPages(fetchedConstruct) // [{ filename, html }, ...]
```

## The self-contained invariant

Every page is a single `.html` file that works offline and in CI:

- **No external requests.** All CSS is inline in a `<style>` block, all JavaScript is inline in a `<script>` block, and there are no remote fonts, scripts, or stylesheets.
- **System fonts only.** The theme uses the platform sans and monospace stacks.
- **Dark, neon-glass cyberpunk theme.** A fixed gradient background, animated "wire" header SVG, and glass cards. Colors are CSS variables; the design respects `prefers-color-scheme: dark`.
- **Per-source accents.** Each distinct source is assigned a color pair from a fixed palette (cycled), so cards from the same source share an accent rail and pip.
- **Reduced-motion aware.** Under `prefers-reduced-motion: reduce`, animations and transitions are disabled and cards render in their final state.

The only links in the page point at article URLs (`target="_blank" rel="noopener noreferrer"`) and the canonical Neurowire site in the header and footer.

## Client-side search

Feed pages (`toHtml`) and per-mesh construct pages include a built-in search box that filters entries live in the browser, with no network:

- A `type="search"` input filters the entry list as you type.
- Matching is case-insensitive against a precomputed haystack per entry: title, summary, source name, tags, and author names (read from a `data-search` attribute, not the rendered DOM text).
- A live count (`N of M shown`) appears while a query is active and clears when empty.
- An empty state ("No stories match your filter.") shows when nothing matches.
- Input is debounced (about 120ms). Under reduced-motion the filter applies immediately without the debounce.
- The control is accessible: a visually-hidden label, `aria-controls`, `aria-describedby`, and an `aria-live` count.

## Construct rendering

A construct is a bundle of meshes ("a repo of feeds"). The web package owns the grouped HTML:

- `toConstructHtml(construct, options?)` renders the overview page: one recap card per mesh showing its entry and source counts and a preview of its latest three entries. Pass `options.meshHref` to set where each card links.
- `toConstructPages(construct)` returns the full set to write into one directory: `index.html` (the overview, with each card linking to its mesh page) plus one `toHtml` page per mesh. Mesh filenames are slugified from the mesh name and de-duplicated, so two meshes that slugify the same still get distinct files.

`toConstructHtml` and `toConstructPages` take a `FetchedConstruct` (from `@neurowire/ingest`), which keeps the per-mesh grouping.

## CLI: `neurowire-web`

```
neurowire-web --mesh <file> [--out <file>]
neurowire-web --construct <file> --out <dir> [--combined]
neurowire-web <url> [--out <file>]
```

| Flag | Meaning |
|---|---|
| `-m, --mesh <file>` | Build the page from a mesh (a JSON bundle of named sources). |
| `-c, --construct <file>` | Build from a construct. Writes a repo: an `index.html` overview plus one page per mesh into `--out` (a directory). |
| `--combined` | With `--construct`, write a single combined source-tagged page instead of a multi-page repo. |
| `-o, --out <file\|dir>` | Where to write. A file for a feed/mesh/combined construct, a directory for a multi-page construct. Omit to write to stdout. |

```bash
# A single feed page from a feed/site URL
neurowire-web https://blog.rust-lang.org/feed.xml --out rust.html

# A mesh page
neurowire-web --mesh ai-news.json --out public/index.html

# A construct as a multi-page repo (index + one page per mesh)
neurowire-web --construct daily.json --out public/

# A construct as one combined page
neurowire-web --construct daily.json --combined --out public/index.html
```

In dev: `pnpm page -- --mesh ai-news.json --out public/index.html`.

See [the page guide](/formats/html) and [Output formats](/concepts/output-formats).
