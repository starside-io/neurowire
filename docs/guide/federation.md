# Federation

A feed is a snapshot of a front page. A [journal](/concepts/journals) is the archive behind it. **Federation** is what happens when one node keeps that archive and other nodes pull deltas from it instead of re-fetching every source themselves.

The wire protocol is [`nwf-sync/1`](/formats/nwf-sync): four read-only HTTP `GET`s, NWFJ segments as the payload. This guide builds the three-node topology from scratch using only documented commands.

## Why bother

Three devices following the same 200 sources make 600 requests a tick against those publishers, from three IPs that together look like a small scraping operation. Route them through one node and it is 200, with the devices pulling compact deltas.

That is the bandwidth argument. The one that actually matters is time. Open a laptop at 18:00 and a live fetch truthfully reports what those sites show *now*, which for a busy outlet may be the last three hours. Everything published while the lid was shut has scrolled off the page and no amount of fetching brings it back. A node that stayed awake recorded all of it, and the laptop asks for exactly the window it missed.

If you run one machine following twenty feeds, just fetch them. Sync earns its keep at device count, at intermittent connectivity, or when history matters.

## The topology

```
   the open web (200 sources)
             ▲
             │ fetches + journals
        ┌────┴────┐
        │ node A  │  always on, holds the taps, publishes /sync
        └──┬───┬──┘
     /sync │   │ /sync
           ▼   ▼
   ┌──────────┐  ┌──────────────┐
   │ laptop B │  │ node C       │  republishes /sync over the LAN
   └──────────┘  └──────┬───────┘
                        │ /sync
                        ▼
                  ┌──────────┐
                  │ node D   │  never touches the internet
                  └──────────┘
```

Peers are configured, not discovered. `A -> C -> D` is fine: D gets what C already pulled from A. Merging is idempotent by entry key, so a node peering with both A and C stores one copy, and a cycle terminates. `entry.source` travels inside the record, so provenance survives every hop.

## Node A: the hub

A fetches the open web and journals what it sees. Nothing here is new: it is the ordinary fetch path with `--journal`.

```bash
# One-shot, on a timer (cron, systemd, launchd):
neurowire --construct daily.json --journal ai

# Or keep it fresh in one long-running process:
neurowire --construct daily.json --journal ai --watch --interval 30m
```

Then publish that journal. Nothing is published by default, so this is an explicit act:

```bash
export NEUROWIRE_JOURNAL=/var/lib/neurowire/journal
export NEUROWIRE_SYNC_PUBLISH=ai
export NEUROWIRE_SYNC_TOKEN=$(openssl rand -hex 32)
neurowire-api
```

Or the same thing as a file, `~/.config/neurowire/sync.json`:

```json
{ "publish": ["ai"], "token": "a-long-random-string" }
```

Check it from the machine itself:

```bash
curl -s localhost:8787/sync/journals -H "Authorization: Bearer $NEUROWIRE_SYNC_TOKEN"
# {"version":1,"journals":[{"id":"ai","title":"Daily","head":1284,...}]}
```

::: warning The token is access control, not authentication of content
The bearer token decides who may read. The hash chain in the payload detects corruption. Neither proves who wrote an entry. You sync from peers you chose to trust, over TLS your own proxy terminates. See the [trust model](/formats/nwf-sync#integrity).
:::

Put A behind a reverse proxy with a real certificate. Neurowire serves plain HTTP and expects the operator to own transport security, the same [self-host stance](/guide/http-api) the rest of the API takes.

## Node B: the laptop

B never fetches the open web. It records A as a peer and pulls:

```bash
neurowire peers add https://hub.example.com --token a-long-random-string
neurowire peers list
# https://hub.example.com  (token, all journals)

neurowire sync --peers
# https://hub.example.com
#   ai: 1284 new, cursor 1284, 4 requests, 812.0 KB
# 1284 new entries from 1 peer (812.0 KB, 0 errors)
```

The first sync moves the archive. Every one after it moves a delta:

```bash
neurowire sync --peers
# https://hub.example.com
#   ai: 26 new, cursor 1310, 2 requests, 4.1 KB
```

And when nothing has changed, one request that returns a number:

```bash
neurowire sync --peers
# https://hub.example.com
#   ai: 0 new, cursor 1310, 1 request, 41 B
```

Peers live in `~/.config/neurowire/peers.json`; cursors live beside them in `peers-state.json`, keyed by peer and journal. A cursor is only ever written after the entries have landed, so a crash mid-sync costs one re-pull rather than a hole in the archive.

A one-shot pull, without registering anything:

```bash
neurowire sync https://hub.example.com --journal ai --token a-long-random-string
```

Put it on a timer, or run it when the lid opens:

```bash
*/15 * * * * neurowire sync --peers >> ~/.local/state/neurowire-sync.log 2>&1
```

### A synced journal is an ordinary journal

This is the payoff of the journal being the shared substrate. Nothing about reading a pulled archive is special:

```bash
neurowire journal head ai
neurowire journal cat ai -f json
neurowire journal query ai --filter tag:release --since 7d -f md
neurowire-web --mesh ai.json --out page.html
```

## Node C: a relay

C pulls from A and republishes what it now holds. It is node B plus the two lines that make it a server:

```bash
neurowire peers add https://hub.example.com --token a-long-random-string
neurowire sync --peers

export NEUROWIRE_SYNC_PUBLISH=ai
neurowire-api
```

C's journal is not a byte copy of A's. It holds the same entries, with C's own sequence numbers and its own chain, because C encoded them itself. That is why a cursor is only meaningful against the peer it came from, and why nothing compares a local head to a remote one.

## Node D: no internet at all

D peers with C over the LAN. Nothing in its configuration says the outside world exists:

```bash
neurowire peers add http://node-c.lan:8787
neurowire sync --peers
```

D gets everything A collected, one hop late. Add more hops and it keeps working: the entry-key dedupe means a diamond stores one copy, and a cycle simply stops adding.

## Operating it

**Retention.** A journal grows. `compact` drops the oldest segments:

```ts
import { openJournalStore } from '@neurowire/ingest'
openJournalStore().compact('ai', 12) // keep the newest 12 segments
```

A peer whose cursor pointed into a dropped segment gets `410 Gone` on its next pull and re-bootstraps from the snapshot automatically, reporting `bootstrapped from snapshot`. That is loud on purpose: retention is a decision, not something an archive should discover as a quiet hole.

**Verifying.** Every pulled response is chain-verified before a single entry is appended. A flipped byte aborts that response with a named error and merges nothing from it.

**Rotating the token.** Change `NEUROWIRE_SYNC_TOKEN` on A, restart, and update each peer with `neurowire peers add <url> --token <new>` (adding an existing URL replaces its entry).

**Debugging a pull.** The endpoints are plain `GET`s, so `curl` is a first-class client:

```bash
curl -si "https://hub.example.com/sync/head?journal=ai" -H 'Authorization: Bearer ...'
curl -s  "https://hub.example.com/sync/since?journal=ai&cursor=1284" -H 'Authorization: Bearer ...'
```

## What this is not

No push, no gossip, no discovery, no DHT. No signatures. No conflict resolution, because append-only facts have nothing to conflict over. The [non-goals](/formats/nwf-sync#not-in-v1) are a fence, not an oversight: pull federation gets to prove itself first.

## See also

- [`nwf-sync/1`](/formats/nwf-sync), the protocol.
- [NWFJ](/formats/nwfj), the payload format.
- [Journals](/concepts/journals), the concept.
- [CLI](/guide/cli#sync), the `sync` and `peers` commands.
- [`@neurowire/api`](/reference/api#sync-endpoints), the server reference.
