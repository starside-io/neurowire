# Changelog

All notable changes to Neurowire are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic
versioning (breaking changes land as a minor bump while the project is pre-1.0).

## [0.6.0] - 2026-06-06

### Added

- **Push sinks** (backlog #8): `--sink <url>` (repeatable) delivers entries to
  Slack, Discord, or a generic webhook, auto-detected by URL. Slack/Discord get a
  short text message; a webhook gets the JSON Feed. Additive to normal output, and
  with `--watch` it pushes only the new entries each tick. Delivery never throws,
  so a failing sink cannot break the watch loop. A dedicated Sinks docs page is
  added to the site.
- **Stable synthetic entry ids** (backlog #10): entries with no source GUID get a
  deterministic content-hashed id (`urn:nwf:<hash>`) via `stableId` / `hashHex`
  (FNV-1a) in `@neurowire/core`, applied centrally in ingest's `finalizeFeed`.
  Real ids are kept untouched. This makes dedup (watch) and round-trips stable
  across formats.

### Versions

- root 0.5.0 to 0.6.0; `@neurowire/core` 0.4.0 to 0.5.0; `@neurowire/ingest`
  0.3.0 to 0.4.0; `@neurowire/cli` 0.4.0 to 0.5.0.

## [0.5.0] - 2026-06-05

### Added

- **Watch mode** (backlog #1): `neurowire ... --watch` long-polls a feed or mesh
  on an `--interval` and emits only new entries each tick. Seen-state lives in the
  CLI (optional `--state` JSON file); the library exposes pure `newEntries` /
  `entryKey` helpers in `@neurowire/core` with no on-disk state.
- **Entry filters** (backlog #2): `--filter` and `--exclude` keep or drop entries
  by `field:pattern` (title, summary, source, author, tag), substring by default
  or `/regex/`. Backed by pure `filterEntries` / `matchRule` in `@neurowire/core`.
- **Conditional fetch + response cache** (backlog #4): `@neurowire/ingest` sends
  ETag / Last-Modified and honors 304s via an injected `ConditionalCache`
  (`createMemoryCache`), threaded through `fetchFeed` and `fetchMesh`. The API
  adds a TTL response cache on `GET /feed` and `/mesh` (`NEUROWIRE_CACHE_TTL`,
  default 300s).
- **tap doctor** (backlog #5): `neurowire tap doctor <url>` inspects a feed-less
  page and proposes a `FeedTemplate` (printed as JSON) with a match preview,
  backed by `proposeTemplate` in `@neurowire/ingest`.

### Versions

- root 0.4.0 to 0.5.0; `@neurowire/core` 0.3.0 to 0.4.0; `@neurowire/ingest`
  0.2.0 to 0.3.0; `@neurowire/cli` 0.3.0 to 0.4.0; `@neurowire/api` 0.2.0 to 0.3.0.

## [0.4.0] - 2026-06-05

### Added

- **Sort & limit controls** (backlog #11): `--sort date|title|source`,
  `--order asc|desc`, and `--limit N` on the `neurowire` CLI. `--limit` keeps
  payloads small for integrations (`--mesh ai-news.json --format json --limit 10`).
- **Time-window presets** (backlog #13): `--since`, `--max-age`, `--today`,
  `--this-week`, and `--between <start>..<end>` to scope a feed or mesh to a
  period. Windows are evaluated in UTC; undated entries are dropped when a window
  is set.
- `@neurowire/core` gains pure, deterministic transforms: `selectEntries`,
  `resolveWindow`, and `parseDuration`, with full test coverage.
- Docs site: a "Shape the output" section documenting the new flags.
- `FEATURES.md`: a tracked backlog of 20 proposed features.

## [0.3.2] - 2026-06-04

### Fixed

- Docs site no longer clips content on narrow viewports: grids collapse instead
  of overflowing, grid children with code blocks scroll in-container, and long
  inline code wraps.

## [0.3.1] - 2026-06-04

### Fixed

- Mobile docs nav stacks into a full-width column; the taps explorer expands the
  selected tap inline on mobile with no horizontal overflow.

### Added

- `@neurowire/web` rendered pages link their NEUROWIRE header wordmark and a
  "Made with Neurowire" footer to the docs site.

## [0.3.0] - 2026-06-04

### Changed

- Require Node 24 LTS across the monorepo (engines, tsup targets, CI, `.nvmrc`).

## [0.2.0] - 2026-06-03

### Added

- Themed multi-page docs site generated from the web theme.
- Decode named and numeric HTML entities in feed text.
- Animated card borders on rendered pages.

[0.4.0]: https://github.com/starside-io/neurowire/releases/tag/v0.4.0
[0.3.2]: https://github.com/starside-io/neurowire/releases/tag/v0.3.2
[0.3.1]: https://github.com/starside-io/neurowire/releases/tag/v0.3.1
[0.3.0]: https://github.com/starside-io/neurowire/releases/tag/v0.3.0
[0.2.0]: https://github.com/starside-io/neurowire/releases/tag/v0.2.0
