# HTTP API

`@neurowire/api` is a small [Hono](https://hono.dev) service that exposes Neurowire over HTTP: convert a feed, serve a named mesh or construct, or build one from a posted body. It serves the feed formats only (NWF, Atom, RSS, JSON Feed, Markdown). HTML is not a feed format and lives in `@neurowire/web`.

## Running it

The package ships a `neurowire-api` binary that starts the server.

::: code-group

```bash [pnpm]
pnpm add @neurowire/api
pnpm exec neurowire-api
```

```bash [npm]
npm install @neurowire/api
npx neurowire-api
```

:::

It listens on `http://localhost:8787` by default and prints the bound URL on start. The `app` (a Hono instance) is also exported, so you can mount it in your own server or test it with `app.fetch`.

::: warning No built-in auth or rate limiting
The API ships with no authentication and no rate limiting. If you expose it publicly, put it behind a proxy, gateway, or auth layer of your own. That is the operator's responsibility.

The one exception is the peer sync surface: `/sync/*` takes an optional bearer token, and publishes nothing at all unless you name the journals. That is access control for a surface that hands out whole archives, not a general auth layer for the service.
:::

## Configuration

All configuration is via environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | Port the server listens on. |
| `NEUROWIRE_CACHE_TTL` | `300` | Response cache TTL in seconds (matches the `Cache-Control: max-age=300` header). |
| `NEUROWIRE_MESHES` | (unset) | Extra mesh directories (`:` or `,` separated), searched before `~/.config/neurowire/meshes`. |
| `NEUROWIRE_CONSTRUCTS` | (unset) | Extra construct directories, searched before `~/.config/neurowire/constructs`. |
| `NEUROWIRE_TAPS` | (unset) | Extra taps (path or `:`-separated list); built-ins always load. |
| `NEUROWIRE_JOURNAL` | `~/.config/neurowire/journal` | Journal store the `/sync/*` routes read and `GET /tail` replays from. |
| `NEUROWIRE_TAIL_HEARTBEAT_MS` | `25000` | How often `GET /tail` writes a keep-alive comment. |
| `NEUROWIRE_SYNC_PUBLISH` | (unset) | Journal ids to publish over `/sync/*` (`:` or `,` separated), or `*` for all. Nothing is published without it. |
| `NEUROWIRE_SYNC_TOKEN` | (unset) | Bearer token required on every `/sync/*` request. Unset means those routes are open. |
| `NEUROWIRE_SYNC_CONFIG` | `~/.config/neurowire/sync.json` | File holding `{ "publish": [...], "token": "..." }`, if you prefer it to the env. |

## Caching

Each `GET` route caches its serialized response in an in-memory TTL cache keyed by source and format. Upstream fetches use a separate conditional cache so a TTL miss can revalidate (ETag / Last-Modified) instead of refetching the whole document. Every response carries `Cache-Control: public, max-age=300`.

## Endpoints

### GET /

Service metadata: name, version, supported formats, the endpoint map, and the names of all available meshes and constructs.

```bash
curl http://localhost:8787/
```

### GET /healthz

Liveness check.

```bash
curl http://localhost:8787/healthz
# {"status":"ok","service":"neurowire","version":"0.5.0"}
```

### GET /feed

Convert any feed or website URL. Query params:

- `url` (required): the source URL.
- `format` (optional, default `atom`): one of `nwf`, `atom`, `rss`, `json`, `md`.

```bash
curl "http://localhost:8787/feed?url=https%3A%2F%2Fblog.rust-lang.org%2Ffeed.xml&format=json"
```

A missing `url` returns `400`; an unknown `format` returns `400`; an upstream failure returns `502` with `{ error, detail }`.

### GET /mesh

Serve a **named** mesh, resolved from your mesh directories then the bundled `ai-news`. Query params:

- `src` (required): the mesh name.
- `format` (optional, default `atom`).

```bash
curl "http://localhost:8787/mesh?src=ai-news&format=atom"
```

A missing `src` returns `400` (with the list of known meshes); an unknown mesh returns `404`.

### POST /mesh

Build a mesh from a JSON body (no named lookup). The body is validated against the mesh schema. `format` is a query param (default `atom`).

```bash
curl -X POST "http://localhost:8787/mesh?format=json" \
  -H 'content-type: application/json' \
  -d '{
    "name": "AI News",
    "sources": [
      { "name": "Claude Blog", "url": "https://claude.com/blog" }
    ]
  }'
```

An invalid body returns `400` with `{ error, detail }`. A `headers` key on a posted source is dropped: per-source headers come only from the server's own mesh files, never from a request body, so a caller cannot make the server send credentials.

### GET /construct

Serve a **named** construct, resolved from your construct directories then the bundled `daily`. The construct is fetched and flattened into one feed. Query params:

- `src` (required): the construct name.
- `format` (optional, default `atom`).

```bash
curl "http://localhost:8787/construct?src=daily&format=json"
```

A missing `src` returns `400` (with the list of known constructs); an unknown construct returns `404`. `format=html` is rejected like any unknown format, because the API serves feed formats only.

### POST /construct

Build a construct from a JSON body. Inline meshes and `{ ref }` members are accepted; refs are resolved against the named meshes (same lookup as `GET /mesh`). The result is flattened. `format` is a query param (default `atom`).

```bash
curl -X POST "http://localhost:8787/construct?format=atom" \
  -H 'content-type: application/json' \
  -d '{
    "name": "Daily",
    "meshes": [
      "ai-news",
      { "name": "Releases", "sources": [
        { "name": "Claude Code", "url": "https://github.com/anthropics/claude-code/releases.atom" }
      ] }
    ]
  }'
```

### GET /tail

Follow a feed, mesh, or construct as a live [server-sent events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) stream. The server polls the target on an interval and pushes each new entry as it appears. Query params:

- One target, same as the routes above: `url=<encoded-url>`, `src=<mesh name>`, or `construct=<name>`.
- `format` (optional, default `json`): `json` sends one entry object per event, `nwf` sends the [NWFJ](/formats/nwfj) journal lines for that entry.
- `interval` (optional, default `300`): seconds, or a duration like `15m`. Clamped up to a floor of 60 seconds.
- `journal` (optional): the id of a journal on the server, which turns on replay (see below).
- `since` (optional): a journal cursor to replay from, the same value `Last-Event-ID` carries.

```bash
curl -N "http://localhost:8787/tail?src=ai-news&interval=120"
```

With `format=nwf` the events carry journal lines rather than JSON, so concatenating their `data` payloads gives a valid NWFJ document. Against a journaled target the `E` line's sequence number and the SSE event id are the same number.

Events:

| Event | Payload |
|-------|---------|
| `init` | JSON: the target, the format, the effective interval, whether resume is `journal` or `live`, the journal head, and how many entries were replayed. |
| `entry` | One entry: a JSON object, or its NWFJ lines when `format=nwf`. The event `id` is the entry's cursor: a journal cursor when the target is journaled, otherwise a counter local to the stream. |
| (comment) | `: ping` every 25 seconds, so buffering proxies keep the connection open. |

A missing target is a `400` and an unknown mesh or construct a `404`, both plain JSON: errors are decided before the stream opens, never mid-stream. An unknown `format` is a `400` too; `/tail` serves `json` and `nwf` only, not the feed formats the other routes take. Responses also carry `X-Accel-Buffering: no` for nginx.

The [Tail concept page](/concepts/tail) covers the polling semantics behind all of this: what counts as new, the interval floors, and how a failed tick is handled.

**One poll loop per target.** Every client following the same target shares a single upstream poll, so fifty browsers on `ai-news` cost one fetch per tick. The loop starts with the first subscriber and stops when the last one disconnects. Sharing is keyed by the target, the effective interval, and the journal, so a client that asks for a different cadence or a different journal gets its own loop rather than quietly riding someone else's.

**Resume.** Pass `journal=<id>` naming a journal that already exists on the server (created by `neurowire --journal <id>`, see [Journals](/concepts/journals)). The route then appends what it sees to that journal, so event ids are real cursors, and a client that reconnects with `Last-Event-ID` (or `?since=`) is replayed everything after that cursor before going live. Without a journal the tail is live-only, event ids are stream-local, and `init` reports `"resume": "live"`. The route never creates a journal of its own; an unknown id simply falls back to live-only.

::: tip Rate expectations
The interval floor is 60 seconds server-side, and each tick is jittered slightly so many tails on one host do not arrive together. Conditional requests mean an unchanged source usually costs a `304`, but pick an interval that suits the source rather than the floor.
:::

### GET /sync/*

Peer delta exchange over [`nwf-sync/1`](/formats/nwf-sync): `/sync/journals`, `/sync/head`, `/sync/since`, and `/sync/snapshot`, so another node can pull journal deltas instead of re-fetching every upstream source itself. These routes serve [journals](/concepts/journals), not feeds, so the `format` query does not apply to them.

They are inert until you set `NEUROWIRE_SYNC_PUBLISH`. See [Federation](/guide/federation) to set up a node, [Sync](/concepts/sync) for the trust model, and the [API reference](/reference/api#sync-endpoints) for every status code.

```bash
curl "http://localhost:8787/sync/head?journal=ai"
# {"journal":"ai","head":1284,"hash":"9f1c0f0b8ad0f0e3"}
```

## Bundled defaults

The API ships one bundled mesh (`ai-news`) and one bundled construct (`daily`), so `?src=ai-news` and `?src=daily` work with no setup. Add your own by dropping JSON files into the mesh/construct directories (see [Meshes](/concepts/meshes) and [Constructs](/concepts/constructs)). Names must be simple identifiers; anything path-like is rejected to avoid directory traversal.
