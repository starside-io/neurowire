# Atom

Atom 1.0 is Neurowire's default XML feed format. The serializer lives in `packages/core/src/serialize/atom.ts` and is exported as `toAtom`.

| | |
|---|---|
| Format key | `atom` |
| Media type | `application/atom+xml; charset=utf-8` |
| Extension | `xml` |
| Function | `toAtom(feed)` |

```ts
import { toAtom } from '@neurowire/core'

const xml = toAtom(feed)
```

`toAtom` is a pure function: it takes a [`NeurowireFeed`](/concepts/model) and returns an Atom 1.0 document as a string. No network, no DOM.

## Field mapping

The canonical model maps to Atom elements as follows.

### Feed level

| Model field | Atom output | Notes |
|---|---|---|
| `feed.id` | `<id>` | Text-escaped. |
| `feed.title` | `<title>` | Text-escaped. |
| `feed.updated` | `<updated>` | Coerced to RFC 3339. Falls back to the Unix epoch (`1970-01-01T00:00:00.000Z`) when missing or unparseable. |
| `feed.home` | `<link rel="alternate" href="..."/>` | Emitted only when present. |
| `feed.self` | `<link rel="self" href="..."/>` | Emitted only when present. |
| `feed.authors[]` | `<author>` blocks | Each with `<name>`, optional `<uri>` (from `url`), optional `<email>`. |
| `feed.generator` | `<generator version="...">name</generator>` | The `version` attribute is emitted only when set. |
| `feed.entries[]` | `<entry>` blocks | One per entry, in order. |

### Entry level

| Model field | Atom output | Notes |
|---|---|---|
| `entry.id` | `<id>` | Text-escaped. |
| `entry.title` | `<title>` | Text-escaped. |
| `entry.link` | `<link rel="alternate" href="..."/>` | Attribute-escaped. |
| `entry.updated` / `entry.published` | `<updated>` | Uses `updated`, else `published`, else the feed's `updated`. Coerced to RFC 3339. |
| `entry.published` | `<published>` | Emitted only when present. |
| `entry.authors[]` | `<author>` blocks | Same shape as feed authors. |
| `entry.tags[]` | `<category term="..."/>` | One per tag. |
| `entry.summary` | `<summary type="text">...</summary>` | Emitted only when present. |

::: info Escaping
Text content escapes `&`, `<`, and `>`. Attribute values escape those plus `"`. There is no other transformation: the model is assumed to hold plain text.
:::

::: tip Dates
All timestamps run through an RFC 3339 coercion step (`Date.parse` then `toISOString`). Unparseable values fall back: the feed `updated` falls back to the epoch, and an entry's date falls back to the feed `updated`.
:::

## Sample output

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/feed</id>
  <title>Example Blog</title>
  <updated>2026-06-28T10:00:00.000Z</updated>
  <link rel="alternate" href="https://example.com/"/>
  <link rel="self" href="https://example.com/feed.xml"/>
  <author>
    <name>Ada Lovelace</name>
    <uri>https://example.com/ada</uri>
  </author>
  <generator version="0.1.0">Neurowire</generator>
  <entry>
    <id>https://example.com/posts/hello</id>
    <title>Hello, world</title>
    <link rel="alternate" href="https://example.com/posts/hello"/>
    <updated>2026-06-27T09:30:00.000Z</updated>
    <published>2026-06-27T09:30:00.000Z</published>
    <author>
      <name>Ada Lovelace</name>
    </author>
    <category term="intro"/>
    <summary type="text">A first post.</summary>
  </entry>
</feed>
```

## Usage

CLI:

```bash
neurowire https://example.com/feed.xml -f atom
```

API:

```bash
curl 'http://localhost:8787/feed?url=https://example.com/feed.xml&format=atom'
```

See [Output formats](/concepts/output-formats) for the full format list and [the CLI guide](/guide/cli) for flags.
