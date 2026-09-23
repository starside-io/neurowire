# @neurowire/api

The Neurowire HTTP service (version 0.5.0): a [Hono](https://hono.dev) app that serves
feeds, meshes, and constructs as NWF, Atom, RSS, JSON Feed, or Markdown, and streams them
live over SSE. It registers the
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

<figure class="nw-fig">
<div class="nw-fig__scroll">
<svg viewBox="0 0 820 350" role="img" aria-labelledby="api-t api-d" preserveAspectRatio="xMidYMid meet">
  <title id="api-t">How a request moves through the service</title>
  <desc id="api-d">Feed routes resolve a target, check the TTL response cache, fetch upstream through a conditional cache, then serialize. The tail route holds long-lived streams on shared poll loops, and the sync routes read the journal store from disk without touching the network.</desc>

  <rect class="nwd-box" x="16" y="146" width="128" height="58" rx="10" />
  <text class="nwd-title" x="80" y="171" text-anchor="middle">Request</text>
  <text class="nwd-sub" x="80" y="189" text-anchor="middle">Hono app</text>

  <path class="nwd-line" d="M144 175 H186 V58 H228" />
  <polygon class="nwd-head" points="236,58 228,53.5 228,62.5" />
  <path class="nwd-line" d="M186 175 H228" />
  <polygon class="nwd-head" points="236,175 228,170.5 228,179.5" />
  <path class="nwd-line" d="M186 175 V292 H228" />
  <polygon class="nwd-head" points="236,292 228,287.5 228,296.5" />

  <rect class="nwd-box" x="236" y="30" width="216" height="58" rx="10" />
  <text class="nwd-title" x="254" y="54">/feed /mesh /construct</text>
  <text class="nwd-sub" x="254" y="72">serialized, cached 300s</text>

  <rect class="nwd-box nwd-box--accent" x="236" y="146" width="216" height="58" rx="10" />
  <text class="nwd-title" x="254" y="170">/tail</text>
  <text class="nwd-sub" x="254" y="188">one stream, held open</text>

  <rect class="nwd-box" x="236" y="264" width="216" height="58" rx="10" />
  <text class="nwd-title" x="254" y="288">/sync/*</text>
  <text class="nwd-sub" x="254" y="306">read only, opt-in publish</text>

  <path class="nwd-line" d="M452 58 H556" />
  <polygon class="nwd-head" points="564,58 556,53.5 556,62.5" />
  <text class="nwd-sub" x="504" y="49" text-anchor="middle">miss</text>

  <path class="nwd-line nwd-line--accent" d="M452 175 H556" />
  <polygon class="nwd-head--accent" points="564,175 556,170.5 556,179.5" />
  <text class="nwd-sub nwd-accent" x="504" y="166" text-anchor="middle">poll</text>

  <path class="nwd-line" d="M452 292 H556" />
  <polygon class="nwd-head" points="564,292 556,287.5 556,296.5" />

  <rect class="nwd-box" x="564" y="30" width="240" height="58" rx="10" />
  <text class="nwd-title" x="582" y="54">Upstream fetch</text>
  <text class="nwd-sub" x="582" y="72">conditional cache, 304 on repeat</text>

  <rect class="nwd-box nwd-box--accent" x="564" y="146" width="240" height="58" rx="10" />
  <text class="nwd-title" x="582" y="170">Shared poll loop</text>
  <text class="nwd-sub" x="582" y="188">by target, interval, journal</text>

  <rect class="nwd-box" x="564" y="264" width="240" height="58" rx="10" />
  <text class="nwd-title" x="582" y="288">Journal store on disk</text>
  <text class="nwd-sub" x="582" y="306">NWFJ segments, no network</text>

  <path class="nwd-line nwd-line--dash" d="M684 204 V264" />
  <polygon class="nwd-head" points="684,264 679.5,256 688.5,256" />
  <text class="nwd-sub" x="676" y="238" text-anchor="end">appends, when journaled</text>
</svg>
</div>
<figcaption>Three shapes of route on one app: cached one-shot serializations, long-lived streams sharing an upstream poll, and read-only reads straight off the journal store.</figcaption>
</figure>

### `GET /`

Service descriptor. Returns JSON with `name`, `version`, the supported `formats`, the
`endpoints` summary, and the available `meshes` and `constructs` names.

### `GET /healthz`

Liveness probe. Returns `{ status: 'ok', service: 'neurowire', version: '0.5.0' }`.

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

- Body: a JSON [`Mesh`](/reference/core#mesh) (validated with `PublicMeshSchema`: a
  `headers` key on a source is dropped, so a request cannot attach credentials).
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

- Body: a JSON [`Construct`](/reference/core#construct) (validated with
  `PublicConstructSchema`: inline meshes lose any per-source `headers`).
- Query: `format` (default `atom`).
- Responses: `200`; `400` (unknown `format` or invalid construct body, with `detail`);
  `502` on build failure.

::: tip Construct format note
The API serves only flattened feed formats for constructs. The grouped, multi-page HTML view
lives in [`@neurowire/web`](/reference/web).
:::

### `GET /tail`

Follow a target as a server-sent event stream, built on Hono's `streamSSE`.

| Query | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` / `src` / `construct` | one of | - | The target, same values as `/feed`, `/mesh`, and `/construct`. |
| `format` | no | `json` | `json` (one entry object per event) or `nwf` (that entry's NWFJ lines). |
| `interval` | no | `300` | Seconds, or a duration like `15m`. Clamped up to a 60 second floor. |
| `journal` | no | - | A journal id already present in the store, which enables cursor resume. |
| `since` | no | - | A journal cursor to replay from; `Last-Event-ID` carries the same value. |

Events: `init` (target, format, effective interval, `resume` of `journal` or `live`, journal
`head`, `replayed` count), `entry` per entry with its cursor as the event `id`, and a
`: ping` comment every `NEUROWIRE_TAIL_HEARTBEAT_MS`. Responses: `200` (`text/event-stream`,
plus `X-Accel-Buffering: no`); `400` (no target, or an unknown tail format); `404` (unknown
mesh or construct). Every error is decided before the stream opens.

`packages/api/src/tail.ts` keeps a registry of poll loops keyed by target, interval, and
journal id, so all clients asking for the same thing share a single upstream poll; the loop
starts with the first subscriber and is torn down when the last one leaves. A late joiner is
handed the newest items the loop has already broadcast (up to 50) so it is not behind. With a
journal attached the loop appends what it sees and seeds its seen-set from the journal, which
is what makes event ids real cursors and `Last-Event-ID` a lossless resume.

| Export | Description |
|--------|-------------|
| `tailHandler(c)` | The route handler mounted at `GET /tail`. |
| `resolveTailTarget(query)` | Resolve `url`/`src`/`construct` into a loadable target, or a `400`/`404` body. |
| `resolveTailInterval(raw)` | Apply the default and the 60 second floor to a requested interval. |
| `resolveTailJournal(id)` | The journal to replay from and write through, when the id exists. |
| `parseTailCursor(value)` | Parse `42` or `42.<hash>` into a `JournalCursor`. |
| `subscribeTail(key, options, listener)` | Attach to (or start) the shared poll loop for a target. |
| `tailLoopCount()` / `stopAllTails()` | Inspect and tear down the running loops. |
| `heartbeatMs()` | The keep-alive comment interval. |
| `TailTarget`, `TailItem`, `TailBroadcast`, `TailJournal`, `TailLoopOptions`, `TailSubscription` | The registry's types. |

See the [Tail concept page](/concepts/tail) for the polling semantics this route inherits from
[`pollFeed`](/reference/ingest#poll-engine).

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
| `NEUROWIRE_JOURNAL` | - | Journal directory `GET /tail` replays from (else `~/.config/neurowire/journal`). |
| `NEUROWIRE_TAIL_HEARTBEAT_MS` | `25000` | How often `GET /tail` writes its keep-alive comment. |
| `NEUROWIRE_CONSTRUCTS` | - | `:`/`,`-separated directories searched for named constructs. |
| `NEUROWIRE_TAPS` | - | Extra taps loaded at startup via `registerAllTaps()`. |
| `NEUROWIRE_JOURNAL` | `~/.config/neurowire/journal` | Journal store directory the `/sync/*` routes read. |
| `NEUROWIRE_SYNC_PUBLISH` | - | `:`/`,`-separated journal ids to publish over `/sync/*`, or `*` for all. Nothing is published without it. |
| `NEUROWIRE_SYNC_TOKEN` | - | Static bearer token required on every `/sync/*` request. Unset means open. |
| `NEUROWIRE_SYNC_CONFIG` | `~/.config/neurowire/sync.json` | Path to the `{ publish, token }` config file. |
| `XDG_CONFIG_HOME` | `~/.config` | Base for the default mesh/construct/tap directories. |
