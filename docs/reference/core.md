# @neurowire/core

The format authority for Neurowire (version 0.7.0). It owns the canonical model (zod
schemas), the output serializers, mesh and construct types, OPML export, and the pure
helpers for merging, filtering, refining, diffing, and id generation. Pure: no network,
no DOM, only `zod` as a runtime dependency.

```bash
npm install @neurowire/core
```

::: tip Dependency direction
`core` <- `ingest` <- `taps` <- (`cli`, `api`, `web`). Core never imports from any other
Neurowire package, which keeps it format-pure and dependency-light. HTML is deliberately
not a core format: it lives in [`@neurowire/web`](/reference/web).
:::

## Model

The canonical feed model. Every parser produces it; every serializer consumes it. It
carries list-metadata only (no full article bodies). See [the model concept](/concepts/model).

### Types

```ts
interface Person {
  name: string
  url?: string
  email?: string
}

interface NeurowireEntry {
  id: string
  title: string
  link: string
  published?: string
  updated?: string
  summary?: string
  authors?: Person[]
  tags?: string[]
  source?: { name?: string; url?: string }
}

interface NeurowireFeed {
  id: string
  title: string
  home?: string
  self?: string
  updated: string
  authors?: Person[]
  generator?: { name: string; version?: string }
  entries: NeurowireEntry[]
}
```

#### `NeurowireEntry` fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable identifier (real GUID or synthetic `urn:nwf:` id). |
| `title` | `string` | Article title. |
| `link` | `string` | Article URL. |
| `published` | `string?` | ISO 8601 publication date. |
| `updated` | `string?` | ISO 8601 last-modified date. |
| `summary` | `string?` | Plain-text summary or excerpt. |
| `authors` | `Person[]?` | Article authors. |
| `tags` | `string[]?` | Free-form tags or categories. |
| `source` | `{ name?, url? }?` | Originating source (set during a merge). |

#### `NeurowireFeed` fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable feed identifier. |
| `title` | `string` | Feed title. |
| `home` | `string?` | The site's home page URL. |
| `self` | `string?` | The feed's own canonical URL. |
| `updated` | `string` | ISO 8601 timestamp of the most recent change. |
| `authors` | `Person[]?` | Feed-level authors. |
| `generator` | `{ name, version? }?` | Generator stamp. |
| `entries` | `NeurowireEntry[]` | The articles. |

### Schemas and validators

```ts
const PersonSchema: z.ZodType<Person>
const EntrySchema: z.ZodType<NeurowireEntry>
const FeedSchema: z.ZodType<NeurowireFeed>

function parseNeurowireFeed(data: unknown): NeurowireFeed
```

| Export | Description |
|--------|-------------|
| `PersonSchema` | Zod schema for a `Person`. |
| `EntrySchema` | Zod schema for a `NeurowireEntry`. |
| `FeedSchema` | Zod schema for a `NeurowireFeed`. |
| `parseNeurowireFeed(data)` | Validate an unknown value into a `NeurowireFeed`. Throws `ZodError` on invalid input. |

### Constants

```ts
const GENERATOR: { name: 'Neurowire'; version: '0.1.0' }
```

The generator stamp written into feeds Neurowire produces.

## Serializers

Turn a `NeurowireFeed` into a wire format. Registered in `FORMATS` / `MEDIA_TYPES` /
`EXTENSIONS` and dispatched by `serialize`. See [output formats](/concepts/output-formats).

### Dispatch

```ts
const FORMATS: readonly ['atom', 'rss', 'json', 'md', 'nwf']
type Format = 'atom' | 'rss' | 'json' | 'md' | 'nwf'

const MEDIA_TYPES: Record<Format, string>
const EXTENSIONS: Record<Format, string>

function isFormat(value: string): value is Format
function serialize(feed: NeurowireFeed, format: Format): string
```

| Export | Description |
|--------|-------------|
| `FORMATS` | The supported output format ids, in order. |
| `Format` | Union type of the format ids. |
| `MEDIA_TYPES` | The `Content-Type` for each format. |
| `EXTENSIONS` | The file extension for each format (`atom` and `rss` both map to `xml`). |
| `isFormat(value)` | Type guard: is the string one of `FORMATS`? |
| `serialize(feed, format)` | Serialize a feed to the requested format. |

`MEDIA_TYPES` values:

| Format | Content-Type | Extension |
|--------|--------------|-----------|
| `nwf` | `text/x-neurowire; charset=utf-8` | `nwf` |
| `atom` | `application/atom+xml; charset=utf-8` | `xml` |
| `rss` | `application/rss+xml; charset=utf-8` | `xml` |
| `json` | `application/feed+json; charset=utf-8` | `json` |
| `md` | `text/markdown; charset=utf-8` | `md` |

### Atom

```ts
function toAtom(feed: NeurowireFeed): string
```

Serialize a feed to an Atom 1.0 document.

### RSS

```ts
function toRss(feed: NeurowireFeed): string
function toRfc822(iso: string): string | undefined
```

