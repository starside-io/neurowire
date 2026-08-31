# NWF Sync (peer delta exchange)

`nwf-sync/1` is the protocol two Neurowire nodes speak to exchange journal deltas. One node aggregates sources into an [NWFJ journal](./nwfj); other nodes pull "everything after my cursor" instead of re-fetching every upstream site themselves.

It is deliberately boring transport over a novel payload: plain pull-only HTTP `GET`s, no push, no gossip, no discovery. The interesting part is the journal, which already numbers every entry and checkpoints a hash chain, so a delta is just "the records after seq N".

| | |
|---|---|
| Protocol name | `nwf-sync` |
| Version | `1` |
| Version header | `NWF-Sync-Version: 1` on every `/sync/*` response |
| Payload media type | `application/x-nwf-journal` (NWFJ) |
| Server | `packages/api/src/sync.ts`, mounted at `/sync/*` |
| Client | `packages/ingest/src/sync.ts` (`pullJournal`, `syncPeers`) |

## Endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /sync/journals` | JSON: the published journals, each with `id`, `title`, `head`, `updated`, `entries` |
| `GET /sync/head?journal=<id>` | JSON `{ journal, head, hash? }`, the cheap poll target |
| `GET /sync/since?journal=<id>&cursor=<c>` | One NWFJ segment containing records after `c`; `204` when up to date, `410` when `c` is too old |
| `GET /sync/snapshot?journal=<id>&cursor=<c>` | The same as `since`, except a too-old cursor is clamped to the oldest retained segment instead of failing |

Every response, including errors, carries `NWF-Sync-Version: 1`. A client that sees a version it does not implement must not merge the body. An **absent** header is tolerated (a proxy may have stripped it, and every other check still applies); a header naming another version is not, because v2 is free to change what a segment or a cursor means.

### `GET /sync/journals`

```json
{
  "version": 1,
  "journals": [
    { "id": "ai", "title": "AI News", "head": 1284, "hash": "9f1c0f0b8ad0f0e3",
      "entries": 1284, "segments": 3, "bytes": 812004, "updated": "2026-08-27T09:11:04.000Z" }
  ]
}
```

