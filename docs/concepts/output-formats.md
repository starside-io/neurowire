# Output formats

Once a source is parsed into the canonical [model](/concepts/model), Neurowire can serialize it to any of its output formats. The format system is small and centralized in [`packages/core/src/serialize/index.ts`](https://github.com/neurowire/neurowire): one list of formats, one media-type map, one extension map, and one dispatch function.

## `serialize(feed, format)`

The single entry point. It takes a `NeurowireFeed` and a `Format` and returns the serialized string.

```ts
import { serialize } from '@neurowire/core'

const atom = serialize(feed, 'atom')
const json = serialize(feed, 'json')
const md = serialize(feed, 'md')
```

Internally it is a switch over the format that delegates to the per-format serializer (`toAtom`, `toRss`, `toJsonFeed`, `toMarkdown`, `toNwf`), each of which is also exported directly if you want to call it without the dispatch.

## The formats

| Format | Page | Media type | Extension |
|--------|------|------------|-----------|
| `atom` | [/formats/atom](/formats/atom) | `application/atom+xml; charset=utf-8` | `xml` |
| `rss` | [/formats/rss](/formats/rss) | `application/rss+xml; charset=utf-8` | `xml` |
| `json` | [/formats/json-feed](/formats/json-feed) | `application/feed+json; charset=utf-8` | `json` |
| `md` | [/formats/markdown](/formats/markdown) | `text/markdown; charset=utf-8` | `md` |
| `nwf` | [/formats/nwf](/formats/nwf) | `text/x-neurowire; charset=utf-8` | `nwf` |

The `json` format is [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/). The `nwf` format is Neurowire's own compact line-oriented format (see [/formats/nwf](/formats/nwf)).

## The registries

Three exported constants keep formats consistent across the CLI, API, and web packages:

- `FORMATS`: the readonly tuple `['atom', 'rss', 'json', 'md', 'nwf']`, and the `Format` type derived from it.
- `MEDIA_TYPES`: the `Content-Type` string for each format (used by the API).
- `EXTENSIONS`: the file extension for each format (used by the CLI and page generator).

```ts
import { FORMATS, MEDIA_TYPES, EXTENSIONS, isFormat } from '@neurowire/core'
```

## `isFormat(value)`

A type guard that narrows an arbitrary string to `Format`. Use it to validate user input (a `--format` flag, a query parameter) before calling `serialize`.

```ts
if (isFormat(input)) {
  return serialize(feed, input) // input is now typed as Format
}
```

## What is deliberately not here

::: warning HTML is not a core format
HTML is intentionally **not** a feed serializer and is **not** in `FORMATS`. Rendering a feed or mesh into a self-contained HTML news page lives in [`@neurowire/web`](/formats/html) (`toHtml`, `toConstructHtml`). Keeping HTML out of core keeps `@neurowire/core` pure and dependency-light (zod only), with no DOM or presentation concerns.
:::

::: tip OPML is a subscription list, not a feed
OPML describes a **list of subscriptions** (which feeds to follow), not the contents of a feed. It is therefore not one of the feed serializers dispatched by `serialize`. See its dedicated page for import and export.
:::
