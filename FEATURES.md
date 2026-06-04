# Neurowire feature backlog

A running checklist of proposed features. Each carries a short description, its
purpose, and a usefulness rating (impact x how many users hit it, out of 10).
Check the box when shipped.

Done so far: **#11 sort & limit** and **#13 time-window presets** (see the CLI
`--sort` / `--order` / `--limit` and `--since` / `--max-age` / `--today` /
`--this-week` / `--between` flags, and the core `selectEntries` / `resolveWindow`
transforms).

## Backlog

- [ ] **1. `watch` mode** - long-poll a feed/mesh on an interval, emit only new entries (diff vs last run). Purpose: turn one-shot fetch into a live tail for scripts/webhooks/notifiers. Usefulness: 9.
- [ ] **2. Entry-level filters (`--filter`)** - include/exclude rules on title/tag/source/author/date (substring, regex, glob). Purpose: cut noise, narrow a feed. Usefulness: 9.
- [ ] **3. Persisted dedup / seen-state** - on-disk store of seen entry IDs per feed so reruns and `watch` never re-surface old items. Purpose: trustworthy cross-run dedup. Usefulness: 8.
- [ ] **4. Conditional fetch (ETag / Last-Modified)** - send conditional headers, cache 304s, respect Cache-Control, per source. Purpose: politeness + speed for scheduled runs. Usefulness: 8.
- [ ] **5. `tap doctor` / tap autogen** - inspect a feed-less page and propose a FeedTemplate (candidate selectors + preview). Purpose: kill the manual selector-hunting step. Usefulness: 8.
- [ ] **6. Full-content enrichment (`--full`)** - optional second pass that fetches each entry's page and extracts the article body. Purpose: upgrade list-metadata to real reading. Usefulness: 7.
- [ ] **7. OPML import/export** - `import feeds.opml` to a mesh; `--format opml` out. Purpose: onboarding from existing readers in one command. Usefulness: 7.
- [ ] **8. Webhook / push sinks** - `--sink` targets: webhook POST, Slack/Discord, email; format-aware delivery of new entries. Purpose: Neurowire as the pipe, not just the printer. Usefulness: 7.
- [ ] **9. Per-source health + observability** - mesh fetch reports per-source status (ok/304/fail/parse-error, latency, count) via `--report`. Purpose: a silently-dead source becomes visible. Usefulness: 7.
- [ ] **10. Content hashing + stable IDs** - deterministic synthetic IDs (hash of link+title) for entries lacking a GUID, normalized across formats. Purpose: fix dedup and round-trips at the root. Usefulness: 6.
- [x] **11. Sort & limit controls** - `--sort date|title|source`, `--order asc|desc`, `--limit N`. Purpose: order and cap output; small payloads for integrations. Usefulness: 7.
- [ ] **12. Entry grouping / sectioned output** - `--group-by source|tag|day` so md/html/atom render in sections. Purpose: make a many-source mesh scannable. Usefulness: 7.
- [x] **13. Time-window presets** - `--since`, `--max-age`, `--today`, `--this-week`, `--between A..B`. Purpose: scope a feed to a period without manual date math. Usefulness: 6.
- [ ] **14. Theme system for the web page** - named themes + `--theme`, CSS-var override file, light mode. Purpose: let publishers rebrand the page. Usefulness: 7.
- [ ] **15. RSS 2.0 / RDF serializer** - add `rss` output format alongside atom/json/md/nwf. Purpose: maximum consumer compatibility. Usefulness: 6.
- [ ] **16. Mesh source weighting & caps** - per-source `weight` and `maxEntries` in the mesh JSON. Purpose: stop one noisy source from drowning the rest. Usefulness: 7.
- [ ] **17. Plugin / transform hooks** - a pipeline of user transforms (`entry => entry | null`) run after parse, before serialize. Purpose: custom rewrite/tag/drop logic without forking. Usefulness: 7.
- [ ] **18. Auth & headers per source** - per-source headers/bearer/basic-auth/cookie (env-interpolated) in mesh config. Purpose: read private or token-gated feeds. Usefulness: 6.
- [ ] **19. `serve` static-feed mode** - API generates and caches atom/json/html at a stable URL with a TTL. Purpose: publish a mesh as a hostable feed others subscribe to. Usefulness: 8.
- [ ] **20. Tap test snapshots / fixtures CLI** - `tap snapshot <url>` saves HTML + expected output; `tap test` replays offline. Purpose: catch tap regressions when sites change. Usefulness: 6.
