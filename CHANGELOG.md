# Changelog

All notable changes to Neurowire are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project uses semantic
versioning (breaking changes land as a minor bump while the project is pre-1.0).

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
