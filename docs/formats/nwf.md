# NWF (Neurowire Feed)

`nwf` is Neurowire's own compact, line-oriented feed format. It round-trips the model and stays small by interning repeated values, relativizing links, and storing dates as deltas. The serializer, parser, and validator live in `packages/core/src/serialize/nwf.ts`.

| | |
|---|---|
| Format key | `nwf` |
| Media type | `text/x-neurowire; charset=utf-8` |
| Extension | `nwf` |
| Functions | `toNwf(feed)`, `fromNwf(text)`, `validateNwf(text)` |
| Types | `NwfIssue`, `NwfValidation` |

```ts
import { toNwf, fromNwf, validateNwf } from '@neurowire/core'

const text = toNwf(feed)        // serialize
const back = fromNwf(text)      // parse (round-trip)
const result = validateNwf(text) // validate with diagnostics
```

## Layout

Lines are LF-separated, cells within a line are TAB-separated. The first line is the magic header `NWF1`. Each subsequent line begins with a one-letter kind:

```
NWF1                                                  magic + version
F  id  title  home  self  updatedEpoch  authorRefs    feed header
A  author0  author1  ...                              authors dictionary (interned)
T  tag0  tag1  ...                                     tags dictionary (interned)
S  source0  source1  ...                              sources dictionary (interned; meshes)
B  https://blog.example.com/posts/                    shared link prefix
E  id  delta  link  authorRefs  tagRefs  title  summary  sourceRef   one entry per line
```

How it stays compact:

- **Interned dictionaries.** Authors (`A`), tags (`T`), and sources (`S`) are listed once and referenced by integer index. `authorRefs` and `tagRefs` are comma-separated indices into `A` / `T`; `sourceRef` is a single index into `S`.
- **Relative links.** `B` holds the longest shared link prefix (trimmed to a path boundary, keeping scheme plus host). Entry links that start with the base are stored as `~rest`, expanded back at parse time. The `B` line is only emitted when a useful common base exists.
- **Delta timestamps.** Each entry stores its date (`updated` else `published`) as a delta in seconds before the feed's `updatedEpoch`, or `-` when it has no date.
- **Escaping.** Text cells escape backslash, TAB, CR, and LF. Within an author or source cell, sub-fields (name / url / email) are joined by the ASCII Unit Separator (0x1f), which never appears in feed text.

`nwf` round-trips the list essentials: feed `id`/`title`/`home`/`self`/`updated`/`authors`, and entry `id`/`title`/`link`/`updated`/`summary`/`authors`/`tags`/`source`. It does not carry `generator`. The `sourceRef` column is appended last, so older NWF1 documents that omit it still parse.

## Annotated sample

```
NWF1                                            ← magic + version
F	https://example.com/feed	Example Blog	https://example.com/	https://example.com/feed.nwf	1782640800	0
A	Ada Lovelace                                ← author index 0
T	intro	release                             ← tag index 0, 1
B	https://example.com/posts/                  ← shared link prefix
E	https://example.com/posts/hello	86400	~hello	0	0	Hello, world	A first post.
```

Reading the `E` line: id `https://example.com/posts/hello`, dated 86400 seconds (one day) before the feed's `updated`, link `~hello` (expands to `https://example.com/posts/hello`), author index `0` (Ada Lovelace), tag index `0` (intro), title `Hello, world`, summary `A first post.`, and no `sourceRef`.

::: info Round-trip
`fromNwf(toNwf(feed))` reconstructs the canonical model. `fromNwf` throws if the document is missing the `NWF1` header.
:::

## Validation

`validateNwf(text)` checks the document and returns line-numbered diagnostics. It validates the header, the single required feed (`F`) line, line kinds, cell counts, the `updatedEpoch` integer, entry `delta` format (`-` or an integer), empty ids/links, and that every dictionary reference is in range. When there are no errors it also parses the feed.

```ts
interface NwfIssue {
  line: number    // 1-based line number
  message: string
}

interface NwfValidation {
  valid: boolean
  errors: NwfIssue[]
  warnings: NwfIssue[]
  feed?: NeurowireFeed // present only when there are no errors
}
```

Errors include: a missing/wrong header, missing or duplicate `F` line, non-integer `updatedEpoch`, an `E` line with fewer than 7 cells, an empty entry id, a malformed `delta`, and any author/tag/source reference that is not an integer or points past the dictionary. Warnings include: a `B` line with no base URL, an entry with an empty link, and a feed with no entries.

## The `validate` command

The CLI ships a `validate` subcommand that runs `validateNwf` over a file or URL and exits non-zero when the document is not well-formed:

```bash
neurowire validate feed.nwf
neurowire validate https://example.com/feed.nwf
```

In dev: `pnpm validate <url>`.

## Usage

CLI:

```bash
neurowire https://example.com/feed.xml -f nwf
```

API:

```bash
curl 'http://localhost:8787/feed?url=https://example.com/feed.xml&format=nwf'
```

See [Output formats](/concepts/output-formats) and [the CLI guide](/guide/cli).
