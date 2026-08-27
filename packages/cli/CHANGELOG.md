# @neurowire/cli

## Unreleased

- Add `neurowire sync <peer-url>` and `neurowire sync --peers`: pull journal deltas from peers over `nwf-sync/1`. Reports what moved per journal and exits non-zero when any pull failed.
- Add the `peers` subcommand group: `peers list`, `peers add <url> [--token t] [--journal id]`, and `peers remove <url>`, managing `~/.config/neurowire/peers.json`.
- Add `--peers` and `--token` flags.

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
