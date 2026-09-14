# Changelog

All notable changes to Neurowire are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic
versioning (breaking changes land as a minor bump while the project is pre-1.0).

## [Unreleased]

### Added

- **MCP server** (epic 13): a new `@neurowire/mcp` package, a stdio MCP server that
  exposes feeds, meshes, constructs, journals, and taps to LLM agents. Entry results
  default to NWF, cap at 200, and open with a one-line summary. `whats_new` returns a
  real journal cursor, and `propose_tap` lets an agent draft a tap that only counts once
  the tap-wizard gate in `verify_tap` passes it. `NEUROWIRE_MCP_ALLOW` restricts
  caller-supplied URLs to a host allowlist.
- **Claude Code plugin**: `.claude-plugin/plugin.json` bundles the server with two
  skills (`follow-feeds`, `author-tap`).
- **`llms.txt`**: the docs site now emits `/llms.txt` and `/llms-full.txt`.
- **MCP registry**: `packages/mcp/server.json` (`io.starside/neurowire`) and a
  `release-mcp` workflow that publishes to npm and then the registry.

## [0.9.0] - 2026-09-16

### Added

- **NWF is readable over the wire** (ingest): `detectKind` recognizes NWF by
  `text/x-neurowire` or an `NWF1` first line, and `parseNwf` reads it back through
  `validateNwf`, so a published `.nwf` file is a source like any feed: the terminal
  view, `--format`, `--watch`, `tail`, journals, mesh and construct members, the API,
  and the HTML page generator all accept one. A malformed document fails with the
  line number `validate` would print. Previously NWF was write-only on the fetch
  path, so Neurowire could not read its own output.

### Documentation

- A document-detection table in [Fetching](docs/concepts/fetching.md), and a
  "Publishing one, and reading it back" section in [the NWF format](docs/formats/nwf.md)
  covering the CLI, mesh membership, and the failure mode.

### Versions

- root 0.8.1 to 0.9.0; `@neurowire/ingest` 0.8.1 to 0.9.0. `@neurowire/taps` 0.3.3
  to 0.3.4, `@neurowire/tap-wizard` 0.1.1 to 0.1.2, `@neurowire/taps-pack` 0.1.3 to
  0.1.4, `@neurowire/cli` 0.10.1 to 0.10.2, `@neurowire/api` 0.5.1 to 0.5.2, and
  `@neurowire/web` 0.5.3 to 0.5.4 are republished so their exact `ingest` pins stay
  aligned. `@neurowire/core` is unchanged at 0.8.0.

## [0.8.1] - 2026-09-14

### Fixed

- **Entities and markup in titles** (ingest): numeric and named HTML entities inside CDATA (`&#8217;`, `&#8230;`) are now decoded, and HTML-typed titles no longer render literal `<em>` tags. Every parser now passes entry titles through `stripHtml`.
- **On-topic feeds** (taps-pack): the Anime theme reads `comicbook.com/category/anime/feed/` and the Music theme reads `nme.com/news/music/feed`, replacing site-wide feeds that pulled in off-topic items.

## [0.8.0] - 2026-08-28

### Added

- **Tap wizard** (epic 10): a new `@neurowire/tap-wizard` package that authors and
  heals taps deterministically, with no model and no API key anywhere in the loop.
  `suggestCandidates` ranks selectors from page structure, `previewTemplate` runs
  the real ingest engine so a preview cannot disagree with a fetch, and
  `verifyTemplate` is a gate no tap is written without: item count, non-empty
  titles, unique resolvable links, date rate, and a common-ancestor probe that
  rejects nav and footer matches. The CLI gains `tap wizard`, `tap check` (CI-safe,
  exits 1 on breakage), and `tap heal`.
- **Tail** (epic 11): `pollFeed` in ingest becomes the single polling loop in the
  codebase, and `--watch` is rebased onto it with unchanged flag behavior. The CLI
  gains `neurowire tail` (pretty output, raw NWFJ via `-f nwf`, and `--from` for a
  remote stream), and the API gains `GET /tail`, a server-sent event stream whose
  poll loops are shared per target so many clients cost one upstream fetch.
  `Last-Event-ID` replays from a journal, so a reconnect misses nothing.
- **NWF sync** (epic 12): `nwf-sync/1`, a pull-only HTTP protocol that turns NWF
  from a format into a wire protocol. The API serves `/sync/journals`, `/sync/head`,
  `/sync/since`, and `/sync/snapshot` over a journal store, publishing nothing until
  a journal id is named explicitly, with an optional bearer token. Ingest gains the
  pull client (`pullJournal`, `syncPeers`) with hash-chain verification and `410`
  snapshot recovery, and the CLI gains `sync` and `peers`.

### Documentation

- New concept pages for [Tail](docs/concepts/tail.md) and [Sync](docs/concepts/sync.md),
  a rebuilt [Taps](docs/concepts/taps.md) page, the [`nwf-sync/1` spec](docs/formats/nwf-sync.md),
  and a [federation guide](docs/guide/federation.md). Getting started and Recipes
  cover all three new surfaces.

### Versions

- root 0.7.0 to 0.8.0; `@neurowire/ingest` 0.7.0 to 0.8.0; `@neurowire/cli` 0.9.0
  to 0.10.0; `@neurowire/api` 0.4.1 to 0.5.0; `@neurowire/tap-wizard` at 0.1.0
  (first release). `@neurowire/taps` 0.3.1 to 0.3.2, `@neurowire/taps-pack` 0.1.1
  to 0.1.2, and `@neurowire/web` 0.5.1 to 0.5.2 are republished so their exact
  `ingest` pins stay aligned. `@neurowire/core` is unchanged at 0.8.0.

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
