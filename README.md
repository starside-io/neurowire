# Neurowire

Turn any blog into a modern feed. Point Neurowire at a website that lists articles, an RSS feed, or an Atom feed, and get back **Atom** plus three more formats. Everything is normalized to one canonical model, so the CLI, API, and UI all render the same data.

## Packages

| Package | What it does |
|---------|--------------|
| `@neurowire/core` | Canonical model + serializers: Atom, JSON Feed 1.1, Markdown, and the compact Neurowire Feed (`nwf`). |
| `@neurowire/ingest` | Fetch + detect + parse: RSS / Atom / JSON Feed, plus HTML auto-detect with a per-site template fallback. |
| `@neurowire/taps` | Curated "taps" (`FeedTemplate`s) for sites worth following that ship no RSS/Atom feed (e.g. `claude.com/blog`). Bring your own via `NEUROWIRE_TAPS` or `--taps`. |
| `@neurowire/cli` | `neurowire <url>` to print a feed in the terminal or emit any format. |
| `@neurowire/api` | Tiny HTTP service: `GET /feed?url=...&format=atom`. |
| `@neurowire/web` | Renders a feed or mesh to a self-contained HTML news page (`neurowire-web` bin + `toHtml`), for scheduled static publishing. |

## Output formats

- `atom`: Atom 1.0 (`application/atom+xml`), the primary output.
- `json`: JSON Feed 1.1 (`application/feed+json`).
- `md`: Markdown digest.
- `nwf`: Neurowire Feed, a compact line format (interned authors, tags and sources, relative links, delta timestamps). Round-trippable, see [the nwf format](#the-nwf-format) below.

A styled **HTML news page** for publishing is a separate concern handled by `@neurowire/web` (see [Publishing a page](#publishing-a-page)), not a core feed format.

## The nwf format

`nwf` (Neurowire Feed) is a compact, line-oriented format: lines are LF-separated, cells within a line are TAB-separated.

```
NWF1                                                  magic + version
F  id  title  home  self  updatedEpoch  authorRefs    feed header
A  author0  author1  ...                              authors dictionary (interned)
T  tag0  tag1  ...                                     tags dictionary (interned)
S  source0  source1  ...                              sources dictionary (interned; used by meshes)
B  https://blog.example.com/posts/                     shared link prefix
E  id  delta  link  authorRefs  tagRefs  title  summary  sourceRef   one line per entry
```

It stays small by interning authors, tags and sources (referenced by index), storing each link relative to `B`, and storing each entry's date as a delta in seconds before the feed's `updated`. `authorRefs` / `tagRefs` are comma-separated indices into `A` / `T`; `sourceRef` is a single index into `S` (the per-source label, set when merging a [mesh](#meshes)). Text cells escape backslash, TAB, CR and LF. It round-trips back to the model via `fromNwf`, and the `sourceRef` column is appended last so older documents without it still parse.

## Meshes

A **mesh** bundles many sources into one named feed. Define it as JSON:

```json
{
  "name": "AI News",
  "sources": [
    { "name": "Claude Code Releases", "url": "https://github.com/anthropics/claude-code/releases.atom" },
    { "name": "Claude Blog", "url": "https://claude.com/blog" }
  ]
}
```

Then run `neurowire --mesh ai-news.json --format atom`. Sources are fetched in parallel, every entry is tagged with its source (preserved in all four formats, including `nwf`), and the result is de-duplicated and sorted newest first. See [examples/ai-news.mesh.json](examples/ai-news.mesh.json). The `Mesh` type and `mergeFeeds` live in `@neurowire/core`; `fetchMesh` lives in `@neurowire/ingest`.

Serve a mesh from the API too: `GET /mesh?src=<name>&format=nwf` resolves named meshes from `~/.config/neurowire/meshes/` (plus a bundled `ai-news`), and `POST /mesh` takes a mesh JSON body. Because `validate` accepts a URL, you can check the running API's output directly:

```bash
pnpm api
neurowire validate 'http://localhost:8787/mesh?src=ai-news&format=nwf'
```

## Publishing a page

`@neurowire/web` turns a feed or mesh into a single self-contained, styled HTML page (all CSS inline, no external assets, no JS framework), ideal for a static, scheduled publish:

```bash
neurowire-web --mesh ai-news.json --out public/index.html              # built binary
pnpm page -- --mesh examples/ai-news.mesh.json --out public/index.html # in dev
```

Drive it from any scheduler. [.github/workflows/news.yml](.github/workflows/news.yml) is one example: it regenerates the page (daily and on demand) and deploys to GitHub Pages (enable Pages with Source: GitHub Actions).

## Develop

```bash
pnpm install
pnpm build        # build all packages (topological order)
pnpm test         # run unit tests
pnpm cli <url>          # run the CLI in dev (positional argument)
pnpm validate <file|url> # validate an nwf document
pnpm page -- --mesh <file> --out <html>   # generate an HTML news page
pnpm api                # start the API in dev
```

In dev, pass CLI flags after `--` so pnpm does not intercept them (pnpm reads `-f` as its own `--filter`):

```bash
pnpm cli -- --mesh examples/ai-news.mesh.json -f atom
```

In production you run the built binary directly, where no `--` is needed:

```bash
node packages/cli/dist/index.js --mesh examples/ai-news.mesh.json -f atom
```

Requires Node 20+.
