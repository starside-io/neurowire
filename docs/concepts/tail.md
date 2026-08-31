# Tail

A feed is a snapshot: whatever a source is showing right now. Everything in Neurowire can be used that way, one fetch at a time, and for most jobs that is the right shape. **Tail** is the other posture: keep the source open and be told what is new, the way `tail -f` follows a file.

Nothing about the data changes. A tail is the same canonical [model](/concepts/model), the same [taps](/concepts/taps), the same [meshes](/concepts/meshes) and [constructs](/concepts/constructs). What changes is who is waiting for whom.

## One engine, three surfaces

The polling loop lives in one place, [`pollFeed`](/reference/ingest#poll-engine) in `@neurowire/ingest`. Everything that follows a source consumes it, so none of them can drift on cadence, dedupe, or what happens when a fetch fails.

<figure class="nw-fig">
<div class="nw-fig__scroll">
<svg viewBox="0 0 820 316" role="img" aria-labelledby="tal-t tal-d" preserveAspectRatio="xMidYMid meet">
  <title id="tal-t">One poll engine behind three surfaces</title>
  <desc id="tal-d">A source is polled by a single pollFeed loop, which dedupes and emits only fresh entries. CLI tail, CLI watch, and the SSE route all consume that one loop, and the SSE route fans one upstream poll out to many connected clients.</desc>

  <rect class="nwd-box" x="16" y="118" width="150" height="66" rx="10" />
  <text class="nwd-title" x="91" y="145" text-anchor="middle">Source</text>
  <text class="nwd-sub" x="91" y="164" text-anchor="middle">feed, mesh</text>

  <path class="nwd-line" d="M166 151 H222" />
  <polygon class="nwd-head" points="230,151 222,146.5 222,155.5" />
  <text class="nwd-sub" x="196" y="142" text-anchor="middle">304</text>

  <rect class="nwd-box nwd-box--accent" x="230" y="104" width="196" height="94" rx="10" />
  <text class="nwd-title" x="328" y="132" text-anchor="middle">pollFeed</text>
  <text class="nwd-sub" x="328" y="151" text-anchor="middle">wait, load, dedupe</text>
  <text class="nwd-sub" x="328" y="168" text-anchor="middle">30s floor + jitter</text>
  <text class="nwd-sub nwd-accent" x="328" y="187" text-anchor="middle">yields fresh only</text>

  <path class="nwd-line nwd-line--accent" d="M426 151 H472 V47 H520" />
  <polygon class="nwd-head--accent" points="528,47 520,42.5 520,51.5" />
  <path class="nwd-line nwd-line--accent" d="M472 151 H520" />
  <polygon class="nwd-head--accent" points="528,151 520,146.5 520,155.5" />
  <path class="nwd-line nwd-line--accent" d="M472 151 V255 H520" />
  <polygon class="nwd-head--accent" points="528,255 520,250.5 520,259.5" />

  <rect class="nwd-box" x="528" y="18" width="276" height="58" rx="10" />
  <text class="nwd-title" x="546" y="42">neurowire tail</text>
  <text class="nwd-sub" x="546" y="61">one line per entry, or raw NWFJ</text>

  <rect class="nwd-box" x="528" y="122" width="276" height="58" rx="10" />
  <text class="nwd-title" x="546" y="146">neurowire --watch</text>
  <text class="nwd-sub" x="546" y="165">one feed per tick</text>

  <rect class="nwd-box" x="528" y="226" width="276" height="72" rx="10" />
  <text class="nwd-title" x="546" y="250">GET /tail</text>
  <text class="nwd-sub" x="546" y="269">server-sent events, one loop</text>
  <text class="nwd-sub" x="546" y="286">shared by every subscriber</text>
</svg>
</div>
<figcaption>One loop per source, whatever is watching it. On the API that sharing is literal: fifty clients following the same target cost one upstream fetch per tick, not fifty.</figcaption>
</figure>

| Surface | What it emits | Where |
|---------|---------------|-------|
| `neurowire tail` | one terminal line per entry as it arrives, or raw [NWFJ](/formats/nwfj) with `-f nwf` | [CLI tail mode](/guide/cli#tail-mode) |
| `neurowire --watch` | one feed per tick, in `--format`, containing only that tick's new entries | [CLI watch mode](/guide/cli#watch-mode) |
| `GET /tail` | server-sent events, one per entry, fanned out to every connected client | [HTTP API](/guide/http-api#get-tail) |

The engine itself is an async generator and owns no I/O. You hand it a `load` function (a `fetchFeed`, a `fetchMesh`, a whole filter pipeline) and it hands back the entries that are new:

```ts
import { fetchMesh, pollFeed } from '@neurowire/ingest'

for await (const { fresh } of pollFeed(() => fetchMesh(mesh), { intervalMs: 60_000 })) {
  for (const entry of fresh) console.log(entry.title, entry.link)
}
```

## What "new" means

New means "not in the seen-set", and the seen-set is keyed by `entryKey`: the entry's id, or its link when it has none. That is the same key [watch state](/guide/cli#watch-mode) and [journal dedupe](/concepts/journals) use, so the three agree by construction.

Two consequences worth knowing:

- **Order does not matter.** A source that reorders its front page, or backfills an old post, produces no noise. Only a key the loop has not reported before is new.
- **The first tick is not special.** It runs immediately, with an empty seen-set, so a fresh tail reports the whole front page and then goes quiet. Seed the set (`--state` on the CLI, a journal on the server) when you want a restart to pick up where it left off instead.

::: tip Shaping happens before dedupe
On the CLI, each tick fetches, then applies your `--filter`, `--since`, `--sort`, and `--limit` flags, and only then diffs against the seen-set. An entry that a filter excluded was never reported, so it is still new if a later tick lets it through. That is what makes `tail --mesh ai.json --filter tag:release` behave the way you would expect over hours.
:::

## Politeness is built in, not left to you

Following a source means asking for it repeatedly, so the loop is deliberately conservative:

| Guard | Value | Why |
|-------|-------|-----|
| Interval floor | 30s on the CLI, 60s on the API | A client cannot talk the loop into hammering an upstream. |
| Jitter | up to +10% of the interval, added, never subtracted | Many tails on one host stop arriving in lockstep. The interval stays a floor. |
| Conditional requests | `ETag` / `Last-Modified` per source | An unchanged source costs a `304` rather than a body. See [Fetching](/concepts/fetching). |
| Shared loops | one poll per distinct target on the API | Fifty browsers following `ai-news` cost one upstream fetch per tick, not fifty. |

Pick an interval that suits the source rather than the floor. A blog that posts weekly does not need a 30 second tail, and the floor is a safety rail, not a recommendation.

## A failed tick is not a failed tail

A long-running loop that dies on the first flaky response is not much use. `load` throwing is isolated to its tick: the error is reported, the loop waits, and the next tick tries again. That sits on top of the retry and backoff [fetching](/concepts/fetching) already does inside a single tick, so a transient upstream problem is usually handled before the loop ever sees it.

```
[tail] error: Upstream responded 503 Service Unavailable for https://example.com/feed.xml
```

Cancellation is explicit and immediate: an `AbortSignal` ends the generator between ticks and mid-sleep, which is how the API tears a loop down the moment its last subscriber disconnects.

## Composing with journals

A tail and a [journal](/concepts/journals) answer the two halves of the same question. The tail says what is arriving; the journal says what arrived. Put them together and a reader can drop off the wire without losing anything.

**A tail stream is a journal being written.** `tail -f nwf` does not invent a second streaming encoding: it emits NWFJ, the same append-only format the on-disk store writes, because that format is already designed to be appended to one entry at a time. The output is a complete document, header, dictionary growth, and checkpoints included, so anything that reads an archive reads the stream.

```bash
neurowire tail --mesh ai-news.json -f nwf > live.nwfj
```

**Cursors make resume lossless.** Give the API a journal that already exists and the route writes through it, so each event's SSE `id` is a real [cursor](/concepts/journals#cursors). A client that reconnects with `Last-Event-ID` is replayed everything after that cursor and then put back on the live stream:

```bash
curl -N "http://localhost:8787/tail?src=ai-news&journal=ai"
# ...connection drops at id 812, reconnect...
curl -N -H 'Last-Event-ID: 812' "http://localhost:8787/tail?src=ai-news&journal=ai"
```

Without a journal the tail is live-only: event ids are stream-local, resume has nothing to replay from, and the `init` event says so rather than pretending otherwise. The route never creates a journal of its own, so replay is something an operator turns on, not something a client can ask for.

## Tail, watch, or a plain fetch

| You want | Use | Because |
|----------|-----|---------|
| A feed, a file, a page, right now | a one-shot fetch | Nothing needs to stay running. Put it on cron if you want it repeated. |
| To see posts appear while you work | `neurowire tail` | Line-per-entry output, readable as it scrolls. |
| To pipe new entries into another tool | `neurowire tail -f nwf` | A stream of parseable records with no terminal formatting in it. |
| A batch of new entries per interval, serialized | `neurowire --watch -f json` | One feed document per tick is what a downstream script wants to parse. |
| To notify a channel | `--watch` or `tail` with `--sink` | Delivery of only the new entries. See [Sinks](/concepts/sinks). |
| To fan one source out to many readers | `GET /tail` | One upstream poll, many subscribers, resume for free with a journal. |

::: tip Cron is often the right answer
A tail holds a process open. If you only need a page rebuilt every morning or an archive topped up every hour, a one-shot fetch on a timer is simpler, survives reboots, and cannot leak a process. Reach for a tail when something is actually waiting on the output.
:::

## What tail is not

::: warning Not a delivery guarantee
The loop reports what a source is showing when it looks. A post that appears and is deleted between two ticks is never seen, and there is no acknowledgement, no redelivery, and no ordering promise beyond the order the source lists. Journal-backed resume closes the gap for a client that disconnects; it does not turn polling into a message queue.
:::

It is also polling by design. There is no WebSub or webhook ingestion, so nothing pushes to Neurowire, and there is no WebSocket transport: SSE covers the fan-out case over plain HTTP, through proxies, with reconnection already specified. Exchanging journal deltas between machines, so a second node pulls from a peer instead of re-fetching every upstream site, is [planned separately](https://github.com/starside-io/neurowire/blob/main/docs/plans/12-nwf-sync.md).

See [CLI tail mode](/guide/cli#tail-mode) for the flags, [`GET /tail`](/guide/http-api#get-tail) for the event stream, and the [poll engine reference](/reference/ingest#poll-engine) for the library API.
