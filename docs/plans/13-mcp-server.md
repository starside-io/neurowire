# Epic 13: `@neurowire/mcp` and the `starside` plugin marketplace

## Goal

Make Neurowire the feed layer for LLM agents, and ship it the way agents
actually get installed: one Claude Code plugin, from one marketplace you own,
bundling an MCP server plus skills.

**This epic is deliberately last.** It is a thin wrapper over everything the
other arcs build, and every epic that lands before it widens its tool surface:

| Earlier epic | What it gives the agent |
|---|---|
| 9, journal (shipped) | `whats_new` answers with a real cursor, not a lossy time window |
| 10, tap wizard | `propose_tap` / `verify_tap` become real tools, and the **only** place an LLM touches tap authoring |
| 11, tail | an agent can subscribe rather than poll |
| 12, sync | an agent can read a peer's archive without fetching the open web |

Building MCP first would mean shipping a tool surface that then churns four
times. Building it last means one stable surface that exposes the whole system.

## Layer 1: `llms.txt` (cheap, do it first)

Before any server, make the docs machine-readable. VitePress has a plugin that
emits a flat, token-efficient view of the site, with zero infrastructure. Given
Neurowire is *literally about producing clean machine-readable formats from messy
sources*, not shipping `llms.txt` would be a bad look.

- Add the plugin to `docs/.vitepress/config.ts`, emit `/llms.txt` and
  `/llms-full.txt` into `docs/.vitepress/dist`.
- Deployed by the same manual `vercel --prod` as the rest of the docs (see
  CLAUDE.md; pushing to main does not deploy).
- This alone lets any agent answer "how do I build a mesh" by fetching one URL.

## Layer 2: the MCP server

New workspace package `@neurowire/mcp`, bin `neurowire-mcp`.

- Runtime deps: `@neurowire/core`, `ingest`, `taps`, `taps-pack`,
  `@neurowire/tap-wizard` (Epic 10), `@modelcontextprotocol/sdk`, `zod`.
- Transport: stdio. HTTP is a non-goal; the existing api package already serves
  HTTP for anyone who wants it.
- Shape mirrors the api package: `mcp/src/server.ts` is pure and testable over an
  in-memory transport, `mcp/src/index.ts` is a thin bin that connects stdio and
  is coverage-excluded like `api/src/index.ts`.

### Tools

Every entry-returning tool takes `format` (`nwf` default, `json`) and `limit`
(default 30, max 200). NWF is the default precisely because it is the compact
one: fewer tokens per entry than Atom or JSON Feed, which turns the format's
original design goal into an agent-era feature.

| Tool | Backed by | Notes |
|---|---|---|
| `ingest_source(url)` | `fetchFeed` | any feed, or an HTML page via taps/auto-detect; returns the canonical model |
| `serialize(feed, format)` | `serialize` | NWF, Atom, RSS, JSON Feed, Markdown |
| `fetch_mesh(name \| sources)` | `fetchMesh` | named meshes resolve from config |
| `fetch_construct(name \| members)` | `fetchConstruct` | grouped summary, flattened entries |
| `query(target, filter, window, sort, limit)` | `filterEntries` + `selectEntries` | same semantics as the CLI flags |
| `query_journal(id, filter, window)` | Epic 9 `store.query` | archive search with segment pruning |
| `whats_new(target, cursor)` | Epic 9 cursors | returns fresh entries **plus the next cursor**; the tool description tells the agent to store it |
| `list_taps` / `resolve_tap(host)` | taps registry | what can this system already read? |
| `propose_tap(url)` / `verify_tap(url, template)` | Epic 10 | the agent proposes, the **deterministic gate** decides |
| `search_docs(query)` | the `llms.txt` index | answers "how do I build a mesh" without a hand-written skill |

**Where AI belongs in tap authoring.** Epic 10 has no model in it, by design. Here
an agent may draft a template, but it must pass `verify_tap`, the same gate the
CLI wizard uses. The model proposes; deterministic code disposes. That boundary is
the whole reason the AI lives in this epic and nowhere else.

### Resources and ergonomics

