# Sync

A [journal](/concepts/journals) makes NWF a format you can append to. **Sync** makes it a protocol you can speak. One node fetches the open web and journals what it finds; other nodes ask it "what happened after position N" and get back exactly that.

Nothing about the payload is new. Journals already number every entry, checkpoint a hash chain, and answer "everything after this cursor" locally. Sync is that same question asked over HTTP, which is why the protocol is four read-only `GET`s and no more: [`nwf-sync/1`](/formats/nwf-sync). The interesting part was already built.

## Why not just fetch the sources directly?

The obvious objection: every machine can already run `fetchMesh` itself. Three cases answer it, and only the first is about bandwidth.

### A team following the same sources

Eight developers each running the same 200-source construct make 1,600 requests a tick against a couple of hundred publishers, from eight IPs that together look like a small scraping operation. Some of those hosts rate-limit. A few will eventually block. Every developer also keeps taps current locally, so a site redesign breaks eight times and gets fixed eight times.

Point them at one node instead and the publishers see 200 requests from one polite poller. The team reads one identical corpus rather than eight slightly different snapshots, and a broken [tap](/concepts/taps) is fixed once.

### The laptop that is closed all day

This is the case direct fetching **cannot** solve, at any request budget.

A feed is a snapshot of a front page. Open a laptop at 18:00 and a live fetch truthfully reports what those sites are showing *now*, which for a busy outlet may be the last three hours. Everything published while the lid was shut has already scrolled off. Fetching harder does not recover it, because the data is no longer on the page.

A node that stayed awake recorded every entry as it appeared. The laptop asks for `?cursor=<where I left off>` and gets the missed window, in order, with nothing duplicated. The archive is the point; sync is just how it travels.

### Research that has to be reproducible

Analyzing six months of coverage means every machine and every rerun must see the same corpus. Direct fetches give a different snapshot per machine and per hour, so a result cannot be checked by a colleague, or by yourself next week.

A synced journal is addressed by sequence number and chain-verified. Cite "journal `ai`, seq 1 to 48210, chain `9f1c...`" and anyone who syncs that journal reproduces the analysis exactly, then keeps pulling deltas as it grows. The too-old-cursor error matters here too: it makes retention an explicit, loud event rather than a hole an archive quietly develops.

## Cursors and the short-circuit

The steady state is one request that returns a number:

```
GET /sync/head?journal=ai   ->   { "head": 1284 }
```

A device on a train wakes up, asks a question worth about forty bytes, sees that its recorded cursor is already 1284, and goes back to sleep. Entries move only when the cursor is actually behind. That asymmetry is what makes polling on a short interval reasonable: being up to date is nearly free, so you can check often.

<figure class="nw-fig">
<div class="nw-fig__scroll">
<svg viewBox="0 0 820 300" role="img" aria-labelledby="syn-t syn-d" preserveAspectRatio="xMidYMid meet">
  <title id="syn-t">The three answers a peer can give</title>
  <desc id="syn-d">When the local cursor matches the peer head, one request ends the exchange. When it is behind, the peer returns the records after the cursor. When it predates retention, the peer answers 410 and the client re-bootstraps from a snapshot.</desc>

  <text class="nwd-cap" x="16" y="20">Peer B asks</text>
  <text class="nwd-cap" x="470" y="20">Node A answers</text>

  <rect class="nwd-box" x="16" y="34" width="230" height="62" rx="10" />
  <text class="nwd-title" x="34" y="60">Up to date</text>
  <text class="nwd-sub" x="34" y="79">cursor 1284, head 1284</text>

  <path class="nwd-line" d="M246 65 H462" />
  <polygon class="nwd-head" points="470,65 462,60.5 462,69.5" />
  <text class="nwd-sub" x="354" y="56" text-anchor="middle">/sync/head</text>

  <rect class="nwd-box" x="470" y="34" width="334" height="62" rx="10" />
  <text class="nwd-title" x="488" y="60">Stop. One request, no body.</text>
  <text class="nwd-sub" x="488" y="79">about 40 bytes on the wire</text>

  <rect class="nwd-box" x="16" y="120" width="230" height="62" rx="10" />
  <text class="nwd-title" x="34" y="146">Behind</text>
  <text class="nwd-sub" x="34" y="165">cursor 1201, head 1284</text>

  <path class="nwd-line nwd-line--accent" d="M246 151 H462" />
  <polygon class="nwd-head--accent" points="470,151 462,146.5 462,155.5" />
  <text class="nwd-sub nwd-accent" x="354" y="142" text-anchor="middle">/sync/since</text>

  <rect class="nwd-box nwd-box--accent" x="470" y="120" width="334" height="62" rx="10" />
  <text class="nwd-title" x="488" y="146">One NWFJ segment after 1201</text>
  <text class="nwd-sub" x="488" y="165">verify the chain, append, cursor 1284</text>

  <rect class="nwd-box" x="16" y="206" width="230" height="62" rx="10" />
  <text class="nwd-title" x="34" y="232">Older than retention</text>
  <text class="nwd-sub" x="34" y="251">cursor 12, compacted away</text>

  <path class="nwd-line nwd-line--dash" d="M246 237 H462" />
  <polygon class="nwd-head" points="470,237 462,232.5 462,241.5" />
  <text class="nwd-sub" x="354" y="228" text-anchor="middle">/sync/since</text>

  <rect class="nwd-box nwd-box--ghost" x="470" y="206" width="334" height="62" rx="10" />
  <text class="nwd-title" x="488" y="232">410 Gone, pointing at /sync/snapshot</text>
  <text class="nwd-sub" x="488" y="251">bootstrap, then dedupe by entry key</text>
