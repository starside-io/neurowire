# Neurowire feature backlog

A running checklist of proposed features. Each carries a short description, its
purpose, and a usefulness rating (impact x how many users hit it, out of 10).
Check the box when shipped.

Done so far: **#11 sort & limit**, **#13 time-window presets**, **#1 watch mode**,
**#2 entry filters**, **#4 conditional fetch + response cache**, and **#5 tap
doctor**. See the CLI `--sort` / `--limit` / `--filter` / `--watch` flags and the
`tap doctor` subcommand, the core `selectEntries` / `newEntries` / `filterEntries`
transforms, ingest conditional fetch (`createMemoryCache`, ETag/304) and
`proposeTemplate`, and the API TTL response cache.

## Backlog

- [x] **1. `watch` mode** - long-poll a feed/mesh on an interval, emit only new entries (diff vs last run). The seen-ID state lives in the CLI (the app layer); core may expose a pure `newEntries(feed, seenIds)` helper, but no on-disk state in the library. Purpose: turn one-shot fetch into a live tail for scripts/webhooks/notifiers. Usefulness: 9.
- [x] **2. Entry-level filters (`--filter`)** - include/exclude rules on title/tag/source/author/date (substring, regex, glob). Purpose: cut noise, narrow a feed. Usefulness: 9.
- [x] **4. Conditional fetch + response cache** - per-source conditional headers (ETag/Last-Modified), honor 304s and Cache-Control, plus a TTL cache so the API serves the merged result for N seconds instead of refetching upstream every request. Purpose: politeness + speed for scheduled runs and the live API. Usefulness: 8.
- [x] **5. `tap doctor` / tap autogen** - inspect a feed-less page and propose a FeedTemplate (candidate selectors + preview). Purpose: kill the manual selector-hunting step. Usefulness: 8.
- [ ] **6. Full-content enrichment (`--full`)** - optional second pass that fetches each entry's page and extracts the article body. Purpose: upgrade list-metadata to real reading. Usefulness: 7.
- [ ] **7. OPML import/export** - `import feeds.opml` to a mesh; `--format opml` out. Purpose: onboarding from existing readers in one command. Usefulness: 7.
- [x] **8. Webhook / push sinks** - `--sink` targets: webhook POST, Slack/Discord, email; format-aware delivery of new entries. Purpose: Neurowire as the pipe, not just the printer. Usefulness: 7.
- [ ] **9. Per-source health + observability** - mesh fetch reports per-source status (ok/304/fail/parse-error, latency, count) via `--report`. Purpose: a silently-dead source becomes visible. Usefulness: 7.
- [x] **10. Content hashing + stable IDs** - deterministic synthetic IDs (hash of link+title) for entries lacking a GUID, normalized across formats. Purpose: fix dedup and round-trips at the root. Usefulness: 6.
- [x] **11. Sort & limit controls** - `--sort date|title|source`, `--order asc|desc`, `--limit N`. Purpose: order and cap output; small payloads for integrations. Usefulness: 7.
- [ ] **12. Entry grouping / sectioned output** - `--group-by source|tag|day` so md/html/atom render in sections. Purpose: make a many-source mesh scannable. Usefulness: 7.
- [x] **13. Time-window presets** - `--since`, `--max-age`, `--today`, `--this-week`, `--between A..B`. Purpose: scope a feed to a period without manual date math. Usefulness: 6.
- [ ] **14. Theme system for the web page** - named themes + `--theme`, CSS-var override file, light mode. Purpose: let publishers rebrand the page. Usefulness: 7.
- [ ] **15. RSS 2.0 / RDF serializer** - add `rss` output format alongside atom/json/md/nwf. Purpose: maximum consumer compatibility. Usefulness: 6.
- [ ] **16. Mesh source weighting & caps** - per-source `weight` and `maxEntries` in the mesh JSON. Purpose: stop one noisy source from drowning the rest. Usefulness: 7.
- [ ] **17. Plugin / transform hooks** - a pipeline of user transforms (`entry => entry | null`) run after parse, before serialize. Purpose: custom rewrite/tag/drop logic without forking. Usefulness: 7.
- [ ] **18. Auth & headers per source** - per-source headers/bearer/basic-auth/cookie (env-interpolated) in mesh config. Purpose: read private or token-gated feeds. Usefulness: 6.
- [ ] **20. Tap test snapshots / fixtures CLI** - `tap snapshot <url>` saves HTML + expected output; `tap test` replays offline. Purpose: catch tap regressions when sites change. Usefulness: 6.

## Removed

IDs are kept stable (the changelog and commits reference them), so removed items
leave a gap rather than renumbering.

- **3. Persisted dedup / seen-state** - cut. On-disk state does not belong in a
  library (core is pure, no I/O). The pure part (`newEntries(feed, seenIds)`)
  folds into #1 watch, with the CLI owning the file.
- **19. `serve` static-feed mode** - cut as redundant. `@neurowire/api` already
  serves feeds and meshes over Hono at stable URLs. The only non-redundant part,
  TTL caching, folded into #4.
