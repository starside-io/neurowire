# Sinks

A **sink** delivers a feed's entries somewhere: a Slack channel, a Discord channel, or any generic endpoint that accepts a JSON Feed. Where the rest of Neurowire reads sources, a sink writes results.

Sinks are an I/O and delivery concern, so they live in the CLI, not the pure library: [`packages/cli/src/sinks.ts`](https://github.com/neurowire/neurowire). They pair naturally with the CLI's watch mode (see [CLI](/guide/cli)), which re-fetches on an interval and pushes only newly-seen entries to a sink.

## Auto-detection by host

You give a sink a destination URL; the kind is detected from its host (`sinkKind(url)`):

| Host contains | Sink kind |
|---------------|-----------|
| `slack.com` | `slack` |
| `discord.com` or `discordapp.com` | `discord` |
| anything else | `webhook` |

There is no flag to set the kind; the URL decides.

## Payload per sink

### Slack

Slack incoming-webhook body: a single `text` field. The text is a header line (`<feed title>: <N> new`) followed by up to 10 bullet lines, one per entry as `• <title> - <link>`, with an overflow line (`…and N more`) when there are more.

```json
{ "text": "AI News: 3 new\n• Title one - https://...\n• Title two - https://..." }
```

The title-to-link separator is a hyphen with spaces, never an em-dash.

### Discord

Discord webhook body: a single `content` field built from the same header-and-bullets text, then **capped at Discord's 2000-character limit** (truncated if longer).

```json
{ "content": "AI News: 3 new\n• Title one - https://..." }
```

### Generic webhook

A generic webhook gets the full [JSON Feed 1.1](/formats/json-feed) of the entries as the request body, sent with `Content-Type: application/feed+json`.

## `deliver(url, feed)`

The one entry point. It picks the kind, builds the right body and content type, and POSTs:

```ts
import { deliver } from '@neurowire/cli'

const ok = await deliver('https://hooks.slack.com/services/...', feed)
```

`deliver` returns a `boolean` and **never throws**: a non-2xx response or a network error writes a one-line warning to stderr (`[sink] <host> failed: ...`) and returns `false`. That makes it safe to call from a long-running watch loop without a failed delivery crashing the process.

## No built-in retry or dedup

::: warning
A sink fires once per call. It has **no built-in retry** and **no deduplication**. A transient failure is logged and dropped; it is not retried.
:::

Deduplication is the watch loop's job, not the sink's. Use the CLI's `--state` flag with watch mode so each tick delivers only entries not seen on a previous tick. Without it, a watch run would re-deliver the whole feed every interval.

See [CLI watch mode](/guide/cli) for wiring a source, an interval, `--state`, and one or more sinks together.
