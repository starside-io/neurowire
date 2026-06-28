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
# {"status":"ok","service":"neurowire","version":"0.4.0"}
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

An invalid body returns `400` with `{ error, detail }`.

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

## Bundled defaults

The API ships one bundled mesh (`ai-news`) and one bundled construct (`daily`), so `?src=ai-news` and `?src=daily` work with no setup. Add your own by dropping JSON files into the mesh/construct directories (see [Meshes](/concepts/meshes) and [Constructs](/concepts/constructs)). Names must be simple identifiers; anything path-like is rejected to avoid directory traversal.
