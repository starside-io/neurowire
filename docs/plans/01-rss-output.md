# Epic 1: RSS 2.0 output serializer

## Goal

Emit RSS 2.0 from a `NeurowireFeed`. We already parse RSS
([parsers/feed.ts](../../packages/ingest/src/parsers/feed.ts)) but can only emit
atom / json / md / nwf. RSS 2.0 is the widest-supported reader/podcast format;
not emitting it is the single biggest "why can't I use this output" gap.

## Scope

- New serializer `core/src/serialize/rss.ts` exporting `toRss(feed): string`.
- Register `rss` across the four registries in
  [serialize/index.ts](../../packages/core/src/serialize/index.ts):
  - `FORMATS` (line 8)
  - `MEDIA_TYPES` (line 12): `application/rss+xml; charset=utf-8`
  - `EXTENSIONS` (line 20): `xml` (collides with atom's extension; see Risks)
  - `serialize()` switch (line 32) + re-export (line 45 block)
- Tests to keep core at 100% statements/functions/lines.

## Non-goals

- RSS 1.0 / RDF output (rare; revisit only if asked).
- Podcast namespaces (`itunes:`, `podcast:`) - model has no audio enclosures, so
  out of scope until the model grows them.
- CLI/API wiring beyond what the format registry gives for free (both dispatch
  through `serialize()`, so `-f rss` and `?format=rss` work automatically once
  registered; just confirm in tests).

## Dependencies

None. Pure `core`. Foundation epic, nothing blocks it.

## Field mapping (NeurowireFeed -> RSS 2.0)

| Model | RSS element | Notes |
|-------|-------------|-------|
| `feed.title` | `<channel><title>` | required |
| `feed.home` | `<channel><link>` | falls back to `self` then feed `id` |
| `feed.title` (reuse) or generator | `<channel><description>` | RSS requires description; use feed title if none |
| `feed.updated` | `<channel><lastBuildDate>` | RFC 822 date (see below) |
| `feed.self` | `<atom:link rel="self">` | needs `xmlns:atom`; optional but good practice |
| `feed.generator` | `<generator>` | optional |
| `entry.title` | `<item><title>` | |
| `entry.link` | `<item><link>` + `<guid isPermaLink=...>` | use `entry.id` for guid if stable, else link |
| `entry.id` | `<guid>` | `isPermaLink="false"` when id is synthetic |
| `entry.summary` | `<description>` | escape HTML |
| `entry.published`/`updated` | `<pubDate>` | RFC 822 |
| `entry.authors[].name` | `<author>` or `<dc:creator>` | RSS `<author>` wants email; prefer `dc:creator` with `xmlns:dc` |
| `entry.tags[]` | `<category>` (repeated) | |
| `entry.source` | `<source>` | optional |

### Date format

RSS uses **RFC 822** (e.g. `Wed, 02 Oct 2024 13:00:00 GMT`), not ISO 8601.
Add a small `toRfc822(iso: string): string` helper inside rss.ts (do not pull a
dep; core is `zod`-only). Reuse the same XML-escaping helper pattern atom.ts
already uses (copy/extract, do not add a dep).

## Steps

1. Read [atom.ts](../../packages/core/src/serialize/atom.ts) for the house style:
   escaping helper, string-builder shape, how optional fields are guarded.
2. Write `rss.ts`: `toRss(feed)` + `toRfc822()`. XML-escape every text node.
   Declare `xmlns:atom` and `xmlns:dc` on `<rss>` only if those elements are used.
3. Register in `serialize/index.ts` (all four spots + re-export).
4. Tests `rss.test.ts`: full feed, empty entries, missing optional fields,
   dateless entry, HTML in title/summary (escaping), synthetic vs real guid,
   RFC 822 output exactness. Snapshot the full document.
5. `pnpm build && pnpm test && pnpm typecheck && pnpm lint`. Confirm core 100%.
6. Add one line to the README output-formats section and the `FORMATS` mention.

## Risks / decisions

- **Extension collision:** both `atom` and `rss` map to `.xml`. `EXTENSIONS` is a
  `Record<Format,string>`, so distinct keys with the same value is fine. The web
  CLI / file writers key off format name, not extension, so no clash. Confirm no
  code does reverse lookup extension -> format (grep `EXTENSIONS`).
- **guid stability:** entries already have stable synthetic ids (commit
  `e8e4617`). Use `entry.id` as guid with `isPermaLink="false"` unless id equals
  the link.
- **description required by spec:** never emit an empty `<description>` for the
  channel; fall back to title.

## Acceptance

- `serialize(feed, 'rss')`, CLI `-f rss`, API `?format=rss` all return valid
  RSS 2.0 that validates in a feed validator and loads in a reader.
- core coverage still 100/100/100.
