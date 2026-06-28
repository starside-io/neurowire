# Library usage

Neurowire is a library first. The CLI and API are thin wrappers over the same functions. This page shows the common entry points; see the [reference](/reference/core) for full symbol lists.

The split is deliberate: `@neurowire/ingest` does network work (fetch, detect, parse, merge), `@neurowire/core` is pure (the model, serializers, filtering, merging), `@neurowire/web` renders HTML.

## Fetch a single feed

`fetchFeed(url, options)` fetches a website, RSS, or Atom URL and normalizes it to a `NeurowireFeed`.

```ts
import { fetchFeed } from '@neurowire/ingest'

const feed = await fetchFeed('https://blog.rust-lang.org/feed.xml')
console.log(feed.title, feed.entries.length)
```

For an HTML page, `fetchFeed` follows a declared feed link, then a registry tap, then heuristic auto-detection. Options include `template` (force a CSS-selector template), `timeoutMs`, `retries`, `backoffMs`, `maxDepth`, `signal`, and `cache`.

## Fetch a mesh

`fetchMesh(mesh, options)` fetches every source in parallel and merges them into one newest-first feed (tagged by source, deduped). Sources that fail are skipped and never fatal unless all of them fail.

```ts
import { fetchMesh } from '@neurowire/ingest'
import type { Mesh } from '@neurowire/core'

const mesh: Mesh = {
  name: 'AI News',
  sources: [
    { name: 'Claude Blog', url: 'https://claude.com/blog' },
    { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
  ],
}

const feed = await fetchMesh(mesh, { limit: 20 })
```

Pass `onSourceError` to override the default stderr warning for partial failures.

## Fetch a construct

A construct is a bundle of meshes. `fetchConstruct(construct, options)` keeps the per-mesh grouping in a `FetchedConstruct` (one merged feed per mesh). `flattenConstruct` collapses it into a single feed for the serializers.

```ts
import { fetchConstruct, flattenConstruct, createConfigMeshResolver } from '@neurowire/ingest'
import type { Construct } from '@neurowire/core'

const construct: Construct = {
  name: 'Daily',
  meshes: [
    'ai-news', // a { ref } shorthand, resolved by the resolver below
    { name: 'Releases', sources: [{ name: 'Claude Code', url: 'https://github.com/anthropics/claude-code/releases.atom' }] },
  ],
}

const fetched = await fetchConstruct(construct, { resolver: createConfigMeshResolver() })
const feed = flattenConstruct(fetched) // one feed, entries tagged by mesh
```

`{ ref }` members need a `MeshResolver`. `createConfigMeshResolver()` reads `~/.config/neurowire/meshes`; you can supply any `(ref: string) => Mesh | undefined` function. Meshes are fetched with bounded `concurrency` (default 2).

## Parse an already-fetched document

When you already have the bytes (no network), `ingestDocument(doc, options)` turns a `RawDocument` into a feed. Useful for tests or custom transports.

```ts
import { ingestDocument } from '@neurowire/ingest'

const feed = await ingestDocument({
  url: 'https://example.com/blog',
  contentType: 'text/html',
  body: '<html>...</html>',
})
```

## Register taps

To resolve feed-less sites (e.g. `claude.com`), register the curated taps once at startup.

```ts
import { registerAllTaps } from '@neurowire/taps'

registerAllTaps() // built-ins plus ~/.config/neurowire/taps and NEUROWIRE_TAPS
```

See [Taps](/concepts/taps) for adding your own.

## Serialize a feed

`serialize(feed, format)` from core renders a `NeurowireFeed` to a string. Formats: `atom`, `rss`, `json`, `md`, `nwf`.

```ts
import { serialize, FORMATS, MEDIA_TYPES } from '@neurowire/core'

const atom = serialize(feed, 'atom')
const json = serialize(feed, 'json')

console.log(FORMATS)        // ['atom', 'rss', 'json', 'md', 'nwf']
console.log(MEDIA_TYPES.json) // 'application/feed+json; charset=utf-8'
```

The direct serializers (`toAtom`, `toRss`, `toJsonFeed`, `toMarkdown`, `toNwf`) and the nwf round-trip helpers (`fromNwf`, `validateNwf`) are also exported. See [The model](/concepts/model) and the [core reference](/reference/core).

## Render HTML

`@neurowire/web` is the only package that emits HTML (core stays format-pure). All three functions return self-contained pages with inline CSS and no external requests.

```ts
import { toHtml, toConstructHtml, toConstructPages } from '@neurowire/web'

// a single feed or mesh -> one page
const page = toHtml(feed)

// a fetched construct -> an overview page of recap cards
const overview = toConstructHtml(fetched)

// a fetched construct -> an index.html plus one page per mesh
const pages = toConstructPages(fetched) // [{ filename, html }, ...]
```

`toConstructHtml` accepts `{ meshHref }` to control where each recap card links. See the [web reference](/reference/web).