| Export | Description |
|--------|-------------|
| `toRss(feed)` | Serialize a feed to an RSS 2.0 document. |
| `toRfc822(iso)` | Format an ISO-ish date string as an RFC 822 date in GMT (e.g. `Wed, 02 Oct 2024 13:00:00 GMT`). Returns `undefined` when unparseable. |

### JSON Feed

```ts
function toJsonFeed(feed: NeurowireFeed): string
function toJsonFeedObject(feed: NeurowireFeed): JsonFeedDocument

interface JsonFeedDocument {
  version: string
  title: string
  home_page_url?: string
  feed_url?: string
  authors?: { name: string; url?: string }[]
  items: {
    id: string
    url: string
    title: string
    summary?: string
    date_published?: string
    date_modified?: string
    authors?: { name: string; url?: string }[]
    tags?: string[]
  }[]
}
```

| Export | Description |
|--------|-------------|
| `toJsonFeed(feed)` | Serialize a feed to a JSON Feed 1.1 string. |
| `toJsonFeedObject(feed)` | Build the JSON Feed 1.1 document as a plain object. |
| `JsonFeedDocument` | The shape of a JSON Feed 1.1 document. |

### Markdown

```ts
function toMarkdown(feed: NeurowireFeed): string
```

Serialize a feed to a Markdown document (one `###` heading per entry).

### NWF

The compact, line-oriented Neurowire Feed format. See the README for the full spec.

```ts
function toNwf(feed: NeurowireFeed): string
function fromNwf(text: string): NeurowireFeed
function validateNwf(text: string): NwfValidation

interface NwfIssue {
  line: number
  message: string
}

interface NwfValidation {
  valid: boolean
  errors: NwfIssue[]
  warnings: NwfIssue[]
  feed?: NeurowireFeed
}
```

| Export | Description |
|--------|-------------|
| `toNwf(feed)` | Serialize a feed to NWF (interned authors/tags/sources, relative links, delta timestamps). Does not carry `generator`. |
| `fromNwf(text)` | Parse an NWF document back into a `NeurowireFeed`. |
| `validateNwf(text)` | Validate an NWF document and return line-numbered diagnostics, plus the parsed `feed` when there are no errors. |
| `NwfIssue` | One diagnostic: a 1-based `line` and a `message`. |
| `NwfValidation` | Validation result: `valid`, `errors`, `warnings`, and (on success) `feed`. |

## Mesh and construct types

The data model for bundling sources. See [meshes](/concepts/meshes) and [constructs](/concepts/constructs).

### Mesh

```ts
interface MeshSource {
  name: string
  url: string
}

interface Mesh {
  name: string
  sources: MeshSource[]
}

const MeshSourceSchema: z.ZodType<MeshSource>
const MeshSchema: z.ZodType<Mesh>

function parseMesh(data: unknown): Mesh
```

A `Mesh` is a named bundle of sources that fetch and merge into one feed.

| Export | Description |
|--------|-------------|
| `MeshSource` / `MeshSourceSchema` | One source: a display `name` and a `url` (feed or website). |
| `Mesh` / `MeshSchema` | A named bundle of `sources`. |
| `parseMesh(data)` | Validate an unknown value into a `Mesh`. Throws `ZodError`. |

### Construct

```ts
interface ConstructRef {
  ref: string
}

type ConstructMember = ConstructRef | Mesh

interface Construct {
  name: string
  meshes: ConstructMember[]
}

const ConstructRefSchema: z.ZodType<ConstructRef>
const ConstructMemberSchema: z.ZodType<ConstructMember>
const ConstructSchema: z.ZodType<Construct>

function parseConstruct(data: unknown): Construct
function isConstructRef(member: ConstructMember): member is ConstructRef
```

A `Construct` is a named bundle of meshes (a "repo" of feeds). A member is either an
inline `Mesh` or a `ConstructRef` pointing at a mesh by name. A bare string in the input
is shorthand for `{ ref: string }`, so a published list can stay terse:
`["ai-news", "security"]`.

| Export | Description |
|--------|-------------|
| `ConstructRef` / `ConstructRefSchema` | A reference to a mesh by name, resolved at fetch time. |
| `ConstructMember` / `ConstructMemberSchema` | One member: an inline `Mesh`, a `ConstructRef`, or a bare string (transformed to `{ ref }`). |
| `Construct` / `ConstructSchema` | A named bundle of `meshes`. |
| `parseConstruct(data)` | Validate an unknown value into a `Construct`. Throws `ZodError`. |
| `isConstructRef(member)` | Type guard: is a resolved member a `ConstructRef`? |

## OPML export

```ts
function meshToOpml(mesh: Mesh): string
function constructToOpml(construct: Construct): string
```

| Export | Description |
|--------|-------------|
| `meshToOpml(mesh)` | Serialize a mesh to an OPML 2.0 subscription list: one `<outline>` per source. |
| `constructToOpml(construct)` | Serialize a construct to a two-level OPML 2.0 document: one category `<outline>` per mesh, each wrapping its sources. Reference members emit an empty category outline. |

