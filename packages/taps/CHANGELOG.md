# @neurowire/taps

## 0.3.1

- Republish so the pinned `@neurowire/core` and `@neurowire/ingest` versions match the 0.8.0 / 0.7.0 release. No behavior change: keeping them aligned avoids a second copy of `ingest` in the tree, which would split the module-level tap registry and silently stop curated taps from resolving.

## 0.1.0

- Initial release: bundled `claudeBlog` and `cursorBlog` taps, plus the loaders `registerAllTaps`, `loadTaps`, `registerTapsFrom`, and `defaultTapsDir`.
