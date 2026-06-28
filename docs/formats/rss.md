# RSS

RSS 2.0 output, new in `@neurowire/core` 0.7.0. The serializer lives in `packages/core/src/serialize/rss.ts` and is exported as `toRss`, alongside the `toRfc822` date helper.

| | |
|---|---|
| Format key | `rss` |
| Media type | `application/rss+xml; charset=utf-8` |
| Extension | `xml` |
| Functions | `toRss(feed)`, `toRfc822(iso)` |

```ts
import { toRss, toRfc822 } from '@neurowire/core'

const xml = toRss(feed)
```

`toRss` produces a valid RSS 2.0 document. It declares only the namespaces it actually uses: `xmlns:atom` appears only when the feed has a `self`, and `xmlns:dc` only when at least one entry has an author.

## The `toRfc822` helper

RSS dates use the RFC 822 format. `toRfc822(iso)` converts an ISO-ish date string to an RFC 822 date in GMT, for example `Wed, 02 Oct 2024 13:00:00 GMT`. It returns `undefined` when the input is unparseable, so callers can omit the element rather than emit a bad date.

```ts
toRfc822('2024-10-02T13:00:00Z') // "Wed, 02 Oct 2024 13:00:00 GMT"
toRfc822('not a date')           // undefined
```

## Field mapping

### Channel level

| Model field | RSS output | Notes |
|---|---|---|
| `feed.title` | `<title>` | Text-escaped. |
| `feed.home` / `feed.self` / `feed.id` | `<link>` | First present of `home`, `self`, then `id`. |
| `feed.title` | `<description>` | RSS requires a non-empty description, so it falls back to the title. |
| `feed.self` | `<atom:link href="..." rel="self" type="application/rss+xml"/>` | Emitted only when `self` is set (and the `atom` namespace is then declared). |
| `feed.updated` | `<lastBuildDate>` | RFC 822 via `toRfc822`. Omitted when unparseable. |
| `feed.generator` | `<generator>` | Text is `name` plus ` version` when a version is set. |
| `feed.entries[]` | `<item>` blocks | One per entry, in order. |

### Item (entry) level

| Model field | RSS output | Notes |
|---|---|---|
| `entry.title` | `<title>` | Text-escaped. |
| `entry.link` | `<link>` | Text-escaped. |
| `entry.id` | `<guid isPermaLink="...">` | `isPermaLink="true"` only when `id` equals `link` (synthetic ids are not resolvable URLs, so they are `false`). |
| `entry.published` / `entry.updated` | `<pubDate>` | RFC 822 via `toRfc822`, using `published` else `updated`. Omitted when unparseable. |
| `entry.authors[]` | `<dc:creator>` | One per author (name only). Triggers the `dc` namespace. |
| `entry.tags[]` | `<category>` | One per tag. |
| `entry.summary` | `<description>` | Emitted only when present. |
| `entry.source` | `<source url="...">name</source>` | Emitted only when `source.url` is set (RSS requires the `url` attribute). The element text is `source.name`, falling back to the url. |

::: info Namespaces declared on demand
The root `<rss>` element starts with `version="2.0"`. `xmlns:atom="http://www.w3.org/2005/Atom"` is added only when the feed has a `self`; `xmlns:dc="http://purl.org/dc/elements/1.1/"` only when some entry has authors. This keeps the document minimal.
:::

## Sample output

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example Blog</title>
    <link>https://example.com/</link>
    <description>Example Blog</description>
    <atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>Sun, 28 Jun 2026 10:00:00 GMT</lastBuildDate>
    <generator>Neurowire 0.1.0</generator>
    <item>
      <title>Hello, world</title>
      <link>https://example.com/posts/hello</link>
      <guid isPermaLink="true">https://example.com/posts/hello</guid>
      <pubDate>Sat, 27 Jun 2026 09:30:00 GMT</pubDate>
      <dc:creator>Ada Lovelace</dc:creator>
      <category>intro</category>
      <description>A first post.</description>
      <source url="https://example.com/feed.xml">Example Blog</source>
    </item>
  </channel>
</rss>
```

## Usage

CLI:

```bash
neurowire https://example.com/feed.xml -f rss
```

API:

```bash
curl 'http://localhost:8787/feed?url=https://example.com/feed.xml&format=rss'
```

See [Output formats](/concepts/output-formats) and [the CLI guide](/guide/cli).
