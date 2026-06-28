# The canonical model

Neurowire has exactly one in-memory representation of a feed: the `NeurowireFeed`. Every parser (RSS, Atom, RDF, JSON Feed, HTML auto-detect, taps) produces this shape, and every serializer (atom, rss, json, md, nwf) consumes it. Nothing else in the system reads the upstream format directly. This single model is the contract that lets any input format turn into any output format.

The model lives in [`packages/core/src/model.ts`](https://github.com/neurowire/neurowire) and is defined with [zod](https://zod.dev) schemas, so the same definition both types the code and validates unknown input at runtime.

## Design: list metadata only, no article bodies

Neurowire deliberately models a feed as a **list of articles**, not the articles themselves. An entry carries title, link, dates, a short summary, authors, and tags. It does not carry the full HTML article body.

This keeps the model small, the outputs compact, and fetching cheap (one listing page or feed, not N article pages). If you want the full text, follow the entry's `link`.

::: tip
This is why the `nwf` format can be so terse and why a mesh of dozens of sources stays small. The model never holds article content.
:::

## `NeurowireFeed`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | yes | Stable identifier for the feed (usually the source URL). |
| `title` | `string` | yes | Human-readable feed title. |
| `home` | `string` | no | The website the feed represents (the "alternate" link). |
| `self` | `string` | no | The canonical URL of the feed document itself. |
| `updated` | `string` | yes | Last-updated timestamp (ISO 8601). |
| `authors` | `Person[]` | no | Feed-level authors. |
| `generator` | `{ name, version? }` | no | What produced the feed. Neurowire stamps its own here. |
| `entries` | `NeurowireEntry[]` | yes | The articles, newest first by convention. |

## `NeurowireEntry`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | yes | Stable per-entry identifier (see synthetic ids below). |
| `title` | `string` | yes | Article title. |
| `link` | `string` | yes | URL of the article. |
| `published` | `string` | no | First-published timestamp (ISO 8601). |
| `updated` | `string` | no | Last-updated timestamp (ISO 8601). |
| `summary` | `string` | no | Short description or excerpt. Not the full body. |
| `authors` | `Person[]` | no | Per-entry authors. |
| `tags` | `string[]` | no | Categories or labels. |
| `source` | `{ name?, url? }` | no | Where this entry came from. Used by meshes to tag entries by source. |

## `Person`

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | yes |
| `url` | `string` | no |
| `email` | `string` | no |

## The zod schemas

The schemas mirror the tables above. `EntrySchema` and `FeedSchema` are exported alongside their inferred types, and `parseNeurowireFeed(data)` validates an unknown value (throwing a `ZodError` on bad input).

```ts
export const EntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string(),
  published: z.string().optional(),
  updated: z.string().optional(),
  summary: z.string().optional(),
  authors: z.array(PersonSchema).optional(),
  tags: z.array(z.string()).optional(),
  source: z
    .object({ name: z.string().optional(), url: z.string().optional() })
    .optional(),
})

export const FeedSchema = z.object({
  id: z.string(),
  title: z.string(),
  home: z.string().optional(),
  self: z.string().optional(),
  updated: z.string(),
  authors: z.array(PersonSchema).optional(),
  generator: z.object({ name: z.string(), version: z.string().optional() }).optional(),
  entries: z.array(EntrySchema),
})
```

## Stable synthetic entry ids (content hashing)

Many sources, especially scraped HTML listings, give an entry no real GUID. To keep deduplication and round-trips stable across every format, Neurowire derives a deterministic id from the entry's content when none is present.

The logic lives in `packages/core/src/id.ts`:

- `hashHex(input)` is a pure FNV-1a (64-bit) hash returned as a fixed 16-char lowercase hex string. It uses no `node:crypto`, so core stays portable.
- `stableId(link, title)` hashes `\`${link}\n${title}\`` and returns `urn:nwf:<16-char hex>`.

During ingestion, an entry that already has a real id keeps it. An entry with an empty id gets `stableId(link, title)` stamped in. The same `(link, title)` always produces the same urn, so the same article keeps the same id across fetches and across output formats.

```
urn:nwf:9f1c4b2a6d3e0f87
```

::: tip
Because the id is derived from the link and title, an article that is re-fetched (or merged into a mesh) is recognized as the same entry and deduplicated, even when the upstream source never gave it an id.
:::
