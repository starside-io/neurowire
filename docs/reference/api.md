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
| `XDG_CONFIG_HOME` | `~/.config` | Base for the default mesh/construct/tap directories. |
