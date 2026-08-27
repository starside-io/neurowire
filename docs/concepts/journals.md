# Journals

A **journal** is an append-only archive of what a source has published. Everything else in Neurowire deals in snapshots: a feed is whatever a site is showing right now, and yesterday's entries are gone once they fall off the page. A journal keeps them.

That changes what you can ask. A feed answers "what is on the front page". A journal answers "what did this source publish in March", "what is new since I last looked", and "how much did they write about Rust this year".

The format is [NWFJ](/formats/nwfj), the append-only sibling of [NWF](/formats/nwf). The encoder and decoder live in [`@neurowire/core`](/reference/core#journal); the on-disk store lives in [`@neurowire/ingest`](/reference/ingest#journal-store).

## Why NWF could not just be appended to

An `nwf` document puts its complete dictionaries near the top and stores each entry's date as a delta from a feed-level timestamp. Adding one entry would mean rewriting the dictionaries and the header, which breaks append-only writing and invalidates any position recorded into the file.

NWFJ keeps the same cell grammar and escaping and changes only what append-only forces:

| | `nwf` (snapshot) | `nwfj` (journal) |
|---|---|---|
| Dictionaries | complete, near the top | grow one line at a time, before first use |
| Timestamps | delta from the feed header | absolute, and `published` and `updated` each keep their own cell |
| Entry position | implicit (line order) | an explicit `seq`, unique for the life of the journal |
| Integrity | none | an optional chain, checkpointed |

## Cursors

Every entry gets a sequence number, starting at 1 and never reused. A **cursor** is that number, optionally with the chain value it was taken at:

```
128                     the 128th entry
128.9f1c0f0b8ad0f0e3    ...and the chain value there, so a reader can verify it
```

A cursor is how you resume. Record the head after a read, hand it back next time, and you get exactly what arrived in between:

```bash
neurowire journal head ai            # 128
neurowire journal cat ai --cursor 128 -f json
```

Because sequence numbers are global to the journal, a cursor keeps working after the store rotates to a new segment file.

## Segments

A journal is not one growing file. The store writes size-capped segments (`ai.00001.nwfj`, `ai.00002.nwfj`, ...) and rotates past 5 MB. Each segment repeats the header and starts its dictionaries fresh, so any segment can be read on its own, and dictionaries cannot grow without bound.

Compaction drops whole old segments. A cursor pointing into a dropped segment is reported as **too old** rather than silently returning a partial answer, so the caller knows to re-read from the start instead of quietly missing entries.

## The format is its own index

Journals stay queryable at size without a database beside them, because two things the format already writes double as an index:

- **`seq` is the primary index.** It is monotonic and dense, and each segment covers a contiguous range, so finding a cursor means picking one segment, never scanning the archive.
- **Dictionaries are skip filters.** A segment declares every author, tag, and source its entries can reference. A query for `tag:rust` can therefore rule out a segment whose tag dictionary holds no match, without opening it. The vocabulary is written anyway to make the segment self-contained, so pruning is free.

The store keeps a `<id>.manifest.json` sidecar recording each segment's sequence range, date range, dictionaries, and entry keys. It is a **cache, never a second source of truth**: delete it, corrupt it, or edit a segment behind its back, and it is rebuilt by rescanning.

## Querying: no new language

A journal is queried with the same flags a live fetch uses, because it runs the same code. `queryJournal` composes `filterEntries` and `selectEntries` from core, so an archive and a live feed cannot disagree about what a filter means:

```bash
neurowire journal query ai --filter tag:rust --since 30d --sort date -f md
```

Three levels of access, in order of how much structure you need:

1. **`grep`.** Segments are one record per line, TAB-separated. `grep -c '^E' ai.00001.nwfj` counts entries. Good enough for a quick look.
2. **`journal query`.** Resolves interned references and escaping correctly, prunes segments, applies filters and windows.
3. **Anything else.** `journal cat ai -f json` hands the archive to duckdb, sqlite, or pandas. The journal stays the source of truth; those are disposable views.

## The chain

Each record folds into a running hash, and `C` lines checkpoint it. `verifyJournal` recomputes the chain and reports any checkpoint that disagrees, which catches corruption, truncation, and reordering.

::: warning It is a checksum, not a signature
The chain uses core's FNV-1a hash, the same one behind `stableId`, so that `@neurowire/core` stays portable and free of `node:crypto`. It detects damage; it does not prove authorship, because anyone who edits a journal can recompute it. The header carries a version cell so a future revision can introduce a cryptographic digest and signed checkpoints.
:::

## Journaling is opt-in

Nothing is archived unless you ask. Add `--journal <id>` to any fetch:

```bash
neurowire --mesh ai-news.json --journal ai
neurowire --mesh ai-news.json --journal ai --watch --interval 30m
```

Entries the journal already holds are dropped on append, which is what makes this safe to run on a timer: re-fetching the same front page adds nothing. Journals live in `$NEUROWIRE_JOURNAL`, else `~/.config/neurowire/journal`, or wherever `--journal-dir` points.

::: tip Journals and watch state are different things
`--state` remembers entry keys so a watch loop does not re-report or re-deliver the same item. It is a set of keys with no content and no history. `--journal` keeps the entries themselves, in order, with cursors. Use `--state` to avoid duplicate notifications; use `--journal` to keep a record you can come back to. They compose: a watch loop can do both.
:::

## What a journal is not

::: warning Not an output format
A journal stores a feed's history rather than rendering it, so `nwfj` is deliberately **not** in `FORMATS` and `serialize()` does not know about it. Reading one back gives you an ordinary `NeurowireFeed` (`journalToFeed`), which every serializer already handles.
:::

It is also not a database: no indexes beside the files, no query language. Exchanging journal deltas between machines is a separate concern, layered on top rather than built in: see [Sync](/concepts/sync).

See the [NWFJ format](/formats/nwfj) for the line grammar, and the [CLI journal commands](/guide/cli#journals) for day-to-day use.
