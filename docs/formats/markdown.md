# Markdown

Neurowire can render a feed as a human-readable Markdown digest. The serializer lives in `packages/core/src/serialize/markdown.ts` and is exported as `toMarkdown`.

| | |
|---|---|
| Format key | `md` |
| Media type | `text/markdown; charset=utf-8` |
| Extension | `md` |
| Function | `toMarkdown(feed)` |

```ts
import { toMarkdown } from '@neurowire/core'

const md = toMarkdown(feed)
```

This is a presentation-oriented digest, meant to be read or pasted into a document. It is not round-trippable like [NWF](/formats/nwf): it carries the list essentials in a friendly layout, not every model field.

## Field mapping

### Feed header

- `feed.title` becomes the top-level heading: `# Title`.
- A metadata line follows, joining the present items with ` · `:
  - `Updated <date>` when `feed.updated` is set (formatted as a `YYYY-MM-DD` date).
  - `[Home](url)` when `feed.home` is set.
  - `[Feed](url)` when `feed.self` is set.

### Each entry

- `### [title](link)` heading linking the title to `entry.link`.
- A metadata line (joined by ` · `) when any of these are present:
  - The date, `entry.updated` else `entry.published`, formatted `YYYY-MM-DD`.
  - The authors, joined by `, ` (names only).
  - The tags, each wrapped in backticks (`` `tag` ``), space-separated.
- The `entry.summary` on its own line when present.

::: tip Dates
Dates are sliced to the `YYYY-MM-DD` day (first 10 characters of the ISO string). An unparseable date string is passed through unchanged rather than dropped.
:::

The feed `id`, `self`/`home` beyond the header links, entry `id`, and `source` are not shown in the digest.

## Sample output

```markdown
# Example Blog

Updated 2026-06-28 · [Home](https://example.com/) · [Feed](https://example.com/feed.xml)

### [Hello, world](https://example.com/posts/hello)

2026-06-27 · Ada Lovelace · `intro`

A first post.

### [Second post](https://example.com/posts/second)

2026-06-26 · Grace Hopper

Another update with no tags.
```

## Usage

CLI:

```bash
neurowire https://example.com/feed.xml -f md
```

API:

```bash
curl 'http://localhost:8787/feed?url=https://example.com/feed.xml&format=md'
```

See [Output formats](/concepts/output-formats) and [the CLI guide](/guide/cli).
