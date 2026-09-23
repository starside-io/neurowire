# @neurowire/taps

## 0.3.5

- Republish so the pinned `@neurowire/core` and `@neurowire/ingest` versions match the current release. No behavior change.

## 0.3.4

- Republish so the pinned `@neurowire/ingest` version matches the current release. No behavior change.

## 0.3.3

- Republish so the pinned `@neurowire/ingest` version matches the current release. No behavior change.

## 0.3.2

- Republish so the pinned `@neurowire/ingest` version matches the 0.8.0 release. No behavior change: `workspace:*` publishes as an exact pin, so leaving this package behind would put a second copy of `ingest` in the tree and split the module-level tap registry.

## 0.3.1

- Republish so the pinned `@neurowire/core` and `@neurowire/ingest` versions match the 0.8.0 / 0.7.0 release. No behavior change: keeping them aligned avoids a second copy of `ingest` in the tree, which would split the module-level tap registry and silently stop curated taps from resolving.

## 0.1.0

- Initial release: bundled `claudeBlog` and `cursorBlog` taps, plus the loaders `registerAllTaps`, `loadTaps`, `registerTapsFrom`, and `defaultTapsDir`.