Only published journals are listed (see [Publishing](#publishing)). `updated` is the newest entry timestamp known to the manifest, omitted when no entry is dated. `head` is the journal's last sequence number, `0` for an empty journal (an explicitly published id is listed even before it holds anything).

`title` comes from an `F` line, which is re-emitted only when identity changes and so sits at the top of the newest segment in every ordinary journal. Servers should read a bounded prefix rather than decoding the whole segment: on an open node this endpoint is reachable without a token, and a full decode per published journal per request is a free amplifier. The title is informational, and omitting it is better than paying megabytes to produce it.

### `GET /sync/head`

```json
{ "journal": "ai", "head": 1284, "hash": "9f1c0f0b8ad0f0e3" }
```

This is the steady-state request: a client that is already current asks one question worth a few dozen bytes and goes back to sleep. `hash` is the chain value at `head` when the journal's last segment ends in a checkpoint at that sequence number; it is absent for an empty journal.

### `GET /sync/since`

| Query | Required | Default | Description |
|-------|----------|---------|-------------|
| `journal` | yes | - | The journal id. |
| `cursor` | no | `0` | The last sequence number the client already holds, in this server's numbering. Accepts `42` or `42.<hash>`; the hash half is ignored by the server (clients verify the chain themselves). |

Responses:

| Status | Meaning |
|--------|---------|
| `200` | An NWFJ segment. Body media type `application/x-nwf-journal`. |
| `204` | The cursor is at or past the head. No body. |
| `400` | `journal` missing, or `cursor` is not a non-negative integer (optionally followed by `.<hash>`). |
| `401` | A token is configured and the request did not present it. |
| `404` | The journal is not published (or does not exist, see [Publishing](#publishing)). |
| `410` | The cursor predates the oldest retained segment. Body points at `/sync/snapshot`. |

A `200` carries these response headers:

| Header | Description |
|--------|-------------|
| `NWF-Sync-Version` | `1`. |
| `NWF-Sync-Journal` | The journal id. |
| `NWF-Sync-Head` | The journal's head sequence number, so a client learns it without a second request. |
| `NWF-Sync-Range` | `<firstSeq>-<lastSeq>`, the sequence range of the segment in the body. |
| `NWF-Sync-Segment` | The segment's index within the journal. |
| `NWF-Sync-Complete` | `1` when this segment reaches the head, `0` when more segments remain. |

### `GET /sync/snapshot`

Identical to `since`, including its headers, with one difference: a cursor older than the oldest retained segment is clamped to that segment rather than answered with `410`. It is therefore both the bootstrap path for a brand new client (`cursor=0`) and the recovery path after a `410`.

`snapshot` never returns `410`. It still returns `204` when the cursor is at or past the head.

## One segment per response

`since` and `snapshot` return **exactly one segment**, never a concatenation, even when the client is many segments behind. The client loops on `NWF-Sync-Complete: 0`, passing the previous response's `lastSeq` as the next cursor.

This is a correctness requirement, not a throughput choice. NWFJ dictionary indices (`A+`, `T+`, `S+`) are per segment and dense from `0`, and the hash chain reseeds from the journal id at each `J` header line. Two segments glued together therefore decode wrongly (the second segment's `E` lines resolve their author, tag, and source references against the first segment's dictionaries) and verify wrongly (the chain never restarts). Serving whole segments keeps every response a standalone, self-describing, independently verifiable NWFJ document.

It also keeps the server honest about work: a response is a file read, not a decode-and-re-encode. Re-encoding a delta would renumber the dictionary and break chain continuity with what the server actually stores, so the bytes on the wire are the bytes on disk.

The consequence a client must handle: **a `200` normally contains records at or before the cursor**, because the segment holding `cursor + 1` also holds everything before it in that segment. Clients drop records with `seq <= cursor` when merging. Appending them anyway is harmless, since the store dedupes by entry key, but the drop keeps the reported counts truthful.

A live hub appends to its newest segment while serving. Servers must therefore stream exactly the byte length the response's `NWF-Sync-Range` was measured from, so a body can never run past the range the same response declared. Clients should be forgiving in the same direction: a body ending **short** of the declared range is a truncated transfer and must abort the merge, but a body ending **past** it is a benign race, and those extra records are verified like any others.

## Cursors are per peer, not global

A sequence number is meaningful only inside one journal on one node. When node B appends entries pulled from node A, B's store assigns B's own sequence numbers and computes B's own chain: B is not a byte copy of A, it is a journal that happens to hold the same entries.

So a client must **not** compare its local head against a peer's head. It records the peer's cursor per `(peer url, journal id)`, by default in `~/.config/neurowire/peers-state.json`:

```json
{
  "version": 1,
  "peers": {
    "https://hub.example.com\tai": { "seq": 1284, "hash": "9f1c0f0b8ad0f0e3" }
  }
}
```

State is written **only after the append succeeds**. A crash between the pull and the write costs one re-pull, which the entry-key dedupe absorbs; the reverse order would silently lose entries.

### When a cursor stops meaning anything

A peer's journal can be rebuilt, restored from a backup, or have its store directory repointed. Its head then restarts low while the client still holds a cursor from the old one, and every sync answers "nothing new" forever with a clean exit code. That failure is silent, which makes it the worst kind.

Two signals catch it, and a client must check both against the recorded cursor:

- the peer's head is **lower** than the recorded `seq`, or
- the peer's head equals the recorded `seq` but its `hash` differs from the recorded one.

Either means this is not the journal the cursor points into. The client resets to `seq 0` and pulls again, which costs bandwidth and nothing else: the entry-key dedupe adds only what is genuinely new. The reset cursor must be written even when the rebuilt journal turns out to be empty, or the stale one survives to stall the next sync too.

## Merging is idempotent

The store drops entries whose [entry key](/reference/core#entrykey) it already holds. Three consequences fall out for free:

- Pulling the same delta twice adds nothing the second time.
- A node that peers with both A and B, where B already forwarded A's entries, stores one copy.
- A cycle of peers terminates instead of growing without bound.

`entry.source` travels inside the record, so provenance survives every hop: an entry that reached you through two relays still names the outlet that published it, not the peer it arrived through.

## Integrity

Every `200` body is a complete NWFJ segment with its own `C` checkpoint lines. A client runs `verifyJournal(text)` on the body **before** appending anything from it. A mismatch aborts that response's merge with a named error and appends nothing from it; segments already merged in the same pull stay merged, because each was verified on its own and the store's dedupe makes re-pulling them free.

A client should also reject a body whose `J` header names a different journal id than it asked for, and a body that carries entries but no checkpoint at all (a vacuous verification).

**The chain is a checksum, not a signature.** It uses core's FNV-1a `hashHex`, so it detects corruption, truncation, and reordering in transit or at rest. It does not prove who wrote the journal: anyone who edits a segment can recompute the chain. Nothing in `nwf-sync/1` authenticates content origin. You sync from peers you chose to trust, over TLS you terminate yourself.

The `J` version cell and this protocol's version header are the upgrade path: signed checkpoints are the designed-for v2 slot.

## Authentication

Optional and static. When the server has a token configured (`NEUROWIRE_SYNC_TOKEN`, or `token` in `~/.config/neurowire/sync.json`), every `/sync/*` request must present it:

```
Authorization: Bearer <token>
```

Anything else gets `401` with `WWW-Authenticate: Bearer`. The token is compared in constant time. When no token is configured the endpoints are open, which is the deliberate self-host stance: the operator owns transport security and network exposure, and Neurowire does not pretend to.

The auth check runs before the publish check, so an unauthenticated caller cannot use `404` versus `200` to enumerate which journals a node holds.

## Publishing

Nothing is published by default. A node exposes journals explicitly:

- `NEUROWIRE_SYNC_PUBLISH`: a `:`- or `,`-separated list of journal ids, or `*` for every journal in the store directory.
- `~/.config/neurowire/sync.json` (or `$NEUROWIRE_SYNC_CONFIG`):

```json
{ "publish": ["ai", "rust"], "token": "a-long-random-string" }
```

The env var wins over the file. Journals are read from the usual store directory (`$NEUROWIRE_JOURNAL`, else `~/.config/neurowire/journal`).

An unpublished id and a nonexistent id both answer `404` with the same body. The distinction is deliberately invisible: a node's journal list is exactly what it published.

## The handshake, end to end

```
B: GET /sync/head?journal=ai                -> { head: 1284 }
   local cursor for (A, ai) is 1284, stop.  one request, no body.

B: GET /sync/head?journal=ai                -> { head: 1310 }
B: GET /sync/since?journal=ai&cursor=1284   -> 200, segment 3, range 1201-1310, complete 1
   verify chain, drop seq <= 1284, append 26 entries, write cursor 1310.

B: GET /sync/since?journal=ai&cursor=12     -> 410 { snapshot: "/sync/snapshot?journal=ai" }
B: GET /sync/snapshot?journal=ai&cursor=0   -> 200, segment 1, complete 0
B: GET /sync/snapshot?journal=ai&cursor=800 -> 200, segment 2, complete 0
B: GET /sync/snapshot?journal=ai&cursor=1200-> 200, segment 3, complete 1
```

## Not in v1

- No push, no gossip, no peer discovery, no DHT. Peers are configured URLs.
- No signing or identity. The hash chain is integrity, not authenticity.
- No conflict resolution beyond the idempotent entry-key merge. Journals are append-only facts, so there is nothing to conflict.
- No quotas, rate limits, or abuse controls beyond the bearer token.
- No range within a segment. The unit of transfer is a segment, and retention is tuned with the store's segment size and compaction.

## See also

- [Sync](/concepts/sync), the concept: why delta exchange beats fan-out fetching, and the trust model.
- [NWFJ](./nwfj), the payload format.
- [Journals](/concepts/journals), the archive underneath it.
- [Federation](/guide/federation), the three-node setup guide.
- [`@neurowire/api`](/reference/api), the server reference.
- [`@neurowire/ingest`](/reference/ingest), the client reference.