- Each named mesh and construct exposed as `neurowire://mesh/<name>` and
  `neurowire://construct/<name>` so an agent can discover configuration without
  spending a tool call.
- Every result opens with a one-line plain-text summary ("32 entries from 5
  sources, newest 2026-08-25") so an agent can triage without parsing.
- Errors are descriptive strings, never stack traces.

### Security posture

The server fetches arbitrary URLs on request, which is its job, but says so:
`NEUROWIRE_MCP_ALLOW` optionally restricts `ingest_source`/`query` to a host
allowlist (named meshes and constructs are always allowed, the operator
configured them). The server is otherwise read-only: it reads journals, it does
not write them, and `propose_tap` returns JSON rather than installing anything.

## Layer 3: distribution

Three channels, and we want all three. Only the first is under our control.

### 3a. One marketplace for starside, not one per project

A user can register only **one marketplace per name**, and adding a second with
the same name replaces the first. Multiple plugins therefore live in a single
`marketplace.json`. Per-product marketplaces would force users to run a separate
`/plugin marketplace add` for every starside tool, and those would compete for
shelf space in the same `/plugin` UI with no shared identity. The documented use
case for multiple marketplaces is release channels (stable vs latest pointing at
different refs), not product separation.

So: repo `starside-io/claude-plugins`, marketplace name `starside`. Installs read
`neurowire@starside`, `ghostwriter@starside`.

Each product keeps its own repo; the marketplace repo holds only the catalog:

```json
{
  "name": "starside",
  "description": "Agent tooling from starside.io",
  "owner": { "name": "starside.io", "url": "https://starside.io" },
  "plugins": [
    {
      "name": "ghostwriter",
      "source": { "source": "github", "repo": "starside-io/ghostwriter" },
      "description": "Makes generated text read as human-written",
      "license": "MIT",
      "homepage": "https://github.com/starside-io/ghostwriter"
    },
    {
      "name": "neurowire",
      "source": { "source": "github", "repo": "starside-io/neurowire" },
      "description": "Clean feeds from any blog, site, RSS, or Atom source"
    }
  ]
}
```

Two traps to avoid:

- A plugin's skills load from `skills/` under its source by default, but
  Ghostwriter's skill sits at `.claude/skills/ghostwriter/`. Add a
  `.claude-plugin/plugin.json` there with `"skills": ["./.claude/skills"]` so the
  existing layout keeps working for both Copilot and the plugin.
- If `plugin.json` sets `version`, users only get updates when that string
  changes, so it must be bumped every release. Omit it and Claude Code uses the
  resolved commit SHA instead, which is simpler for actively developed tools.

Validate with `claude plugin validate .` before pushing: it catches duplicate
names, non-kebab-case names, and bad sources. Names impersonating official
Anthropic marketplaces are blocked, so `starside` is fine, `anthropic-*` is not.

### 3b. Anthropic's community marketplace

`anthropics/claude-plugins-community` hosts third-party plugins that passed
automated validation and safety screening, each pinned to a commit SHA. Submit
via the in-app form. Note the distinction: the submission forms feed the
**community** marketplace; the official one is curated by Anthropic and inclusion
is at their discretion.

### 3c. The MCP registry

`registry.modelcontextprotocol.io` is a separate ecosystem with its own manifest.
It verifies `io.github.<user>` namespaces via GitHub OAuth, and custom domains via
a DNS TXT record carrying your registry token. **We own starside.io, so claim
`io.starside.neurowire` via the TXT record** rather than taking the GitHub
namespace.

Flow, automated in a release workflow: publish the npm package carrying the
`mcpName` validation metadata, install `mcp-publisher`, write `server.json`,
authenticate, publish.

### The payoff: bundle it

The `neurowire` entry in the marketplace declares the MCP server in `mcpServers`
plus a couple of skills, so **one install gives a user the docs knowledge and the
live tools together**. That is the argument for the shared marketplace:
`neurowire@starside` and `ghostwriter@starside` arrive from one `add`, and
anything built next joins without users doing anything.

## Non-goals

- No HTTP/SSE MCP transport (the api package already serves HTTP).
- No tap installation or mutation from the agent side; `propose_tap` returns JSON.
- No LLM calls *inside* Neurowire. The agent is the model; our code stays
  deterministic. Epic 10 holds that line for tap authoring.
- No auth beyond "it is a local stdio process"; the operator's shell is the trust
  boundary, same stance as Epic 4.

## Dependencies

- **Soft on 9** (shipped): `whats_new` and `query_journal` need cursors.
- **Soft on 10**: `propose_tap` / `verify_tap` need the deterministic gate.
- **Soft on 11 and 12**: subscription and peer-archive tools.

None are hard. The server can ship with the tools whose epics have landed and
grow, but shipping it last is the point: one stable surface instead of four
revisions.

## Files touched

| File | Change |
|------|--------|
| `docs/.vitepress/config.ts` | the `llms.txt` plugin |
| `packages/mcp/package.json`, `tsconfig.json`, `tsup.config.ts` | new package, `neurowire-mcp` bin |
| `packages/mcp/src/server.ts` + test | server factory, tools, resources |
| `packages/mcp/src/index.ts` | thin stdio entrypoint (coverage-excluded) |
| `packages/mcp/server.json` | MCP registry manifest (`io.starside.neurowire`) |
| `.claude-plugin/plugin.json` | plugin manifest: `mcpServers` + skills |
| `.github/workflows/release-mcp.yml` | npm publish with `mcpName`, then `mcp-publisher` |
| `vitest.config.ts` | thresholds for `mcp` (85/85/85, like api) |
| `docs/reference/mcp.md`, `docs/guide/agents.md` | reference plus a setup guide |
| `README.md` | package table row and install line |

Separately, in `starside-io/claude-plugins`: `.claude-plugin/marketplace.json`
with both products.

## Steps

1. `llms.txt` in the docs build. Ship and verify the live URL first; it is
   independently useful and unblocks `search_docs`.
2. Scaffold the package (copy api's build/test shape).
3. Tools over already-shipped surface: `ingest_source`, `serialize`, `fetch_mesh`,
   `fetch_construct`, `query`, `list_taps`, `search_docs`.
4. Journal tools: `query_journal`, `whats_new` with cursors.
5. Tap tools once Epic 10 lands: `propose_tap`, `verify_tap`.
6. `.claude-plugin/plugin.json`, then the `starside` marketplace repo;
   `claude plugin validate .` in CI.
7. MCP registry: DNS TXT for `io.starside.neurowire`, `server.json`, publisher
   workflow.
8. Submit to the community marketplace.

## Tests

- Tool schemas reject bad input with a useful message, never a throw.
- Each tool against offline fixtures: NWF and JSON output, limit clamping,
  summary preamble present.
- Allowlist blocks a non-allowed host with the documented error.
- `whats_new` returns a cursor that, replayed, yields exactly the delta.
- `verify_tap` rejects a template that fails the Epic 10 gate, even when the
  agent insists it is correct. This is the test that proves the boundary holds.
- Live smoke (`*.live.test.ts`, `NEUROWIRE_LIVE=1`) over one real mesh.
- `claude plugin validate .` runs in CI for the marketplace repo.

## Risks

- **MCP SDK churn.** Pin the SDK minor; keep handlers behind our own thin types
  so a transport change touches one file.
- **Token blowouts from large meshes.** Hard `limit` cap, NWF default, and a
  documented token-cost-per-format table in the reference page.
- **Marketplace name collision or rejection.** `starside` is unreserved and does
  not impersonate Anthropic; validate before pushing.
- **Registry namespace verification.** DNS TXT on starside.io is under our
  control; the GitHub namespace is the fallback if DNS becomes awkward.

## Acceptance

- `/plugin marketplace add starside-io/claude-plugins` then
  `/plugin install neurowire@starside` yields a working MCP server plus skills in
  one step.
- "What shipped in AI tooling this week?" answers correctly against the bundled
  `ai-news` mesh, and a follow-up "anything new since?" uses the stored cursor.
- `https://neurowire.starside.io/llms.txt` returns the flattened docs.
- `io.starside.neurowire` resolves on registry.modelcontextprotocol.io.
- Coverage thresholds green; docs build passes.
