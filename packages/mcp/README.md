# @neurowire/mcp

An [MCP](https://modelcontextprotocol.io) server that gives LLM agents clean feeds from any
blog, site, RSS, Atom, or JSON Feed source, plus meshes, journals, and tap verification.
Transport is stdio.

```bash
npx -y @neurowire/mcp
```

Claude Code, as a plugin (server plus skills in one install):

```bash
/plugin marketplace add starside-io/claude-plugins
/plugin install neurowire@starside
```

Or register the server alone:

```bash
claude mcp add neurowire -- npx -y @neurowire/mcp
```

## Tools

| Tool | What it does |
|------|--------------|
| `ingest_source` | Fetch one feed or HTML listing page |
| `serialize` | Convert a canonical feed to NWF, Atom, RSS, JSON Feed, or Markdown |
| `fetch_mesh` | Fetch a named mesh or inline sources, merged |
| `fetch_construct` | Fetch a construct: per-mesh summaries plus flattened entries |
| `query` | Filter, window, sort, and limit a url, mesh, or construct |
| `query_journal` | Search a local journal archive |
| `whats_new` | Entries since a cursor, plus the next cursor |
| `list_taps` / `resolve_tap` | What the tap registry can already read |
| `propose_tap` / `verify_tap` | Draft a tap and run it through the deterministic gate |
| `search_docs` | Search the Neurowire docs |

Entry tools default to NWF (the most compact format), cap results at 200 (default 30),
and open every result with a one-line summary.

## Configuration

| Variable | Purpose |
|----------|---------|
| `NEUROWIRE_MCP_ALLOW` | Comma separated host allowlist for caller-supplied URLs. Unset allows every host. |
| `NEUROWIRE_MESHES`, `NEUROWIRE_CONSTRUCTS` | Extra directories for named meshes and constructs. |
| `NEUROWIRE_JOURNAL` | Journal directory (default `~/.config/neurowire/journal`). |
| `NEUROWIRE_TAPS` | Extra tap files or directories. |

Docs: <https://neurowire.starside.io/reference/mcp>