</svg>
</div>
<figcaption>Being up to date is nearly free, so a short polling interval stays reasonable. A cursor the peer can no longer serve fails loudly rather than returning a partial answer.</figcaption>
</figure>

### A cursor belongs to one peer

A sequence number is meaningful only inside one journal on one node. When node B appends entries pulled from node A, B's store assigns **B's** numbering and computes **B's** chain. B is not a byte copy of A; it is a journal that happens to hold the same entries.

So a client never compares its local head against a peer's. It records the peer's cursor per `(peer url, journal id)`, and it writes that cursor only after the entries have actually landed. A crash in between costs one re-pull, which the dedupe absorbs. The reverse order would silently lose entries, which is the failure you would never notice.

::: tip A cursor can also stop meaning anything
A peer's journal can be rebuilt, restored from a backup, or have its directory repointed. Its head then restarts low while your cursor still sits past it. Left alone, every later sync would report "0 new" forever with a clean exit code, which is the worst kind of failure: silent and successful-looking. A head that moved backwards, or a chain hash that disagrees at the recorded position, is treated as divergence, and the cursor resets.
:::

## Merging cannot go wrong

Entries are deduplicated by [entry key](/reference/core#entrykey) on append, the same rule that makes `--journal` safe to run on a timer. Three properties fall out of that one mechanism:

- Pulling the same delta twice adds nothing the second time.
- A node peering with both A and B, where B already forwarded A's entries, stores one copy.
- A cycle of peers terminates instead of growing without bound.

Which means topology is configuration, not code. `A -> B -> C` works: C gets what B already pulled from A. A diamond works. A relay that never touches the internet, pulling from a node on the LAN, works. Nobody has to design the graph carefully, because there is no arrangement of peers that produces duplicates or a loop.

Provenance survives every hop too. `entry.source` travels inside the record, so a story that reached you through two relays still names the outlet that published it, not the peer it arrived through.

## The trust model, stated plainly

Two mechanisms, and they protect against different things. Neither is a signature.

| | What it does | What it does not do |
|---|---|---|
| **Hash chain** | detects corruption, truncation, and reordering of a journal, in transit or at rest | prove who wrote an entry: anyone who edits a journal recomputes the chain |
| **Bearer token** | decides who may read a node's journals | say anything about the content behind it |

Every pulled response is chain-verified **before** a single entry is appended, so a flipped byte aborts that response and merges nothing from it. That is a real guarantee, and it is a guarantee about damage, not about authorship.

::: warning Nothing here authenticates content origin
`nwf-sync/1` does not sign anything. A peer that wants to hand you fabricated entries can, and the chain will verify perfectly, because the peer computed it. **You sync from peers you chose to trust**, over TLS you terminate yourself. Signed checkpoints are the designed-for v2 slot: the protocol carries a version header and NWFJ carries a version cell precisely so that upgrade has somewhere to go.
:::

The same reasoning that keeps the chain non-cryptographic in [journals](/concepts/journals#the-chain) applies here: it uses core's FNV-1a hash so `@neurowire/core` stays portable and free of `node:crypto`. Sync inherits that property rather than working around it.

## Retention is a decision, not an accident

Journals grow, and compaction drops whole old segments. A peer whose cursor pointed into a dropped segment does not get a partial answer: it gets a `410 Gone` naming the oldest entry still retained, and re-bootstraps from a snapshot of what the node still keeps.

That is deliberately loud. A quiet fallback would let an archive develop holes that nobody discovers until someone tries to reproduce a result. The bootstrap costs one full transfer per peer and is then over, and the dedupe means the overlap adds nothing.

## Publishing is opt-in

Nothing is exposed unless you say so. A node names the journal ids it publishes, and an unpublished id answers exactly the same `404` as one that does not exist, so a node's journal list is precisely what it published and no more.

This matches the shape of the rest of Neurowire: journaling is opt-in, taps are explicit, meshes are files you wrote. Sync adds an operational dependency (a node someone has to run), so it asks to be turned on rather than assuming.

## When sync is the wrong tool

One machine following twenty feeds should just fetch them. Sync earns its keep at **device count**, at **intermittent connectivity**, or when **history matters**, and is overhead otherwise.

It is also not a general replacement for fetching. Somebody still has to be the node that talks to the open web, holds the taps, and notices when a site redesign breaks one. Sync moves that work to one place; it does not remove it.

## What sync is not

- **Not push, gossip, or discovery.** Peers are configured URLs. No DHT, no broadcast, no automatic mesh formation.
- **Not a conflict resolver.** Journals are append-only facts, so there is nothing to conflict over. There is no merge strategy to choose because no two nodes can disagree about what already happened.
- **Not identity.** See [the trust model](#the-trust-model-stated-plainly).
- **Not a new format.** The payload is [NWFJ](/formats/nwfj) segments exactly as they sit on disk. A synced journal is an ordinary journal: `journal cat`, `journal query`, mesh rendering, and the page generator all consume it with no new code.

## Next

- [Federation](/guide/federation): build the three-node topology from scratch.
- [`nwf-sync/1`](/formats/nwf-sync): the wire protocol, endpoint by endpoint.
- [CLI sync and peers](/guide/cli#sync): the day-to-day commands.
- [Journals](/concepts/journals): the archive underneath all of this.
