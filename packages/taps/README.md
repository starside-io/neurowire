# @neurowire/taps

Curated "taps" for [Neurowire](https://github.com/starside-io/neurowire). A tap is a per-host `FeedTemplate` (a set of CSS selectors) that wiretaps a site with no RSS or Atom feed and turns its listing page into a feed.

## Install

```bash
npm install @neurowire/taps
```

## Bundled taps

- `claudeBlog`: `claude.com/blog`
- `cursorBlog`: Cursor's blog

## What it gives you

- **`taps`**: the array of bundled taps.
- **`registerTaps()`**: register the bundled taps with the `@neurowire/ingest` registry. Safe to call repeatedly.
- **`loadTaps(pathOrDir)`**: load and validate taps from a JSON file, or from every `*.json` file in a directory.
- **`registerTapsFrom(pathOrDir)`**: load taps from a path and register them.
- **`registerAllTaps(extraPaths?)`**: register the built-ins, then user taps from the default drop-in directory, the `NEUROWIRE_TAPS` env var, and any `extraPaths`. Later sources win on host collision.
- **`defaultTapsDir()`**: the default user-tap directory, `$XDG_CONFIG_HOME/neurowire/taps` (or `~/.config/neurowire/taps`).

## Usage

```ts
import { fetchFeed } from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'

// Register built-in taps plus any from NEUROWIRE_TAPS or ~/.config/neurowire/taps.
registerAllTaps()

// claude.com/blog has no feed, but a tap matches its host.
const feed = await fetchFeed('https://claude.com/blog')
```

## Bring your own tap

Drop a JSON `FeedTemplate` into `~/.config/neurowire/taps/`, point `NEUROWIRE_TAPS` at a file or directory, or pass a path to `registerAllTaps([path])`. Each file is validated against `FeedTemplateSchema`.

## License

Apache-2.0
