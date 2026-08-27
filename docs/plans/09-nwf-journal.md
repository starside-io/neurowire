# Epic 9: NWF journal (append-only log, the protocol substrate)

> **Status: shipped** in `@neurowire/core` 0.8.0, `@neurowire/ingest` 0.7.0, and
> `@neurowire/cli` 0.9.0. The format spec lives at
> [docs/formats/nwfj.md](../formats/nwfj.md) and the concept page at
> [docs/concepts/journals.md](../concepts/journals.md). What follows is the plan
> as executed; it is kept for the reasoning, not as outstanding work.
>
> Two things changed during implementation and are corrected below: the chain
> uses core's FNV-1a `hashHex` rather than sha256 (core stays free of
> `node:crypto`), and the CLI reads a cursor with `--cursor`, because `--since`
> already means a duration window everywhere else.

## Goal

Turn NWF from a snapshot format into a **log**. An NWF journal is an append-only,
line-oriented stream of entry records with stable cursors, so a feed or mesh
becomes something you can resume, replay, diff, and sync, not just re-download.

The journal is the substrate both follow-up arcs stand on:

- **Epic 11 (tail)** replays a journal from a cursor, then streams live appends.
- **Epic 12 (sync)** exchanges journal deltas between peers ("send me everything
  after cursor X").
- **Epic 13 (MCP)** answers "what is new since my last call" with a journal
  cursor instead of a lossy time window.

## Why the current NWF document cannot be appended

The NWF1 document ([nwf.ts](../../packages/core/src/serialize/nwf.ts)) is a
snapshot: header first, then complete `A`/`T`/`S` dictionaries, then `E` lines
whose timestamps are deltas from the feed-level `updated`. Appending an entry
would require rewriting the dictionaries and the header timestamp, which breaks
append-only semantics and any cursor pointing into the file.

## Design: NWFJ, an append-only sibling of NWF1

A journal file is a sequence of records, one per line, TAB-separated like NWF1
and reusing its cell escaping verbatim:

```
J	1	<journalId>	<createdEpoch>
F	<feedId>	<title>	<home>	<self>          (feed identity; re-emitted when it changes)
A+	<index>	<author>                        (dictionary growth: intern on first use)
T+	<index>	<tag>
S+	<index>	<source>
B	<baseUrl>                               (base can be (re)declared mid-stream)
E	<seq>	<epoch>	<id>	<link>	<authorRefs>	<tagRefs>	<title>	<summary>	<sourceRef>
C	<seq>	<hash>                          (optional checkpoint: hash chain head at seq)
```

Key differences from NWF1, each forced by append-only:

- **Dictionaries grow incrementally.** `A+`/`T+`/`S+` declare one interned value
  each, with an explicit index, emitted immediately before the first `E` line
  that references it. A reader builds the same tables NWF1 has, just lazily.
- **Entry timestamps are absolute epochs**, not deltas from a feed header that
  would go stale. Compactness is recovered because repeated entries share
  dictionaries across the whole journal lifetime, which a snapshot cannot do.
- **Every `E` line carries a sequence number** (`seq`, monotonically increasing
  from 1). A cursor is `<seq>` plus an optional integrity hash.
- **Optional hash chain.** A `C` line records `hash = hashHex(prevHash + line)` (core's FNV-1a)
  folded over all records since the previous checkpoint. Readers may verify or
  ignore it. This gives tamper evidence for Epic 12 without requiring it here.

### The format is its own index

Two properties of NWFJ give indexed access without any index files:

- **`seq` is the primary index.** It is monotonic and dense, and each segment
  covers a contiguous seq range, so locating a cursor is "pick the segment,
  scan its tail", never a full-journal scan.
- **Dictionaries are per-segment skip filters.** `A+`/`T+`/`S+` lines declare
  every author/tag/source a segment can reference, so a filter on
  `tag~rust` skips any segment whose dictionary never declares a matching tag,
  without decoding a single `E` line. The vocabulary is written anyway for
  round-tripping; using it for pruning is free.

To exploit both cheaply, the store keeps a small manifest sidecar per journal
(`<id>.manifest.json`): per segment, its seq range, min/max entry epoch, and
dictionary summary. The manifest is derivable from the segments (corrupt or
missing means rebuild by scanning), so it is a cache, not a second source of
truth.

### Query path (files stay the database)

No query language is invented. The existing filter engine is pointed at
journals, so archives answer the same questions live feeds do, with the same
semantics:

- **core**: `queryJournal` filters decoded journal entries by reusing
  `FilterSpec` ([filter.ts](../../packages/core/src/filter.ts)) and
  `SelectOptions` ([refine.ts](../../packages/core/src/refine.ts)). Pure
  functions over records; no fs.
- **ingest**: the store's `query(id, spec)` plans with the manifest (epoch
  range plus dictionary pruning), streams only the surviving segments, and
  applies the core filter per line, so memory stays flat regardless of journal
  size.
- **cli**: `neurowire journal query <id>` accepting the exact same
  `--filter/--exclude/--since/--until/--sort/--limit/-f` flags as the fetch
  path, emitting any output format. Research workflow:
  `neurowire journal query ai --filter tag~rust --since 30d -f md`.
- **grep floor**: because records are one-per-line TAB-separated text, crude
  research works with `grep`/`awk` directly on `.nwfj` files; the query
  command is for when refs and escapes must be resolved correctly.
- **escape hatch**: `journal cat -f json` decodes a journal (or a query
  result) to JSON for import into duckdb/sqlite/pandas when research outgrows
  the built-ins. The journal stays the source of truth; external databases are
  disposable views.

A journal is not a new output format in `FORMATS` (it is not a way to render a
feed, it is a way to store its history), so `serialize()` and the format
registry are untouched. It gets its own constants: `JOURNAL_MEDIA_TYPE`
(`application/x-nwf-journal`) and `JOURNAL_EXTENSION` (`.nwfj`).

## Package placement (dependency direction holds)

- **core** (pure, no fs): `core/src/journal.ts`
  - `JournalCursor`, `JournalRecord`, `JournalHeader` types.
  - `createJournalEncoder(journalId)`: stateful encoder; `push(entry, feedMeta)`
    returns the lines to append (dictionary lines as needed plus the `E` line).
  - `parseJournal(text)` and `readJournalSince(text, cursor)`: decode to
    `NeurowireEntry[]` plus the new head cursor.
  - `journalHead(text)`: cheap tail scan for the last `seq`/checkpoint.
  - `queryJournal(records, spec)`: the filter engine applied to journal
    records (see "Query path" above); pure, reuses `FilterSpec`/`SelectOptions`.
  - Dedupe on append by `entryKey` from [diff.ts](../../packages/core/src/diff.ts).
- **ingest** (fs-backed store): `ingest/src/journal-store.ts`
  - `openJournalStore(dir)` defaulting to `~/.config/neurowire/journal/`.
  - One journal per feed/mesh id, segment files `<id>.<n>.nwfj` rotated by size
    (default 5 MB). A cursor is `(segment, seq)` so rotation never invalidates
    older cursors; compaction drops whole old segments only.
  - `append(id, entries)`, `since(id, cursor)`, `head(id)`.
  - `query(id, spec)`: manifest-planned scan (segment pruning by epoch range
    and dictionary vocabulary), streaming decode, `queryJournal` per line.
  - Maintains the `<id>.manifest.json` sidecar on append/rotation; rebuilds it
    by scanning when missing or stale.
- **cli** (plumbing surface, deliberately small):
  - `neurowire journal head <id>`, `neurowire journal cat <id> [--cursor <n>]`.
  - `neurowire journal query <id>` with the same filter/refine/format flags as
    the fetch path.
  - `--journal <id>` flag on the normal fetch path: after fetching and refining,
    append fresh entries to the journal (the watch loop gets this for free since
    it already computes `fresh` via `partitionNew`).

## Non-goals

- No database and no query language. Files, cursors, and the existing filter
  engine only. The format's own structure (seq ranges, per-segment
  dictionaries, the manifest cache) is the index; no separate index files
  (sqlite, inverted indexes) get built beside it.
