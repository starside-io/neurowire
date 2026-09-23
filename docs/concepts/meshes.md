# Meshes

A **mesh** is a named bundle of sources that fetch in parallel and merge into one feed. Point a mesh at several blogs, releases pages, and RSS feeds, and get back a single newest-first feed in any [output format](/concepts/output-formats).

The `Mesh` type lives in [`@neurowire/core`](https://github.com/neurowire/neurowire) (`packages/core/src/model.ts`); fetching and merging live in `fetchMesh` (`packages/ingest/src/mesh.ts`).

## Shape

A mesh is a `name` plus a list of `sources`, each a display `name` and a `url` (a feed URL or a website Neurowire can ingest), with optional per-source request `headers`:

```ts
export const MeshSourceSchema = z.object({
  name: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
})
export const MeshSchema = z.object({ name: z.string(), sources: z.array(MeshSourceSchema) })
```

```json
{
  "name": "AI News",
  "sources": [
    { "name": "Claude Code Releases", "url": "https://github.com/anthropics/claude-code/releases.atom" },
    { "name": "Claude Blog", "url": "https://claude.com/blog" },
    { "name": "Simon Willison", "url": "https://simonwillison.net/atom/everything/" }
  ]
}
```

`parseMesh(data)` validates an unknown value into a `Mesh`.

## How fetching and merging work

`fetchMesh(mesh, options)` fetches every source **in parallel** (`Promise.allSettled`) and then merges the results into one feed via `mergeFeeds`:

- Each entry is **tagged by source** (the source name carries through), so a rendered page or feed can show where each item came from.
- Entries are **deduplicated** (the [stable entry ids](/concepts/model#stable-synthetic-entry-ids-content-hashing) make the same article from two sources collapse into one).
- The merged feed is sorted **newest-first**.
- An optional `limit` keeps only the newest N merged entries.

## Partial-failure semantics

A mesh is resilient by design. A source that fails to fetch is **logged and skipped**, never fatal:

- Each failure goes through `onSourceError(source, error)`, which by default writes a one-line warning to stderr with the source name and a short reason.
- The mesh still merges and returns whatever sources succeeded.
- It throws **only when every source fails**: `Mesh "<name>": no sources could be fetched`.

You can pass a custom `onSourceError` handler to silence or redirect those warnings.

```ts
import { fetchMesh } from '@neurowire/ingest'

const feed = await fetchMesh(mesh, {
  limit: 50,
  onSourceError: (source, err) => log.warn(`skip ${source.name}: ${err}`),
})
```

`FetchMeshOptions` also forwards the shared fetch tuning (`signal`, `cache`, `timeoutMs`, `retries`, `backoffMs`) to every source. A single `cache` is shared across all sources in the mesh. See [Fetching](/concepts/fetching) for what those do.

## Private sources: per-source headers

A source can carry request `headers`, sent only when fetching that source. That is how a mesh reads a private feed: a GitHub token for a private repository's releases feed, a bearer token for an internal API, a basic-auth header for a password-protected RSS endpoint.

```json
{
  "name": "Internal",
  "sources": [
    {
      "name": "Private releases",
      "url": "https://api.github.com/repos/acme/private/releases",
      "headers": { "authorization": "Bearer ${GITHUB_TOKEN}" }
    },
    { "name": "Public blog", "url": "https://acme.example/blog" }
  ]
}
```

Three rules keep this safe:

- **Mesh files never hold a literal token.** Header values may reference `${ENV_VAR}`; every loader that reads mesh JSON from local config (the CLI, the API's named meshes, the MCP catalog) resolves those references at load time and throws if a referenced variable is unset or empty, naming the mesh, source, and header. A missing secret fails at startup, not as a confusing `401` later.
- **Headers stay on their origin.** Credential headers (`authorization`, `proxy-authorization`, `cookie`) are sent to the source URL and its same-origin redirects only. A redirect or a discovered feed link on another origin is fetched without them, so a token meant for one host never reaches a host the page chose. See [Fetching](/concepts/fetching#caller-headers-and-redirects).
- **Only local config can set headers.** Meshes supplied by a remote caller (`POST /mesh`, `POST /construct`, and the MCP `fetch_mesh` / `fetch_construct` inline inputs) are parsed with `PublicMeshSchema`, which drops `headers`. A caller cannot make a server send credentials, and the `${ENV_VAR}` substitution never runs on their input, so they cannot read the server's environment through a URL they control.

Headers are not part of the conditional-cache key and are never written to the partial-failure warning on stderr.

## Named meshes from config

Meshes can be stored as JSON files and referred to by name. The config directories are searched in order:

1. Directories in the `NEUROWIRE_MESHES` env var (`:` or `,` separated).
2. `~/.config/neurowire/meshes/` (or `$XDG_CONFIG_HOME/neurowire/meshes`).

Files are matched as `<name>.mesh.json` then `<name>.json`. Names must be simple identifiers; anything path-like is rejected to prevent directory traversal.

## Bundled `ai-news`

So that `?src=ai-news` works with no setup, the API ships one built-in mesh, `ai-news` ("AI News"), with three sources: Claude Code Releases, the Claude Blog, and Simon Willison's feed (see `packages/api/src/meshes.ts`). User mesh directories take precedence over the bundled defaults.

::: tip
A mesh groups sources into one flat feed. To group several **meshes** into a repo of feeds (with the per-mesh grouping preserved), use a [construct](/concepts/constructs).
:::
