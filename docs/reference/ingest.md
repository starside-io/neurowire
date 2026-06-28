# @neurowire/ingest

Fetch, detect, and parse (version 0.6.0). Turns a URL into a
[`NeurowireFeed`](/reference/core#model): it fetches with conditional caching and SSRF
guards, detects the document kind, parses RSS / Atom / RDF / JSON Feed, auto-detects feeds
from HTML, runs the CSS-template engine, and fetches meshes and constructs.

```bash
npm install @neurowire/ingest
```

Depends on `core`, `cheerio`, `fast-xml-parser`, and `zod`.

## Fetching feeds

### `fetchFeed`

```ts
function fetchFeed(url: string, options?: FetchFeedOptions): Promise<NeurowireFeed>

interface FetchFeedOptions {
  template?: FeedTemplate
  signal?: AbortSignal
  maxDepth?: number
  cache?: ConditionalCache
  timeoutMs?: number
  retries?: number
  backoffMs?: number
}
```

Fetch a URL (website, RSS, or Atom) and normalize it to a `NeurowireFeed`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `template` | `FeedTemplate?` | - | Force a CSS-selector template instead of auto-detecting. |
| `signal` | `AbortSignal?` | - | Cancel the fetch. |
| `maxDepth` | `number?` | `3` | Max number of feed-link redirects to follow. |
| `cache` | `ConditionalCache?` | - | An ETag/Last-Modified response cache, owned by the caller. |
| `timeoutMs` | `number?` | `15000` | Per-attempt fetch deadline. Set `0` to disable. |
| `retries` | `number?` | `2` | Max additional attempts after the first. |
| `backoffMs` | `number?` | `500` | Base delay for exponential backoff with jitter. |

### `ingestDocument`

```ts
function ingestDocument(
  doc: RawDocument,
  options?: FetchFeedOptions,
  depth?: number,
): Promise<NeurowireFeed>
```

Turn an already-fetched [`RawDocument`](#fetchdocument) into a feed, without touching the
network (useful for testing). Resolution order: explicit `template` -> discovered feed
link -> registry template (by host) -> heuristic auto-detect. Throws when nothing extracts
a feed.

## Low-level fetch

### `fetchDocument`

```ts
function fetchDocument(url: string, options?: FetchOptions): Promise<RawDocument>

interface FetchOptions {
  signal?: AbortSignal
  cache?: ConditionalCache
  validate?: (url: string) => void | Promise<void>
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>
}

interface RawDocument {
  url: string
  contentType: string
  body: string
  etag?: string
  lastModified?: string
  notModified?: boolean
}
```

Fetch a URL over HTTP(S) with a per-attempt timeout and bounded retries. Redirects are
followed manually one hop at a time, so the `validate` guard runs on every hop. Network
errors, timeouts, upstream 5xx, and 429 are retried with full-jitter exponential backoff
(a 429 honors its `Retry-After`); a 4xx other than 429, an invalid URL, an SSRF reject, too
many redirects, or a caller abort are not retried. A 304 is a success.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `signal` | `AbortSignal?` | - | Caller cancellation. |
| `cache` | `ConditionalCache?` | - | Conditional response cache. |
| `validate` | `(url) => void \| Promise<void>?` | - | Per-URL guard run on the initial URL and every redirect hop. Throw to block (SSRF protection). |
| `timeoutMs` | `number?` | `15000` | Per-attempt deadline. Set `0` to disable. |
| `retries` | `number?` | `2` | Max additional attempts. |
| `backoffMs` | `number?` | `500` | Base backoff delay. |
| `delay` | `(ms, signal?) => Promise<void>?` | setTimeout-based | Injectable sleep between retries (for tests). |

`RawDocument` fields: `url` (final URL after redirects), `contentType`, `body`, `etag`,
`lastModified`, and `notModified` (true when served from cache via a 304).

### Conditional cache

```ts
interface CachedResponse {
  url: string
  contentType: string
  body: string
  etag?: string
  lastModified?: string
}

interface ConditionalCache {
  get(url: string): CachedResponse | undefined
  set(url: string, value: CachedResponse): void
}

function createMemoryCache(): ConditionalCache
```

| Export | Description |
|--------|-------------|
| `CachedResponse` | A previously fetched response plus its validators. |
| `ConditionalCache` | A store of cached responses, injected by the caller (the library keeps no global state). |
| `createMemoryCache()` | A simple `Map`-backed `ConditionalCache`. |

## Detection

```ts
type FeedKind = 'atom' | 'rss' | 'rdf' | 'jsonfeed' | 'html'

function detectKind(contentType: string, body: string): FeedKind
```

| Export | Description |
|--------|-------------|
| `FeedKind` | The detected document kind. |
| `detectKind(contentType, body)` | Classify a document from its `Content-Type` and body. |

## Parsers

Each parser produces a `NeurowireFeed` from already-parsed input plus a `ParseContext`.

```ts
function parseFeedString(body: string, ctx: ParseContext): NeurowireFeed
function parseAtom(doc: Record<string, unknown>, ctx: ParseContext): NeurowireFeed
function parseRss(doc: Record<string, unknown>, ctx: ParseContext): NeurowireFeed
function parseRdf(doc: Record<string, unknown>, ctx: ParseContext): NeurowireFeed
function parseJsonFeed(raw: unknown, ctx: ParseContext): NeurowireFeed
```

| Export | Description |
|--------|-------------|
| `parseFeedString(body, ctx)` | Sniff a raw string (JSON Feed, Atom, RSS, or RDF) and dispatch to the right parser. Throws on an unrecognized format. |
| `parseAtom(doc, ctx)` | Parse a parsed-XML Atom document. |
| `parseRss(doc, ctx)` | Parse a parsed-XML RSS 2.0 document. |
| `parseRdf(doc, ctx)` | Parse a parsed-XML RDF (RSS 1.0) document. |
| `parseJsonFeed(raw, ctx)` | Parse a JSON Feed value. |

## HTML auto-detection

```ts
function discoverFeedLink($: CheerioAPI, base: string): string | undefined
function autodetect($: CheerioAPI, ctx: ParseContext): NeurowireFeed | null
```

| Export | Description |
|--------|-------------|
| `discoverFeedLink($, base)` | Find a declared feed `<link>` on the page, resolved against `base`. Returns `undefined` when none. |
| `autodetect($, ctx)` | Extract a feed from the page itself (JSON-LD, then semantic HTML). Returns `null` when nothing extracts. |

## The CSS-template engine

A per-site recipe of CSS selectors that turns a listing page into a feed. See
[taps](/concepts/taps).

```ts
const FeedTemplateSchema: z.ZodType<FeedTemplate>

interface FeedTemplate {
  host?: string
  feedTitle?: string
  item: string
  title: string
  link?: string
  date?: string
  summary?: string
  author?: string
  tags?: string
}

function applyTemplate(
  $: CheerioAPI,
  template: FeedTemplate,
  ctx: ParseContext,
): NeurowireFeed
```

| Field | Type | Description |
|-------|------|-------------|
| `host` | `string?` | Hostname the template applies to (e.g. `blog.example.com`). |
| `feedTitle` | `string?` | Override feed title (otherwise the page `<title>`). |
| `item` | `string` | Selector matching each article row. |
| `title` | `string` | Selector (within an item) for the title text. |
| `link` | `string?` | Selector for the link (its href). Omit when the item element is itself the link. |
| `date` | `string?` | Selector for the date; reads `[datetime]` then text. |
| `summary` | `string?` | Selector for the summary text. |
| `author` | `string?` | Selector for the author name. |
| `tags` | `string?` | Selector matching tag elements. |

| Export | Description |
|--------|-------------|
| `FeedTemplateSchema` | Zod schema for a `FeedTemplate`. |
| `applyTemplate($, template, ctx)` | Extract a feed from a loaded Cheerio document using a template. |

### Proposing a template

```ts
interface TemplateProposal {
  template: FeedTemplate
  matched: number
  sampleTitles: string[]
}

function proposeTemplate(html: string, url: string): TemplateProposal | undefined
```

| Export | Description |
|--------|-------------|
| `TemplateProposal` | A guessed `template`, the count of `matched` items, and a few `sampleTitles`. |
| `proposeTemplate(html, url)` | Heuristically propose a template for an HTML page, or `undefined` when nothing looks like a listing. |

### Template registry

```ts
function registerTemplate(template: FeedTemplate): void
function findTemplate(url: string): FeedTemplate | undefined
function listTemplates(): FeedTemplate[]
```

| Export | Description |
|--------|-------------|
| `registerTemplate(template)` | Register a per-host template (validated with zod; ignored when it has no `host`). |
| `findTemplate(url)` | Look up a template for a URL's hostname. |
| `listTemplates()` | All registered templates. |

::: tip
[`@neurowire/taps`](/reference/taps) ships curated templates and registers them with this
registry.
:::

## Meshes

```ts
function fetchMesh(mesh: Mesh, options?: FetchMeshOptions): Promise<NeurowireFeed>

interface FetchMeshOptions {
  signal?: AbortSignal
  limit?: number
  cache?: ConditionalCache
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  onSourceError?: (source: { name: string; url: string }, error: unknown) => void
}
```

Fetch every source in a mesh (in parallel) and merge them into one feed. Sources that fail
are skipped; throws only if none succeed.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `signal` | `AbortSignal?` | - | Cancellation. |
| `limit` | `number?` | - | Keep only the newest N merged entries. |
| `cache` | `ConditionalCache?` | - | A conditional cache shared by every source. |
| `timeoutMs` / `retries` / `backoffMs` | `number?` | `15000` / `2` / `500` | Per-source fetch tuning. |
| `onSourceError` | `(source, error) => void?` | warns on stderr | Called for each source that failed. A failed source is skipped, never fatal (unless all fail). |

## Constructs

```ts
type MeshResolver = (ref: string) => Mesh | undefined

interface ConstructPart {
  mesh: Mesh
  feed: NeurowireFeed
}

interface FetchedConstruct {
  name: string
  parts: ConstructPart[]
}

function resolveConstructMembers(construct: Construct, resolver?: MeshResolver): Mesh[]
function fetchConstruct(
  construct: Construct,
  options?: FetchConstructOptions,
): Promise<FetchedConstruct>
function flattenConstruct(
  construct: FetchedConstruct,
  options?: FlattenConstructOptions,
): NeurowireFeed

interface FetchConstructOptions {
  signal?: AbortSignal
  limit?: number
  cache?: ConditionalCache
  resolver?: MeshResolver
  concurrency?: number
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  onSourceError?: FetchMeshOptions['onSourceError']
  onMeshError?: (mesh: Mesh, error: unknown) => void
}

interface FlattenConstructOptions {
  limit?: number
}
```

| Export | Description |
|--------|-------------|
| `MeshResolver` | Resolve a mesh reference (by name) to a `Mesh`, or `undefined`. The caller supplies the lookup so ingest stays free of filesystem assumptions. |
| `ConstructPart` | One mesh of a fetched construct paired with the feed it merged into. |
| `FetchedConstruct` | A fetched construct: its `name` plus one merged feed per mesh (grouping preserved). |
| `resolveConstructMembers(construct, resolver?)` | Resolve every member to a concrete `Mesh`. Inline meshes pass through; `{ ref }` members are looked up. Throws when a ref has no resolver or resolves to nothing. |
| `fetchConstruct(construct, options?)` | Fetch every mesh into its own merged feed with bounded concurrency. Failed meshes are skipped; throws only if none succeed. |
| `flattenConstruct(construct, options?)` | Collapse a fetched construct into one merged feed, tagging entries with their mesh. This is the path the serializers and API use. |

`FetchConstructOptions.concurrency` defaults to `2`: how many meshes to fetch at once.
`onMeshError` is called for each mesh that failed entirely; the default warns on stderr.

## Config-backed mesh resolution

```ts
interface ConfigResolverOptions {
  dirs?: string[]
  envVar?: string
  subdir?: string
}

function meshConfigDirs(options?: ConfigResolverOptions): string[]
function loadMeshFromConfig(name: string, options?: ConfigResolverOptions): Mesh | undefined
function createConfigMeshResolver(options?: ConfigResolverOptions): MeshResolver
```

| Option | Default | Description |
|--------|---------|-------------|
| `dirs` | `[]` | Extra directories searched before the defaults. |
| `envVar` | `NEUROWIRE_MESHES` | Env var holding `:`/`,`-separated directories. |
| `subdir` | `neurowire/meshes` | Sub-path under `~/.config` (`XDG_CONFIG_HOME`). |

| Export | Description |
|--------|-------------|
| `meshConfigDirs(options?)` | The directories searched for named mesh files: explicit `dirs`, then the env var, then `~/.config/neurowire/meshes`. |
| `loadMeshFromConfig(name, options?)` | Read a mesh by name (tries `<name>.mesh.json` then `<name>.json`). Returns `undefined` when absent. Rejects path-like names. |
| `createConfigMeshResolver(options?)` | A `MeshResolver` backed by the config directories. Pass to `fetchConstruct({ resolver })`. |

## OPML import

```ts
function opmlToMesh(xml: string, name?: string): Mesh
```

Parse an OPML 2.0 subscription list into a `Mesh`. Every `<outline>` with an `xmlUrl`
becomes a source (name = `text`, else `title`, else the url's host); nested categories are
flattened. The mesh name is `name`, else the OPML `head/title`, else `"imported"`. Throws
on malformed XML or a schema failure.

::: tip
The reverse direction (`meshToOpml`, `constructToOpml`) lives in
[`@neurowire/core`](/reference/core#opml-export).
:::

## Parse utilities

Lower-level helpers used by the parsers, re-exported for advanced callers.

```ts
interface ParseContext {
  sourceUrl: string
}

interface FeedDraft {
  id?: string
  title?: string
  home?: string
  self?: string
  updated?: string
  authors?: Person[]
  entries: NeurowireEntry[]
}

function resolveUrl(href: string, base: string): string
function normDate(value: string | undefined): string | undefined
function stripHtml(value: string | undefined): string | undefined
function finalizeFeed(draft: FeedDraft, ctx: ParseContext): NeurowireFeed
```

| Export | Description |
|--------|-------------|
| `ParseContext` | The parse context: the `sourceUrl` the document came from. |
| `FeedDraft` | A loose, in-progress feed that `finalizeFeed` turns into a valid `NeurowireFeed`. |
| `resolveUrl(href, base)` | Resolve a possibly-relative href against `base`. Returns the input on failure. |
| `normDate(value)` | Normalize any parseable date (RFC 822, RFC 3339, ...) to ISO 8601, or `undefined`. |
| `stripHtml(value)` | Strip tags and collapse whitespace, or `undefined` when empty. |
| `finalizeFeed(draft, ctx)` | Fill in defaults, give entries stable ids, and stamp the generator to produce a valid `NeurowireFeed`. |
