# @neurowire/ingest

Fetch, detect, and parse layer for [Neurowire](https://github.com/starside-io/neurowire). It turns a URL or a raw document into the canonical [`@neurowire/core`](https://www.npmjs.com/package/@neurowire/core) model: RSS, Atom, RDF, and JSON Feed, plus HTML auto-detection with a CSS-template fallback.

## Install

```bash
npm install @neurowire/ingest
```

## What it gives you

- **`fetchFeed(url, options?)`**: fetch a URL and return a `NeurowireFeed`, whatever the source format.
- **`fetchMesh(mesh, options?)`**: fetch every source in a mesh in parallel and merge them into one feed.
- **`ingestDocument(...)`**: parse an already-fetched document. Resolution order is explicit template, then discovered feed link, then registry tap (by host), then heuristic auto-detect.
- **Parsers**: `parseFeedString`, `parseRss`, `parseAtom`, `parseRdf`, `parseJsonFeed`.
- **HTML**: `autodetect`, `discoverFeedLink`, and the CSS-template engine (`applyTemplate`, `FeedTemplate`, `FeedTemplateSchema`).
- **Template registry**: `registerTemplate`, `findTemplate`, `listTemplates`. Curated per-host templates ship in [`@neurowire/taps`](https://www.npmjs.com/package/@neurowire/taps).
- **Utilities**: `resolveUrl`, `normDate`, `stripHtml`, `finalizeFeed`, and types `FeedDraft` / `ParseContext`.

## Usage

```ts
import { fetchFeed, fetchMesh } from '@neurowire/ingest'

const feed = await fetchFeed('https://example.com/blog')

const mesh = await fetchMesh({
  name: 'AI News',
  sources: [
    { name: 'Claude Blog', url: 'https://claude.com/blog' },
    { name: 'Releases', url: 'https://github.com/anthropics/claude-code/releases.atom' },
  ],
})
```

Pair it with `serialize` from `@neurowire/core` to emit Atom, JSON Feed, Markdown, or nwf.

## License

Apache-2.0
