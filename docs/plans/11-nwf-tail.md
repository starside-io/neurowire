# Epic 11: `neurowire tail` (NWF as a live wire)

## Goal

Treat a feed, mesh, or construct as a **stream**, not a document: `tail -f` for
the web. One shared polling engine feeds three surfaces:

- **CLI**: `neurowire tail --mesh ai.json` prints entries as they appear,
  forever; `-f nwf` emits raw journal lines for piping into other tools.
- **API**: `GET /tail` is an SSE endpoint that pushes new entries to any
  connected client, with cursor-based resume via `Last-Event-ID`.
- **Journal replay** (Epic 9): `--since <cursor>` replays history first, then
  goes live, so a client that disconnects never misses entries.

The existing `--watch` loop ([index.ts:459](../../packages/cli/src/index.ts))
already proves the core loop (poll, dedupe via `partitionNew`, emit, sleep).
Tail is that loop promoted to a reusable engine with streaming output and
resume, instead of a CLI-private `for(;;)`.

## Design

### 1. Poll engine (`ingest/src/poll.ts`)

A reusable async generator, so every consumer gets the same semantics:

```ts
interface PollOptions {
  intervalMs: number          // default 5m, min clamp 30s
  jitter?: number             // 0..1 fraction of interval, default 0.1
  seen?: Iterable<string>     // resume the dedupe set
  signal?: AbortSignal
}

function pollFeed(load: () => Promise<NeurowireFeed>, opts: PollOptions):
  AsyncGenerator<{ fresh: NeurowireEntry[]; feed: NeurowireFeed; at: number }>
```

- Dedupe with `entryKey`/`newEntries` from core.
- Per-tick error isolation: a failed fetch logs and waits for the next tick
  (reusing ingest's fetch hardening for retry/backoff inside the tick).
- Jitter prevents thundering-herd polling when many tails target one host.
- The conditional cache (`createMemoryCache`) rides along so unchanged sources
  cost a 304, which is what makes tight intervals polite.

### 2. Incremental emission (core, via Epic 9)

Live output reuses the NWFJ encoder from Epic 9: `createJournalEncoder` already
emits self-contained appendable lines (intern-on-first-use dictionaries plus
`E` lines). Tail does not invent a second streaming encoding; a tail stream
**is** a journal being written in real time. Non-NWF consumers get JSON events
instead (one entry object per event).

### 3. API: `GET /tail` (SSE)

- Query: `url=` or `src=<named mesh>` or `construct=<name>` (same targets as
  the existing routes), `format=nwf|json` (default `json` for browser/EventSource
  friendliness), `interval=` (server-clamped, default 5m, floor 60s).
- Events:
  - `init`: feed identity + current head cursor
  - `entry`: one entry (JSON) or its journal lines (NWF), event `id` = cursor
  - `heartbeat`: comment ping every 25s so proxies keep the connection open
- Resume: `Last-Event-ID` (or `?since=<cursor>`) replays from the named
  journal when the operator enabled journaling for that source, otherwise
  starts live-only and the `init` event says so.
- One poll loop per distinct target shared across all subscribers of that
  target (a small registry keyed by target), so 50 clients on `ai-news` cost
  one upstream poll.
- Built on Hono's `streamSSE` helper; no new deps.

### 4. CLI: `neurowire tail`

- `neurowire tail <url> | --mesh m | --construct c`: pretty terminal lines
  (timestamp, source, title, link) as entries arrive; honors the existing
  filter/refine flags, which apply per tick like they do in watch.
- `-f nwf`: raw journal lines to stdout, nothing else, making
  `neurowire tail --mesh ai.json -f nwf | grep ...` a real pipeline.
- `--from <api-url>`: consume a remote `/tail` SSE stream instead of polling
  locally (a thin EventSource-over-fetch client in the CLI, no dep).
- `--journal <id>` appends everything seen, same flag as Epic 9.
- `--sink` works per tick exactly as in watch.
- `--watch` becomes a documented alias for `tail` with batch-style output;
  `runWatch` is reimplemented on the poll engine so there is one loop in the
  codebase, with unchanged flag behavior.

## Non-goals

- No WebSockets (SSE covers the fan-out case with plain HTTP).
- No server-side push ingestion (WebSub subscriber is a possible later epic;
  this one is polling-based by design).
- No persistence beyond the opt-in journal.
- No multi-node coordination (that is Epic 12).

## Dependencies

- **Soft on Epic 9**: live-only tail (CLI and API) works without journals;
  replay/resume (`--since`, `Last-Event-ID`) lights up when 9 lands. Build
  order 9 before 12 avoids shipping the degraded mode first.

## Files touched

| File | Change |
|------|--------|
| `packages/ingest/src/poll.ts` + test | new: poll engine (fake timers in tests) |
| `packages/ingest/src/index.ts` | export poll engine |
| `packages/api/src/tail.ts` + test | new: SSE route, shared-loop registry |
| `packages/api/src/app.ts` | mount `/tail` |
| `packages/cli/src/tail.ts` + test | new: pretty/raw renderers, SSE client, arg mapping |
| `packages/cli/src/index.ts` | `tail` subcommand; `runWatch` rebased on the poll engine |
| `docs/guide/cli.md`, `docs/guide/api.md` or `docs/reference/api.md` | tail docs |
| `README.md` | tail in the feature list |

## Steps

1. `ingest/src/poll.ts` with fake-timer tests (tick cadence, jitter bounds,
   dedupe across ticks, abort, error isolation).
2. Rebase `runWatch` on the engine; existing watch behavior is the regression
   suite (flags, state file, sinks unchanged).
3. CLI `tail` local mode (pretty + `-f nwf` via the Epic 9 encoder).
4. API `/tail` SSE with shared loops, heartbeat, clamps; tests with Hono's
   test client reading the stream.
5. Resume: journal replay on `?since=`/`Last-Event-ID`; CLI `--from` client.
6. Docs, changelog, `pnpm docs:build`.

## Tests

- Poll engine: N ticks under fake timers yield only fresh entries; a tick that
  throws does not kill the generator; abort ends it cleanly.
- Watch regression: previous watch tests pass unchanged on the new engine.
- SSE: connect, receive `init` + entries, event ids are valid cursors;
  two subscribers to one target trigger one upstream fetch per tick (spy on
  the fetch layer); heartbeat cadence; malformed target is a 400, not a stream.
- Resume: disconnect after entry k, reconnect with `Last-Event-ID`, receive
  exactly k+1..n (journal-backed fixture).
- CLI: raw mode output parses as valid NWFJ; `--from` client handles reconnect
  with backoff.

## Risks

- **Long-lived connections in tests.** Mitigate: fake timers everywhere, small
  intervals, AbortSignal plumbed end to end from day one.
- **Server poll registry leaks.** Mitigate: refcount subscribers, stop the loop
  when the last one disconnects; test that.
- **Polling politeness.** Interval floors (60s server, 30s CLI), jitter, and
  the conditional cache; document rate expectations per source.
- **SSE through buffering proxies.** Heartbeats plus documented
  `X-Accel-Buffering: no`; self-host doc (Epic 4) already owns proxy guidance.

## Acceptance

- `neurowire tail --mesh examples/ai.mesh.json` runs indefinitely, printing
  each new entry exactly once; `-f nwf` output is spec-valid NWFJ.
- `curl -N '.../tail?src=ai-news'` streams entries; dropping and reconnecting
  with `Last-Event-ID` (with journaling on) misses nothing.
- Watch flag behavior is byte-identical for existing invocations.
- Coverage thresholds hold; docs build passes.