- No signing or peer identity (Epic 12 decides that).
- No automatic journaling of every fetch; opt-in via `--journal`.
- No API routes yet (Epics 11 and 12 add the network surface).

## Dependencies

None. This epic is the root of the dependency graph for Epics 10, 12, 13.

## Files touched

| File | Change |
|------|--------|
| `packages/core/src/journal.ts` | new: NWFJ encode/decode/cursor/head, `queryJournal` |
| `packages/core/src/journal.test.ts` | new: round-trip, resume, dedupe, hash chain, query, malformed input |
| `packages/core/src/index.ts` | export journal module |
| `packages/ingest/src/journal-store.ts` | new: segmented fs store, manifest sidecar, planned `query` |
| `packages/ingest/src/journal-store.test.ts` | new: rotation, cursors across segments, pruning (tmp dirs) |
| `packages/ingest/src/index.ts` | export store |
| `packages/cli/src/index.ts` | `journal` subcommand (`head`/`cat`/`query`), `--journal` flag, watch integration |
| `packages/cli/src/pipeline.ts` | pure helpers for the journal flag (keeps entrypoint thin) |
| `docs/formats/nwfj.md` | new: the NWFJ spec, written like the NWF spec in the README |
| `docs/guide/cli.md`, `docs/reference/*.md` | document the new surface |

