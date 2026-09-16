# @neurowire/taps-pack

## 0.1.4

- Republish so the pinned `@neurowire/ingest` version matches the current release. No behavior change.

## 0.1.3

- Swap two catch-all feeds for on-topic ones: ComicBook Anime now reads `comicbook.com/category/anime/feed/` and NME reads `nme.com/news/music/feed`. Also republish against the current `@neurowire/ingest`.

## 0.1.2

- Republish so the pinned `@neurowire/ingest` and `@neurowire/taps` versions match the current release. No behavior change.

## 0.1.1

- Republish so the pinned `@neurowire/core`, `@neurowire/ingest`, and `@neurowire/taps` versions match the current release. No behavior change.

## 0.1.0

- Initial release: a themed catalog of Neurowire sources across a tech cluster and a general-interest cluster, with per-theme conditional imports (`@neurowire/taps-pack/<theme>`), `loadTheme`, `loadAllThemes`, `registerTheme`, `registerAll`, and `themeMesh`. Feed-less sources carry a tap (`FeedTemplate`); the rest are fetched directly.
