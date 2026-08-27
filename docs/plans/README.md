# Roadmap plans

One markdown plan per epic. Each plan is self-contained: goal, scope, non-goals,
dependencies, files touched, step list, tests, risks, acceptance.

## Epics

| # | Epic | Package(s) | Plan |
|---|------|-----------|------|
| 1 | RSS 2.0 output serializer | core | [01-rss-output.md](01-rss-output.md) |
| 2 | OPML import / export | core, ingest, cli | [02-opml.md](02-opml.md) |
| 3 | Fetch hardening (timeout, retry, backoff) | ingest | [03-fetch-hardening.md](03-fetch-hardening.md) |
| 4 | Self-host the API (operator owns security) | api | [04-self-host.md](04-self-host.md) |
| 5 | Tap pack: 100 curated taps, conditional import | new `@neurowire/taps-pack` | [05-taps-pack.md](05-taps-pack.md) |
| 6 | HTML page client-side search | web | [06-html-search.md](06-html-search.md) |
| 8 | Test the untested layers (api, cli, web) | api, cli, web | [08-testing.md](08-testing.md) |
| 9 | NWF journal (append-only log, protocol substrate) **[shipped]** | core, ingest, cli | [09-nwf-journal.md](09-nwf-journal.md) |
| 10 | Tap Wizard (deterministic tap authoring and healing) | new `@neurowire/tap-wizard`, cli | [10-tap-wizard.md](10-tap-wizard.md) |
| 11 | `neurowire tail` (streaming NWF, SSE) | ingest, api, cli | [11-nwf-tail.md](11-nwf-tail.md) |
| 12 | NWF sync (delta exchange between peers) | ingest, api, cli | [12-nwf-sync.md](12-nwf-sync.md) |
| 13 | MCP server + the `starside` plugin marketplace | new `@neurowire/mcp` | [13-mcp-server.md](13-mcp-server.md) |

## Dependency graph

```
1 (RSS output) ──────────────┐
                             ├─> 8 (testing picks up new code)
2 (OPML) ────────────────────┤
3 (fetch hardening) ─────────┤
6 (HTML search) ─────────────┤
4 (self-host) ───────────────┤
5 (taps-pack) ───────────────┘
```

## Next-step arcs (epics 9-13)

Two arcs on one shared substrate. Both are additive; neither touches the
existing epics' surfaces.

```
9 (journal) ──┬─> 11 (tail: replay + resume ride on journals)
   [SHIPPED]  └─> 12 (sync: journals ARE the payload; hard dep)

10 (tap wizard) ─── independent, parallel to everything

                    all of the above ──> 13 (MCP: wraps whatever has landed)
```

- **Epic 9 is done**, shipped in core 0.8.0 / ingest 0.7.0 / cli 0.9.0. It was
  the only root: 12 could not exist without it, 11 would ship degraded, and 13
  answers "what is new" with a real cursor because of it.
- **Epic 10 is fully parallel** (new package plus CLI subcommands, no shared code
  paths). It deliberately contains **no LLM**: heuristics propose, a walkthrough
  confirms, a deterministic gate decides. It also absorbs the wizard logic that
  already works in `neurowire-app`, so app and library stop drifting.
- **Epic 11 before 12**, so sync nodes have a way to keep journals fresh, and
  because 11 rebases the watch loop that 12's docs lean on.
- **Epic 13 is last on purpose.** It is a thin wrapper whose tool surface widens
  with every epic before it: journals give it cursors, Tap Wizard gives it a
  verification gate to put an LLM behind, tail gives it subscriptions, sync gives
  it peer archives. Building it first would mean revising it four times.

Suggested sequence: **10 -> 11 -> 12 -> 13**, with 10 runnable in parallel by a
second pair of hands.

## Where the AI lives

Exactly one place: **Epic 13**, behind a deterministic gate.

Tap authoring (Epic 10) is a structural DOM problem, not a language problem, so
it is solved with heuristics plus a human walkthrough and ships with no API key,
no model, and no network weather. Epic 13 may let an agent *draft* a template,
but it must pass the same `verify_tap` gate the CLI wizard uses. The model
proposes; deterministic code disposes.