## Steps

1. Write the NWFJ spec doc first (`docs/formats/nwfj.md`); the encoder is an
   implementation of the spec, not the other way round.
2. `core/src/journal.ts` encoder/decoder plus tests to 100% (core threshold).
3. `ingest/src/journal-store.ts` segmented store plus tests.
4. Query path: `queryJournal` in core, manifest sidecar plus planned `query`
   in the store.
5. CLI `journal` subcommand (`head`/`cat`/`query`) and `--journal` flag; wire
   into the watch loop.
6. Docs pass, `pnpm docs:build`, changelog entries.

## Tests

- Round-trip: entries in, journal text, entries out, byte-stable re-encode.
- Resume: cursor at seq N, `readJournalSince` returns exactly the tail.
- Dictionary growth: interned refs resolve identically to an NWF1 snapshot of
  the same feed.
- Hash chain: verify passes on clean text, fails on a flipped byte.
- Store: rotation at the size cap, cursor spanning a segment boundary,
  concurrent-ish append safety (append is a single `appendFileSync` per batch).
- Query: `queryJournal` matches `filterEntries`+`selectEntries` output for the
  same spec on the same entries (property: journals and live feeds answer
  identically); segment pruning skips segments whose dictionary or epoch range
  cannot match (assert skipped segments are never opened); a deleted manifest
  is rebuilt and yields identical results.
- Malformed lines: line-numbered diagnostics in the style of `validateNwf`.

## Risks

- **Spec churn once 12/13 build on it.** Mitigate: version cell in the `J`
  header from day one; write the spec before the code.
- **Compaction vs live cursors.** Mitigate: segment-level compaction only, and
  `since()` answers "cursor too old" distinctly so callers (sync) can fall back
  to a full snapshot.
- **Unbounded dictionary growth in long-lived journals.** Accepted for v1;
  rotation naturally resets dictionaries per segment.

## Acceptance

- `docs/formats/nwfj.md` fully specifies the format; the encoder round-trips it.
- `neurowire --mesh examples/ai.mesh.json --journal ai` twice appends only new
  entries the second time; `neurowire journal cat ai --since <cursor>` prints
  exactly the delta.
- `neurowire journal query ai --filter tag~<x> --since 30d -f md` returns the
  same entries the live fetch path would for that spec, and provably skips
  non-matching segments on a multi-segment fixture.
- core stays at 100% coverage; ingest thresholds hold.
