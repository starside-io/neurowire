# JSON Feed

Neurowire serializes to JSON Feed 1.1. The serializer lives in `packages/core/src/serialize/jsonfeed.ts`.

| | |
|---|---|
| Format key | `json` |
| Media type | `application/feed+json; charset=utf-8` |
| Extension | `json` |
| Functions | `toJsonFeed(feed)`, `toJsonFeedObject(feed)` |
| Type | `JsonFeedDocument` |

```ts
import { toJsonFeed, toJsonFeedObject } from '@neurowire/core'
import type { JsonFeedDocument } from '@neurowire/core'

const text = toJsonFeed(feed) // a JSON string, trailing newline
const doc: JsonFeedDocument = toJsonFeedObject(feed) // the plain object
```

`toJsonFeedObject` builds the document object; `toJsonFeed` is `JSON.stringify(..., null, 2)` of that object with a trailing newline. Use the object form when you want to embed or post-process the feed; use the string form when you want bytes to write or send.

## Field mapping

### Feed level

| Model field | JSON Feed key | Notes |
|---|---|---|
| (constant) | `version` | Always `"https://jsonfeed.org/version/1.1"`. |
| `feed.title` | `title` | Always present. |
| `feed.home` | `home_page_url` | Emitted only when present. |
| `feed.self` | `feed_url` | Emitted only when present. |
| `feed.authors[]` | `authors[]` | Emitted only when non-empty. Each author is `{ name, url? }`. |
| `feed.entries[]` | `items[]` | One per entry, in order. |

The feed `id` and `generator` are not represented in the JSON Feed output.

### Item (entry) level

| Model field | JSON Feed key | Notes |
|---|---|---|
| `entry.id` | `id` | Always present. |
| `entry.link` | `url` | Always present. |
| `entry.title` | `title` | Always present. |
| `entry.summary` | `summary` | Emitted only when present. |
| `entry.published` | `date_published` | RFC 3339. Omitted when missing or unparseable. |
| `entry.updated` | `date_modified` | RFC 3339. Omitted when missing or unparseable. |
| `entry.authors[]` | `authors[]` | Emitted only when non-empty. Each is `{ name, url? }`. |
| `entry.tags[]` | `tags[]` | Emitted only when non-empty (an array of strings). |

::: info Authors
An author maps to `{ name }`, plus `url` only when the model `Person.url` is set. The `email` field of a `Person` is not carried into JSON Feed.
:::

::: tip Dates
`date_published` and `date_modified` run through `Date.parse` then `toISOString`. Unparseable or missing values are simply omitted, rather than substituted with a fallback.
:::

## Sample output

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Example Blog",
  "home_page_url": "https://example.com/",
  "feed_url": "https://example.com/feed.xml",
  "authors": [
    { "name": "Ada Lovelace", "url": "https://example.com/ada" }
  ],
  "items": [
    {
      "id": "https://example.com/posts/hello",
      "url": "https://example.com/posts/hello",
      "title": "Hello, world",
      "summary": "A first post.",
      "date_published": "2026-06-27T09:30:00.000Z",
      "date_modified": "2026-06-27T09:30:00.000Z",
      "authors": [{ "name": "Ada Lovelace" }],
      "tags": ["intro"]
    }
  ]
}
```

Feed-level metadata is emitted before `items`, matching the JSON Feed convention.

## Usage

CLI:

```bash
neurowire https://example.com/feed.xml -f json
```

API:

```bash
curl 'http://localhost:8787/feed?url=https://example.com/feed.xml&format=json'
```

See [Output formats](/concepts/output-formats) and [the CLI guide](/guide/cli).
