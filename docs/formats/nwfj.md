# NWFJ (Neurowire Feed Journal)

`nwfj` is Neurowire's append-only sibling of [NWF](./nwf). Where an `nwf` document is a *snapshot* of a feed, a journal is a *log*: entries are appended over time, every entry carries a sequence number, and a reader can resume from a cursor instead of re-reading the whole file. The encoder, decoder, and query helpers live in `packages/core/src/journal.ts`; the segmented on-disk store lives in `packages/ingest/src/journal-store.ts`.

| | |
|---|---|
| Media type | `application/x-nwf-journal` |
| Extension | `nwfj` |
| Version | `1` |
| Core functions | `createJournalEncoder`, `resumeJournalEncoder`, `parseJournal`, `readJournalSince`, `journalHead`, `verifyJournal`, `queryJournal`, `journalToFeed` |
| Store | `openJournalStore({ dir })` |

A journal is deliberately **not** an output format: it is not a way to render a feed, it is a way to store its history. `serialize()` and the `FORMATS` registry are untouched.

## Why NWF1 cannot simply be appended to

An `nwf` document puts its complete `A` / `T` / `S` dictionaries near the top and stores each entry's date as a delta from the feed-level `updated`. Appending one entry would mean rewriting the dictionaries and the header timestamp, which breaks append-only semantics and invalidates every cursor pointing into the file. NWFJ keeps the same cell grammar and escaping, and changes only what append-only forces it to change.

## Layout

Lines are LF-separated, cells within a line are TAB-separated, and text cells use exactly the same escaping as `nwf` (backslash, TAB, CR, LF; sub-fields joined by the ASCII Unit Separator, 0x1f).

```
J   1  <journalId>  <createdEpoch>                     journal header, one per segment
F   <feedId>  <title>  <home>  <self>                  feed identity, re-emitted when it changes
A+  <index>  <author>                                  dictionary growth, interned on first use
T+  <index>  <tag>
S+  <index>  <source>
B   <baseUrl>                                          link prefix, may be re-declared
E   <seq>  <updated>  <published>  <id>  <link>  <authorRefs>  <tagRefs>  <title>  <summary>  <sourceRef>
C   <seq>  <hash>                                      checkpoint, chain value at seq
```

What changes relative to NWF1, and why:

- **Dictionaries grow incrementally.** `A+`, `T+`, and `S+` each declare one interned value with an explicit index, emitted immediately before the first `E` line that references it. A reader builds the same lookup tables `nwf` has, just lazily. Indices are per segment and always dense, starting at 0.
- **Timestamps are absolute epoch seconds**, not deltas from a header that would go stale as the log grows. Both dates are kept in their own cell (`updated`, `published`), and either may be `-` when absent, so a journal round-trips dates losslessly rather than collapsing them into one field.
- **Every `E` line carries a sequence number.** `seq` starts at 1 and increases by one per entry for the life of the journal, across segment rotations. It is the primary index.
- **Checkpoints are optional.** A `C` line records the running chain value at a given `seq`. Readers may verify or ignore it.

Unknown line kinds are reported as issues by the validator and skipped by the parser, so a future version can add record types without breaking older readers.

## Cursors

A cursor is a sequence number plus an optional chain hash, written `"42"` or `"42.9f1c0f0b8ad0f0e3"`. `journalHead(text)` returns the cursor at the end of a journal, and `readJournalSince(text, cursor)` returns exactly the records after it. Because `seq` is global to the journal and never reused, a cursor survives segment rotation: the store maps a `seq` back to a segment through its manifest.

```ts
import { journalHead, readJournalSince } from '@neurowire/core'

const head = journalHead(text)              // { seq: 128, hash: '...' }
const { records } = readJournalSince(text, head)  // [] until something new is appended
```

## The chain

Each record line after the header folds into a running chain value: `chain = hashHex(chain + "\n" + line)`, seeded from the journal id. `C` lines record that value and are themselves excluded from the fold. `verifyJournal(text)` recomputes the chain and reports any checkpoint that disagrees, along with the line number.

The chain uses core's FNV-1a `hashHex`, the same 64-bit hash behind `stableId`. It detects corruption, truncation, and accidental reordering. **It is a checksum, not a cryptographic digest**, and it does not prove authorship: anyone who edits a journal can recompute it. Keeping it here preserves core's portability promise (no `node:crypto`, no dependencies beyond zod). The `J` line carries a version cell so a future revision can introduce a cryptographic digest and signed checkpoints where a stronger guarantee is needed.

