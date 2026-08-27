# @neurowire/cli

## Unreleased

- Add `neurowire tail [url]`: follow a feed, mesh, or construct as a live stream, printing each new entry as it arrives. Honors the filter, window, sort, and limit flags per tick, plus `--interval`, `--state`, `--journal`, and `--sink`.
- `tail -f nwf` streams raw NWFJ journal lines (header and checkpoints included), so `neurowire tail --mesh ai.json -f nwf | grep ...` is a real pipeline. Other `-f` values serialize each tick's new entries.
- Add `tail --from <api-url>`: render a remote `GET /tail` SSE stream, reconnecting with exponential backoff and resuming from the last event id.
- `--watch` is now implemented on ingest's poll engine, so there is one loop in the codebase. Flags, state file, journaling, and sinks are unchanged, with two additions: `--interval` accepts seconds (`30s`) and is clamped to a 30 second floor, and a failed fetch now prints `[watch] error: ...` and retries on the next tick instead of ending the run.

## 0.9.0

- Add `--journal <id>` and `--journal-dir <dir>`: append fetched entries to an append-only journal, on the normal fetch path and on every `--watch` tick. Duplicates are dropped.
- Add the `journal` subcommand group: `journal head <id>`, `journal cat <id> [--cursor <n>]`, and `journal query <id>`, the last accepting the same filter, window, sort, and limit flags as the fetch path.

## 0.8.0

- Add `--tap-pack <theme[,theme...]|all>`: register themes from the optional `@neurowire/taps-pack` catalog (repeatable). Prints an install hint if the package is absent.

## 0.7.0

- Add the `opml` subcommand: `neurowire opml export --mesh|--construct` and `neurowire opml import <file-or-url>`.
- `-f rss` now emits RSS 2.0 (via the new core format).

## 0.1.0

- Initial release: the `neurowire` bin with a terminal view, `--format`, `--out`, `--template`, `--mesh`, `--taps`, and the `validate` subcommand.
