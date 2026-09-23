# @neurowire/mcp

## 0.2.0

- The catalog resolves `${ENV_VAR}` references in per-source header values of the operator's mesh and construct files, from the catalog's own `env`.
- `fetch_mesh` and `fetch_construct` parse inline sources with the public schemas, which drop per-source `headers`. A client cannot inject an `Authorization` header or read the server's environment through a URL it controls.

## 0.1.0

- Initial release: a stdio MCP server (`neurowire-mcp`) that exposes Neurowire to LLM agents.
- Feed tools: `ingest_source`, `serialize`, `fetch_mesh`, `fetch_construct`, and `query` (the CLI's filter, window, sort, and limit semantics).
- Journal tools: `query_journal`, and `whats_new`, which returns the entries since a cursor plus the next cursor, paging large deltas without gaps.
- Tap tools: `list_taps`, `resolve_tap`, `propose_tap`, and `verify_tap`. An agent may draft a tap, but only the tap-wizard verification gate decides whether it passes, and nothing is installed.
- `search_docs` over the published `llms-full.txt`.
- Named meshes and constructs as `neurowire://mesh/<name>` and `neurowire://construct/<name>` resources. Taps-pack theme keys resolve as mesh names.
- Entry results default to NWF, cap at 200 entries (default 30), and open with a one-line summary. Errors are descriptive strings.
- `NEUROWIRE_MCP_ALLOW` restricts caller-supplied URLs to a host allowlist; named meshes and constructs are always allowed.
