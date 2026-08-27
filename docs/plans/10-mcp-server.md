# Epic 10: `@neurowire/mcp` (feeds as agent tools)

## Goal

Make Neurowire the feed layer for LLM agents. A new package exposes the whole
stack (fetch, taps, meshes, constructs, filters, windows) as an MCP server, so
any MCP-capable agent can ask "what is new in AI tooling this week" and get a
compact, token-cheap answer.

NWF's compactness becomes a first-class feature here: the same list of entries
costs a fraction of the tokens of Atom or JSON Feed, so NWF is the default tool
output, with JSON available for agents that want structure.

## Package design

New workspace package `packages/mcp`, publishing `@neurowire/mcp` with a
`neurowire-mcp` bin.

- Runtime deps: `@neurowire/core`, `@neurowire/ingest`, `@neurowire/taps`,
  `@neurowire/taps-pack`, `@modelcontextprotocol/sdk`, `zod`.
- Dependency direction extends the existing chain: `core` <- `ingest` <- `taps`
  <- `mcp` (a sibling of `cli`/`api`/`web`).
- Transport: stdio (the standard for local MCP servers). An HTTP transport is a
  non-goal; agents that want HTTP can front the existing API.
- Structure mirrors the api package: `mcp/src/server.ts` (pure: builds the
  server, all tool handlers, testable in-memory), `mcp/src/index.ts` (thin bin:
  connect stdio transport), so the entrypoint can be coverage-excluded like
  `api/src/index.ts` is.

## Tools

All inputs validated with zod schemas (the SDK uses them for the tool JSON
schema too). All entry-returning tools accept `format` (`nwf` default, `json`)
and `limit` (default 30, max 200) to keep token budgets sane.

| Tool | Input | Behavior |
|------|-------|----------|
| `fetch_feed` | `url`, `format?`, `limit?` | `fetchFeed` on one URL (feed or tapped/auto-detected HTML) |
| `fetch_mesh` | `name?` or inline `sources?`, `format?`, `limit?` | named mesh via `createConfigMeshResolver` plus bundled meshes, or an inline source list, through `fetchMesh` |
| `fetch_construct` | `name?` or inline members, `format?`, `limit?` | `fetchConstruct` + `flattenConstruct`; grouped summary in the text preamble |
| `query` | target (url/mesh/construct), `filter?`, `exclude?`, `since?`, `sort?`, `limit?` | reuses `filterEntries` + `selectEntries`, same semantics as the CLI flags |
| `whats_new` | target, `cursor?` | journal-backed delta (Epic 9): returns fresh entries plus the next cursor; without a journal falls back to a `since` window and says so |
| `list_sources` | `theme?` | catalog browsing: bundled meshes, user meshes/constructs from `~/.config/neurowire/`, taps-pack themes with their source counts |
| `propose_tap` | `url` | runs `proposeTemplate` and returns the candidate `FeedTemplate` JSON plus a sample of extracted items (bridges to Epic 11's forge later) |

Resources (read-only MCP resources, cheap wins): each named mesh and construct
exposed as `neurowire://mesh/<name>` and `neurowire://construct/<name>` so
agents can discover configuration without a tool call.

## Agent ergonomics rules

- Every tool result starts with a one-line plain-text summary ("32 entries from
  5 sources, newest 2026-08-25") before the payload, so an agent can triage
  without parsing.
- `whats_new` always returns the next cursor in a structured field; the tool
  description tells the agent to store and replay it.
- Errors are descriptive strings, never stack traces (same discipline as the
  API's error JSON).

## Security posture

The server fetches arbitrary URLs on request, which is its job, but it must be
explicit about it:

- Document that the server has network egress and inherits the fetch hardening
  (timeouts, retry caps) from ingest.
- `NEUROWIRE_MCP_ALLOW` (comma-separated host allowlist) optionally restricts
  `fetch_feed`/`query` targets; named meshes and constructs are always allowed
  since the operator configured them.
- No filesystem writes except nothing: the MCP server is read-only (journals it
  reads are written by the CLI/watch side). `propose_tap` returns JSON, it does
  not install taps.

## Non-goals

- No HTTP/SSE MCP transport (front the api package instead).
- No tap installation or mutation from the agent side.
- No LLM calls inside this package (that is Epic 11, and it stays out of the
  serving path).
- No auth story beyond "it is a local stdio process" (the operator's shell is
  the trust boundary, same stance as Epic 4 self-host).

## Dependencies

- Soft on **Epic 9**: `whats_new` degrades to time windows without it, so this
  epic can start in parallel and light up cursors when 9 lands.

## Files touched

| File | Change |
|------|--------|
| `packages/mcp/package.json`, `tsconfig.json`, `tsup.config.ts` | new package, `neurowire-mcp` bin |
| `packages/mcp/src/server.ts` | new: server factory + all tool/resource handlers |
| `packages/mcp/src/server.test.ts` | new: in-memory transport tests, offline fixtures |
| `packages/mcp/src/index.ts` | new: thin stdio entrypoint (coverage-excluded) |
| `pnpm-workspace.yaml` | already globs `packages/*`; verify |
| `vitest.config.ts` | coverage thresholds for `mcp` (start 85/85/85 like api) |
| `docs/reference/mcp.md` | new reference page; nav entry |
| `docs/guide/` | "Use with Claude Code / Claude Desktop" setup snippet (`claude mcp add neurowire -- neurowire-mcp`) |
| `README.md` | package table row |

## Steps

1. Scaffold the package (copy api's build/test shape).
2. `server.ts` with `fetch_feed`, `fetch_mesh`, `query`, `list_sources` first
   (pure reuse, no new semantics).
3. In-memory transport tests against fixture feeds (no network, same fixtures
   style as ingest).
4. Add `fetch_construct`, `propose_tap`, resources.
5. Add `whats_new` (window fallback now; cursor mode once Epic 9 lands).
6. Docs, changelog, `pnpm docs:build`.

## Tests

- Tool schemas: invalid input rejected with a useful message, never a throw.
- Each tool against offline fixtures: NWF and JSON outputs, limit clamping,
  summary preamble present.
- Allowlist: blocked host returns the documented error.
- `whats_new` fallback vs cursor mode (cursor mode gated on Epic 9's store).
- Live smoke test (`*.live.test.ts`, `NEUROWIRE_LIVE=1`) exercising one real
  mesh end to end through the in-memory client.

## Risks

- **MCP SDK churn.** Mitigate: pin the SDK minor version; keep every handler in
  `server.ts` behind our own thin types so a transport API change touches one
  file.
- **Token blowouts from huge meshes.** Mitigate: hard `limit` cap plus the NWF
  default; document typical token costs per format in the reference page.
- **SSRF-shaped complaints.** Mitigate: allowlist env var plus explicit docs;
  the server is local-first by design.

## Acceptance

- `claude mcp add neurowire -- neurowire-mcp` followed by "what's new in the
  ai-news mesh today?" works in Claude Code against the bundled mesh.
- All tools pass offline tests; live smoke passes with `NEUROWIRE_LIVE=1`.
- Coverage thresholds green; docs build passes.
