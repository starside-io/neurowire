# @neurowire/api

The Neurowire HTTP service (version 0.4.0): a [Hono](https://hono.dev) app that serves
feeds, meshes, and constructs as NWF, Atom, RSS, JSON Feed, or Markdown. It registers the
built-in [taps](/reference/taps) at startup and caches both the serialized response and the
upstream fetches.

```bash
npm install @neurowire/api
```

Depends on `core`, [`ingest`](/reference/ingest), [`taps`](/reference/taps), and `hono`.

## Library exports

```ts
import { app } from '@neurowire/api'
```

The package exports the Hono `app` (from both `index.ts` and `app.ts`). `index.ts` also
runs the standalone server (`@hono/node-server`) when executed directly, listening on
`PORT` (default `8787`).

| Export | Type | Description |
|--------|------|-------------|
| `app` | `Hono` | The configured Hono application. Mount it, run it with any Hono adapter, or call `app.fetch(request)` directly (e.g. in tests). |

::: tip Running it
`pnpm api` starts the server. The bundled server entry calls
`serve({ fetch: app.fetch, port })` and logs the listening URL.
:::

## Endpoints

All feed-shaped responses set `Content-Type` from the format's media type and
`Cache-Control: public, max-age=300`. The `format` query defaults to `atom` and must be one
of `nwf`, `atom`, `rss`, `json`, `md` (an unknown value returns 400). HTML is not a feed
format, so `format=html` is rejected like any unknown format.

### `GET /`

Service descriptor. Returns JSON with `name`, `version`, the supported `formats`, the
`endpoints` summary, and the available `meshes` and `constructs` names.

### `GET /healthz`

Liveness probe. Returns `{ status: 'ok', service: 'neurowire', version: '0.4.0' }`.

### `GET /feed`

Fetch a single URL and serialize it.

| Query | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | yes | - | The website or feed URL (URL-encoded). |
| `format` | no | `atom` | Output format. |

Responses: `200` with the serialized feed; `400` when `url` is missing or `format` is
unknown; `502` (`{ error, detail }`) when the upstream fetch or build fails.

### `GET /mesh`

Serialize a named mesh (resolved via [mesh resolution](#mesh-resolution)).

| Query | Required | Default | Description |
|-------|----------|---------|-------------|
| `src` | yes | - | The mesh name. |
| `format` | no | `atom` | Output format. |

Responses: `200`; `400` (missing `src` or unknown `format`, body lists available
`meshes`); `404` (`unknown mesh`, body lists `meshes`); `502` on build failure.

### `POST /mesh`

Serialize an inline mesh from the request body.

- Body: a JSON [`Mesh`](/reference/core#mesh) (validated with `MeshSchema`).
- Query: `format` (default `atom`).
- Responses: `200`; `400` (unknown `format` or invalid mesh body, with `detail`); `502` on
  build failure.

### `GET /construct`

Serialize a named construct (resolved via [construct resolution](#construct-resolution)),
flattened into one feed.

| Query | Required | Default | Description |
|-------|----------|---------|-------------|
| `src` | yes | - | The construct name. |
| `format` | no | `atom` | Output format. |

The construct is fetched with the upstream cache and `resolveMesh` as its `{ ref }`
resolver, then flattened. Responses: `200`; `400` (missing `src` or unknown `format`, body
lists `constructs`); `404` (`unknown construct`, body lists `constructs`); `502` on build
failure.

### `POST /construct`

Serialize an inline construct from the request body.

- Body: a JSON [`Construct`](/reference/core#construct) (validated with `ConstructSchema`).
- Query: `format` (default `atom`).
- Responses: `200`; `400` (unknown `format` or invalid construct body, with `detail`);
  `502` on build failure.

::: tip Construct format note
The API serves only flattened feed formats for constructs. The grouped, multi-page HTML view
lives in [`@neurowire/web`](/reference/web).
:::

## Sync endpoints

`packages/api/src/sync.ts` serves [`nwf-sync/1`](/formats/nwf-sync), the peer delta-exchange
protocol: four read-only routes that let another node pull journal deltas instead of
re-fetching every upstream source itself. They are mounted at `/sync/*`, and every response
carries `NWF-Sync-Version: 1`.

**Nothing is published by default.** A node exposes journals explicitly, via
`NEUROWIRE_SYNC_PUBLISH` or `~/.config/neurowire/sync.json`. An unpublished id and a
nonexistent id answer the same `404`.

| Endpoint | Returns |
|----------|---------|
| `GET /sync/journals` | JSON: the published journals, each with `id`, `title`, `head`, `entries`, `segments`, `bytes`, `updated`. |
| `GET /sync/head?journal=<id>` | JSON `{ journal, head, hash? }`. The cheap poll target. |
| `GET /sync/since?journal=<id>&cursor=<c>` | One NWFJ segment after `c` (`application/x-nwf-journal`); `204` when up to date, `410` when the cursor predates retention. |
| `GET /sync/snapshot?journal=<id>&cursor=<c>` | The same, except a too-old cursor is clamped instead of failing. Bootstrap and `410` recovery. |

A `200` from `since` or `snapshot` adds `NWF-Sync-Journal`, `NWF-Sync-Head`,
`NWF-Sync-Range` (`<firstSeq>-<lastSeq>`), `NWF-Sync-Segment`, and `NWF-Sync-Complete`
(`1` when the response reaches the head). Responses hand back **one whole segment**, never a
concatenation: NWFJ dictionary indices are per segment and the chain reseeds at each `J`
header, so glued segments would decode and verify wrongly.

Statuses: `200`; `204` (cursor at or past the head); `400` (missing `journal`, path-like id,
or an unparseable `cursor`); `401` (a token is configured and was not presented); `404`
(not published); `410` (`since` only, body points at `/sync/snapshot`).

### Module exports

`packages/api/src/sync.ts` exports the sub-app and its helpers for anyone assembling a
custom server around them. The published package's entrypoint exports only `app`.

| Export | Description |
|--------|-------------|
| `sync` | The `Hono` sub-app holding the four routes, mounted by `app.ts` at `/sync`. |
| `SYNC_VERSION` / `SYNC_VERSION_HEADER` | `1` and `NWF-Sync-Version`. |
| `loadSyncConfig()` | The publish list and token: `sync.json` first, environment on top. A corrupt file publishes nothing rather than crashing. |
| `publishedJournalIds(config, store)` | The ids this node serves: every explicitly named id, plus every journal on disk when the list contains `*`. |
| `isPublished(id, config, store)` | Whether one id is exposed. |
| `describeJournal(store, id)` | One journal's listing entry. Everything but the title comes from the manifest. |
| `headCursor(store, id)` | The head cursor including its chain hash, read from the tail of the newest segment (the store's own `head()` reports only the sequence number). |
| `parseSyncCursor(raw)` | Parse a `cursor` query value (`42` or `42.<hash>`); `undefined` when unparseable. |

::: warning The chain is a checksum, not a signature
The bearer token gates access and the hash chain detects corruption. Nothing here
authenticates content origin, and `nwf-sync/1` does not sign anything. You sync from peers
you chose to trust, over TLS your proxy terminates. See the
[trust model](/formats/nwf-sync#integrity) and the [federation guide](/guide/federation).
:::

## Mesh resolution

`packages/api/src/meshes.ts` resolves a mesh name to a [`Mesh`](/reference/core#mesh). User
mesh directories are searched first (`NEUROWIRE_MESHES`, then
`~/.config/neurowire/meshes`), then the bundled defaults.

```ts
function resolveMesh(name: string): Mesh | undefined
function listMeshNames(): string[]
```

| Export | Description |
|--------|-------------|
| `resolveMesh(name)` | Resolve a named mesh (tries `<name>.mesh.json` then `<name>.json` in each dir, then the bundled `ai-news`). Path-like names are rejected. |
| `listMeshNames()` | Sorted names of all available meshes (bundled plus any found in the directories). |

A built-in `ai-news` mesh ships so `?src=ai-news` works with no setup.

## Construct resolution

`packages/api/src/constructs.ts` mirrors mesh resolution for
[`Construct`](/reference/core#construct)s, searching `NEUROWIRE_CONSTRUCTS` then
`~/.config/neurowire/constructs`, then the bundled defaults.

```ts
function resolveConstruct(name: string): Construct | undefined
function listConstructNames(): string[]
```

| Export | Description |
|--------|-------------|
| `resolveConstruct(name)` | Resolve a named construct (tries `<name>.construct.json` then `<name>.json`, then the bundled `daily`). Path-like names are rejected. |
| `listConstructNames()` | Sorted names of all available constructs (bundled plus directory entries). |

A built-in `daily` construct ships so `?src=daily` works with no setup.

## Response cache

`packages/api/src/cache.ts` provides the tiny in-memory TTL cache the handlers use for the
serialized result. The handlers also keep a [`createMemoryCache`](/reference/ingest#conditional-cache)
conditional cache so upstream fetches can 304 on a TTL miss.

```ts
interface CacheEntry {
  body: string
  contentType: string
  expires: number
}

interface TtlCache {
  get(key: string, now: number): CacheEntry | undefined
  set(key: string, entry: CacheEntry): void
}

function createTtlCache(): TtlCache
```

| Export | Description |
|--------|-------------|
| `CacheEntry` | A cached `body`, its `contentType`, and an `expires` epoch-ms timestamp. |
| `TtlCache` | A TTL cache; `now` is injected into `get` so expiry is testable. |
| `createTtlCache()` | Create a `Map`-backed `TtlCache`. |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Port the standalone server listens on. |
| `NEUROWIRE_CACHE_TTL` | `300` | Response cache TTL in seconds (matches the `Cache-Control: max-age=300`). |
| `NEUROWIRE_MESHES` | - | `:`/`,`-separated directories searched for named meshes. |
| `NEUROWIRE_CONSTRUCTS` | - | `:`/`,`-separated directories searched for named constructs. |
| `NEUROWIRE_TAPS` | - | Extra taps loaded at startup via `registerAllTaps()`. |
| `NEUROWIRE_JOURNAL` | `~/.config/neurowire/journal` | Journal store directory the `/sync/*` routes read. |
| `NEUROWIRE_SYNC_PUBLISH` | - | `:`/`,`-separated journal ids to publish over `/sync/*`, or `*` for all. Nothing is published without it. |
| `NEUROWIRE_SYNC_TOKEN` | - | Static bearer token required on every `/sync/*` request. Unset means open. |
| `NEUROWIRE_SYNC_CONFIG` | `~/.config/neurowire/sync.json` | Path to the `{ publish, token }` config file. |
| `XDG_CONFIG_HOME` | `~/.config` | Base for the default mesh/construct/tap directories. |
