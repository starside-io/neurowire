---
name: follow-feeds
description: Read news and updates from blogs, sites, RSS, Atom, meshes, and journals with the Neurowire MCP tools. Use when the user asks what shipped, what is new, for a digest of a topic, or to keep up with a set of sources over time.
---

# Following feeds with Neurowire

The `neurowire` MCP server turns any source into a clean feed. Every entry tool
opens its result with a one-line summary such as
`32 entries from 5 sources, newest 2026-08-25`. Read that line first and only
parse the body when you need the entries.

## Pick the right tool

| The user wants | Call |
|---|---|
| One blog, site, or feed URL | `ingest_source` |
| A named bundle of sources (`ai-news`, or a taps-pack theme key like `anime`) | `fetch_mesh` with `name` |
| A digest across several bundles (`daily`) | `fetch_construct` |
| Only some entries: a tag, a keyword, the last day | `query` with `include`, `since`, `today` |
| History, including entries that left the front page | `query_journal` |
| "Anything new since last time?" | `whats_new` |

Named meshes and constructs are listed as `neurowire://mesh/<name>` and
`neurowire://construct/<name>` resources, so check those before asking the user
for URLs.

## Keep results small

- Leave `format` at the default `nwf`. It is the most compact format. Ask for
  `json` only when you need structured fields, and `md` when showing entries to
  the user verbatim.
- Set `limit` to what you will actually use. The default is 30 and the cap is 200.
- Filter server side (`include: ["tag:release"]`, `since: "7d"`) rather than
  fetching everything and filtering yourself.

## Following a journal over time

`whats_new` is cursor based, not time based, so nothing is missed or repeated.

1. Call `whats_new` with the journal id. The result carries `cursor: <value>`.
2. Store that cursor (in memory, a note, or wherever this conversation keeps state).
3. Next time, pass it back. You get exactly the entries that arrived since, and a
   new cursor to store.
4. If the result says `more waiting`, call again straight away with the new cursor.

## When something fails

Errors are plain sentences. `no mesh named "x". Available: ...` lists the valid
names. `not in NEUROWIRE_MCP_ALLOW` means the operator restricted which hosts may
be fetched: tell the user, do not retry another way. For a question about how
Neurowire itself works, call `search_docs`.