::: tip
Parsing OPML the other way (OPML to mesh) lives in [`@neurowire/ingest`](/reference/ingest)
as `opmlToMesh`, since it depends on the XML parser.
:::

## Merge

```ts
interface MergePart {
  feed: NeurowireFeed
  source?: { name?: string; url?: string }
}

interface MergeOptions {
  id?: string
  limit?: number
}

function mergeFeeds(
  title: string,
  parts: MergePart[],
  options?: MergeOptions,
): NeurowireFeed
```

Merge several feeds into one named feed. Each entry is tagged with its source (falling
back to the source feed's own title/home), entries are de-duplicated by link, sorted
newest first, and capped by an optional `limit`.

| Param / field | Type | Description |
|---------------|------|-------------|
| `title` | `string` | The merged feed's title. |
| `parts` | `MergePart[]` | The feeds to merge plus their source labels. |
| `options.id` | `string?` | Stable id for the merged feed. Defaults to a urn derived from the title. |
| `options.limit` | `number?` | Keep only the newest N entries. |

## Filter

Pure, deterministic entry filtering by field and pattern.

```ts
type FilterField = 'title' | 'summary' | 'source' | 'author' | 'tag'

interface FilterRule {
  field: FilterField
  pattern: string
  regex?: boolean
}

interface FilterSpec {
  include?: FilterRule[]
  exclude?: FilterRule[]
}

function matchRule(entry: NeurowireEntry, rule: FilterRule): boolean
function filterEntries(feed: NeurowireFeed, spec: FilterSpec): NeurowireFeed
```

| Export | Description |
|--------|-------------|
| `FilterField` | The entry field a rule matches against. |
| `FilterRule` | A `field`, a `pattern`, and an optional `regex` flag (substring match otherwise). Matching is case-insensitive. |
| `FilterSpec` | An `include` set and an `exclude` set of rules. |
| `matchRule(entry, rule)` | Does any of the entry's values for the rule's field match? |
| `filterEntries(feed, spec)` | Keep entries that match at least one include rule (or there are none) and match no exclude rule. An empty spec returns the feed unchanged. |

## Refine

Pure, deterministic time-window filtering, sorting, and limiting. Callers pass `now`
(epoch ms) into `resolveWindow`, keeping the module side-effect free.

```ts
type SortKey = 'date' | 'title' | 'source'
type SortOrder = 'asc' | 'desc'

interface SelectOptions {
  from?: number
  to?: number
  sort?: SortKey
  order?: SortOrder
  limit?: number
}

interface WindowSpec {
  since?: string
  maxAge?: string
  today?: boolean
  thisWeek?: boolean
  between?: [string, string]
}

interface TimeWindow {
  from?: number
  to?: number
}

function parseDuration(value: string): number | undefined
function resolveWindow(spec: WindowSpec, now: number): TimeWindow
function selectEntries(feed: NeurowireFeed, opts: SelectOptions): NeurowireFeed
```

| Export | Description |
|--------|-------------|
| `SortKey` / `SortOrder` | Sort field and direction. |
| `SelectOptions` | Epoch-ms `from`/`to` bounds, a `sort`, an `order`, and a `limit`. |
| `WindowSpec` | A high-level window: `since`/`maxAge` duration, `today`, `thisWeek`, or an explicit `between` pair. |
| `TimeWindow` | Concrete `from`/`to` epoch-ms bounds. |
| `parseDuration(value)` | Parse a duration like `"24h"`, `"90m"`, or `"7d"` into milliseconds, or `undefined`. |
| `resolveWindow(spec, now)` | Turn a `WindowSpec` into epoch-ms bounds, relative to `now`. Precedence: `between` > `today` > `thisWeek` > `since`/`maxAge`. |
| `selectEntries(feed, opts)` | Apply a date window, an optional sort, and an optional limit. Date sorts default to newest-first; title and source sorts default to A-Z. Undated entries are dropped only when a date bound is set. |

## Diff

Pure dedup helpers for watch-style polling. The seen-state lives entirely in the
calling app layer.

```ts
function entryKey(entry: NeurowireEntry): string
function newEntries(feed: NeurowireFeed, seen: Iterable<string>): NeurowireEntry[]
```

| Export | Description |
|--------|-------------|
| `entryKey(entry)` | Stable identity for dedup: the entry `id` when present, else its `link`. |
| `newEntries(feed, seen)` | The feed's entries whose `entryKey` is not in `seen`, in original order. `seen` is any iterable of keys, read once. |

## Id helpers

Stable, content-derived entry ids. Pure and dependency-free (no `node:crypto`).

```ts
function hashHex(input: string): string
function stableId(link: string, title: string): string
```

| Export | Description |
|--------|-------------|
| `hashHex(input)` | FNV-1a (64-bit) hash of `input`, as a fixed 16-char lowercase hex string. |
| `stableId(link, title)` | A deterministic synthetic id derived from an entry's link and title. Shape: `urn:nwf:<16-char hex>`. |
