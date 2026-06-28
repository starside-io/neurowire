# Constructs

A **construct** is a named bundle of [meshes](/concepts/meshes): a "repo" of feeds grouped into sections. Where a mesh merges sources into one flat feed, a construct keeps the per-mesh grouping, so you can render a multi-section page (a "Daily Brief" with a Models section, a Releases section, and so on) or flatten the whole thing into one feed for the standard serializers.

The `Construct` type lives in [`@neurowire/core`](https://github.com/neurowire/neurowire) (`packages/core/src/model.ts`); fetching lives in `fetchConstruct` / `flattenConstruct` (`packages/ingest/src/construct.ts`).

## Shape

A construct is a `name` plus a list of `meshes`. Each member is either an **inline mesh** (self-contained, with its own sources) or a **reference** to a mesh resolved elsewhere by name.

```ts
export const ConstructMemberSchema = z.union([
  z.string().transform((ref) => ({ ref })), // bare string is shorthand for { ref }
  ConstructRefSchema,                        // { ref: "..." }
  MeshSchema,                                // an inline mesh
])
export const ConstructSchema = z.object({
  name: z.string(),
  meshes: z.array(ConstructMemberSchema),
})
```

A bare string is shorthand for `{ ref: string }`, so a published list of mesh names stays terse:

```json
{
  "name": "Daily Brief",
  "meshes": ["ai-news", "security"]
}
```

Or mix inline meshes with references:

```json
{
  "name": "Daily Brief",
  "meshes": [
    {
      "name": "Models",
      "sources": [
        { "name": "Claude Blog", "url": "https://claude.com/blog" },
        { "name": "Simon Willison", "url": "https://simonwillison.net/atom/everything/" }
      ]
    },
    { "ref": "security" }
  ]
}
```

`parseConstruct(data)` validates an unknown value into a `Construct`.

## Resolving references: `MeshResolver`

A construct only carries references; the **lookup** is supplied by the caller, so core and ingest stay free of any filesystem or registry assumptions.

```ts
export type MeshResolver = (ref: string) => Mesh | undefined
```

`fetchConstruct` takes an optional `resolver`. It is required only when the construct actually has `{ ref }` members: an inline mesh passes through unchanged, but a reference with no resolver (or one that resolves to nothing) throws.

`createConfigMeshResolver()` (in `packages/ingest/src/mesh-config.ts`) returns a resolver backed by the mesh config directories: explicit dirs, then `NEUROWIRE_MESHES`, then `~/.config/neurowire/meshes/`. Drop a published mesh pack there and a construct can reference it by name.

```ts
import { fetchConstruct, createConfigMeshResolver } from '@neurowire/ingest'

const fetched = await fetchConstruct(construct, {
  resolver: createConfigMeshResolver(),
})
```

## `fetchConstruct` vs `flattenConstruct`

These are two views of the same data.

**`fetchConstruct(construct, options)`** returns a `FetchedConstruct`: the construct name plus one merged feed **per mesh**, with grouping preserved.

```ts
interface FetchedConstruct {
  name: string
  parts: { mesh: Mesh; feed: NeurowireFeed }[]
}
```

This is what the grouped HTML rendering uses (a per-mesh section per part).

**`flattenConstruct(fetched, options)`** collapses a `FetchedConstruct` into one `NeurowireFeed`, tagging every entry with the mesh it came from. The grouping is dropped (Atom, JSON Feed, and nwf cannot express it), so this is the path the feed serializers and the API use.

```ts
const fetched = await fetchConstruct(construct, { resolver })
const feed = flattenConstruct(fetched, { limit: 50 })
const atom = serialize(feed, 'atom')
```

## Concurrency control

A construct of many meshes could otherwise open every source of every mesh at once (dozens of connections), and that burst makes slow hosts time out and drop whole meshes. So meshes are fetched with **bounded concurrency** (`concurrency`, default `2`). Sources **within** a single mesh are still fetched together in parallel.

## Partial-failure semantics

Failures are non-fatal at both levels:

- A source that fails is logged via `onSourceError` and skipped (same as a plain mesh).
- A mesh whose every source fails is logged via `onMeshError` (default: a one-line stderr warning) and skipped entirely.
- `fetchConstruct` throws only when **no mesh** could be fetched: `Construct "<name>": no meshes could be fetched`.

`FetchConstructOptions` also forwards the shared fetch tuning (`signal`, `cache`, `timeoutMs`, `retries`, `backoffMs`) and a `limit` (newest N entries within each mesh). See [Fetching](/concepts/fetching).

## Named constructs from config

Constructs can be stored as JSON and referenced by name. The directories are searched in order: `NEUROWIRE_CONSTRUCTS` (`:` / `,` separated), then `~/.config/neurowire/constructs/` (or `$XDG_CONFIG_HOME/neurowire/constructs`). Files are matched as `<name>.construct.json` then `<name>.json`. Names must be simple identifiers; path-like names are rejected.

## Bundled `daily`

So that `?src=daily` works with no setup, the API ships one built-in construct, `daily` ("Daily Brief"), with two meshes: a "Models" mesh (Claude Blog, Simon Willison) and a "Releases" mesh (Claude Code Releases). See `packages/api/src/constructs.ts`. User construct directories take precedence over the bundled defaults.