## The format is its own index

Two properties give journals indexed access with no index files beside them:

- **`seq` is the primary index.** It is monotonic and dense, and each segment covers a contiguous seq range, so finding a cursor means picking a segment and scanning it, never scanning the whole journal.
- **Dictionaries are per-segment skip filters.** A segment's `A+` / `T+` / `S+` lines declare every author, tag, and source any entry in that segment can reference. A query filtering on `tag:rust` can therefore skip a segment whose tag dictionary holds no match without decoding a single `E` line. The vocabulary is written anyway to make the segment self-contained, so using it for pruning is free.

The store keeps a `<id>.manifest.json` sidecar recording, per segment, its seq range, its date range, its dictionaries, and its entry keys. The manifest is fully derivable by scanning the segments, so a missing or corrupt manifest is rebuilt rather than fatal. It is a cache, never a second source of truth.

## Querying

No query language is invented. The existing filter engine is pointed at journal records, so an archive answers exactly what a live feed answers:

```ts
import { queryJournal } from '@neurowire/core'

const entries = queryJournal(records, {
  filter: { include: [{ field: 'tag', pattern: 'rust' }] },
  from: Date.now() - 30 * 86_400_000,
  sort: 'date',
  limit: 20,
})
```

`queryJournal` composes `filterEntries` and `selectEntries` from core, so journal results and live-feed results are identical for the same spec by construction. The store's `query(id, spec)` adds planning on top: it prunes segments by date range and dictionary vocabulary, then decodes only the survivors.

From the CLI:

```bash
neurowire journal query ai --filter tag:rust --since 30d -f md
```

Because records are one line each and TAB-separated, crude research also works with ordinary text tools:

```bash
grep -c '^E' ~/.config/neurowire/journal/ai.00001.nwfj
```

When research outgrows the built-ins, `neurowire journal cat ai -f json` hands the whole archive to duckdb, sqlite, or pandas. The journal stays the source of truth and those databases are disposable views.

## Segments and rotation

The store writes `<id>.<nnnnn>.nwfj` segments and rotates to a new one past a size cap (5 MB by default). Each segment repeats the `J` header and starts its dictionaries fresh, so any segment can be read on its own, and rotation naturally bounds dictionary growth. Compaction drops whole old segments; a cursor pointing into a dropped segment is reported as too old, so the caller can fall back to reading from the oldest retained segment instead of silently missing entries.

## Annotated sample

```
J	1	ai	1782640800
F	https://example.com/feed	Example Blog	https://example.com/	
B	https://example.com/
T+	0	release
E	1	-	1782640800	post-1	~posts/one		0	First post		
S+	0	Example
E	2	-	1782727200	post-2	~posts/two			Second post	A summary	0
C	2	9573a6ab74a4ba94
```

Line by line (cells are TAB-separated, and consecutive tabs mean an empty cell):

| Line | Reading |
|------|---------|
| `J` | Version 1, journal id `ai`, created 2026-06-28. |
| `F` | The feed identity. The trailing empty cell is `self`, which this feed did not declare. |
| `B` | The link prefix, taken from the feed's `home`. |
| `T+` | The tag `release` is interned as index 0, right before the entry that first uses it. |
| `E` (seq 1) | No `updated` (`-`), published at 1782640800, id `post-1`, link `~posts/one` (relative to `B`), no authors, `tagRefs` = `0`, title `First post`, no summary, no source. |
| `S+` | The source `Example` is interned as index 0, again just before its first use. |
| `E` (seq 2) | Same shape, with a summary and `sourceRef` = `0`. It declares no tags, so its `tagRefs` cell is empty. |
| `C` | A checkpoint: the chain value after sequence 2. |

Notice that the second entry reuses nothing from a dictionary it does not need, and that neither entry repeats the feed identity: `F` and `B` were emitted once and stay in effect until something changes.

## Round-trip guarantees

A journal round-trips the same list essentials `nwf` does (feed `id` / `title` / `home` / `self`, and entry `id` / `title` / `link` / `updated` / `summary` / `authors` / `tags` / `source`), plus `published` as its own cell. It does not carry `generator`, and it does not store feed-level authors: a journal spans many feed identities over its lifetime, so per-entry authorship is the only attribution that stays meaningful after a merge.
