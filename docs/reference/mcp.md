# @neurowire/mcp

A stdio [MCP](https://modelcontextprotocol.io) server that exposes Neurowire to LLM agents:
feeds, meshes, constructs, journals, tap verification, and a docs search. It is a thin
layer over the other packages, so a tool answers exactly what the CLI or library answers.

```bash
npx -y @neurowire/mcp
```

Depends on `core`, [`ingest`](/reference/ingest), [`taps`](/reference/taps),
[`taps-pack`](/reference/taps-pack), [`tap-wizard`](/reference/tap-wizard), and
`@modelcontextprotocol/sdk`. For installing it into an agent, see
[Agents (MCP)](/guide/agents).

## Library export

```ts
import { createServer } from '@neurowire/mcp'
```

| Export | Description |
|--------|-------------|
| `createServer(deps?)` | Build the `McpServer` with every tool and resource registered. It connects no transport: attach `StdioServerTransport`, or an in-memory pair in tests. `deps` overrides the fetchers, the journal store, the catalog, the docs index, the allowlist, and the clock. |

The `neurowire-mcp` bin registers the taps-pack taps, then the bundled and user taps (so a
user tap wins a host collision), reads `NEUROWIRE_MCP_ALLOW`, and connects stdio.

## Result conventions

- **NWF by default.** Every entry-returning tool takes `format` (`nwf` default, or `atom`,
  `rss`, `json`, `md`). NWF is the most compact format, which keeps agent context small.
- **Capped.** `limit` defaults to 30. Values above 200 are clamped, not rejected.
- **Summary first.** Every entry result opens with one line, for example
  `32 entries (showing 30) from 5 sources, newest 2026-08-25`, then any notes (a cursor,
  per-mesh summaries), a blank line, and the serialized body.
- **Errors are sentences.** A failed call returns `isError` with a message such as
  `no mesh named "x". Available: ai-news, daily`. Input that fails the schema is also
  reported as a tool error, never a crash.

## Tools

### Feeds

| Tool | Input | Backed by |
|------|-------|-----------|
| `ingest_source` | `url`, `format?`, `limit?` | `fetchFeed`: any feed, or an HTML page via taps and auto-detect |
| `serialize` | `feed` (canonical model), `format` | `serialize`. No network. |
| `fetch_mesh` | `name` or `sources: [{ name, url }]`, `format?`, `limit?` | `fetchMesh` |
| `fetch_construct` | `name` or `construct`, `format?`, `limit?` | `fetchConstruct` + `flattenConstruct`; one summary line per mesh |
| `query` | exactly one of `url`, `mesh`, `construct`; then the refine fields below | `filterEntries` + `selectEntries` |

The refine fields, shared by `query` and `query_journal`, mirror the CLI flags:

| Field | Meaning |
|-------|---------|
| `include`, `exclude` | `field:pattern` rules over `title`, `summary`, `source`, `author`, `tag`. `/pattern/` is a regex. |
| `since` | A duration: `24h`, `90m`, `7d`. |
| `today`, `thisWeek` | Since midnight UTC, or since Monday. |
| `between` | `<start>..<end>` as ISO dates. |
| `sort`, `order` | `date`, `title`, or `source`; `asc` or `desc`. |

### Journals

| Tool | Input | Behavior |
|------|-------|----------|
| `query_journal` | `id`, refine fields, `format?`, `limit?` | Queries the [journal store](/concepts/journals) with segment pruning, and notes how many segments were scanned and skipped. |
| `whats_new` | `journal`, `cursor?`, `format?`, `limit?` | Without a cursor: the latest entries and `cursor: <head>`. With one: exactly the entries appended since, and the next cursor. |

`whats_new` pages rather than drops. When more entries arrived than `limit`, the note reads
`cursor: <seq> (more waiting, call again with it)`, where `<seq>` is the last entry
returned, so the next call continues without a gap. A cursor older than the store's
retention still answers, with a warning that the delta is incomplete. Journal tools read
local disk only; they never append.

### Taps

| Tool | Input | Behavior |
|------|-------|----------|
| `list_taps` | none | Hosts with a registered tap. |
| `resolve_tap` | `host` | The tap for a host, as JSON. |
| `propose_tap` | `url` | Fetches the page, drafts a template with `proposeTemplate`, and runs `verifyTemplate` on it. Returns the draft and the report. |
| `verify_tap` | `url`, `template` | Runs `verifyTemplate`. Opens with `PASSED` or `REJECTED` and the failed checks. |

This is the only place a model touches tap authoring, and it only proposes. `verify_tap` is
the same gate `neurowire tap wizard` uses, so a template that fails it is rejected no matter
what the agent claims about it. Neither tool installs anything.

### Docs

| Tool | Input | Behavior |
|------|-------|----------|
| `search_docs` | `query`, `limit?` (max 10, default 5) | Searches the published [`llms-full.txt`](https://neurowire.starside.io/llms-full.txt), returning matching sections with their page URL. The index is fetched once and cached. |

## Resources

| URI | Content |
|-----|---------|
| `neurowire://mesh/<name>` | A named mesh as JSON. Resolves from `NEUROWIRE_MESHES`, `~/.config/neurowire/meshes`, the bundled `ai-news`, then taps-pack theme keys. |
| `neurowire://construct/<name>` | A named construct as JSON. Resolves from `NEUROWIRE_CONSTRUCTS`, `~/.config/neurowire/constructs`, then the bundled `daily`. |

Both are listable, so an agent discovers the operator's configuration without a tool call.

## Security

The server fetches URLs on request, which is its job. Set `NEUROWIRE_MCP_ALLOW` to a comma
separated host list to restrict every caller-supplied URL (`ingest_source`, `query` with
`url`, inline mesh and construct sources, and the tap tools) to those hosts and their
subdomains. For the tap tools the check also runs on every redirect hop. Named meshes and
constructs are always allowed: the operator configured them.

Inline meshes and constructs passed to `fetch_mesh` and `fetch_construct` are parsed with
the public schemas from `@neurowire/core`, which drop per-source `headers`. Only the
operator's own mesh files can attach request headers (with `${ENV_VAR}` references resolved
from the server's environment at load), so a client cannot inject an `Authorization` header
or read the server's environment through a URL it controls.

Otherwise the server is read-only. It reads journals and never writes them, and the tap
tools return JSON rather than installing anything. There is no auth beyond it being a
local stdio process: the operator's shell is the trust boundary.

## Token cost by format

NWF interns authors, tags, and sources and stores links relative to a shared base, so it
is the smallest encoding of the same entries. Prefer it for anything the agent reads, `json`
when it needs structured fields, and `md` for text shown to a person verbatim.

| Format | Relative size |
|--------|---------------|
| `nwf` | smallest |
| `md` | small, human-readable |
| `json` | larger, structured |
| `atom`, `rss` | largest, XML |
