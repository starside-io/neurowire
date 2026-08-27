# @neurowire/cli

## Unreleased

- Add `tap wizard <url>`: author a tap step by step. Each step shows ranked candidate selectors, a live match count, and a sample of what the current pick extracts. Type a number to accept, paste a selector to override, press Enter to skip an optional field. `--yes` takes every top candidate non-interactively, `-o <file>` picks where the tap lands (default `~/.config/neurowire/taps/<host>.json`). Nothing is written unless the template passes verification.
- Add `tap check [path] [--all] [--json] [--url <page>]`: do registered taps still match their pages? Reports healthy / degraded / broken / unknown and exits 1 on any broken tap, so it belongs in CI. A tap file may carry an optional `url` hint naming the listing page to check; a tap that names no page is reported `unknown` rather than guessed at, since fetching `https://<host>/` for a tap written against `<host>/blog` would call a healthy tap broken.
- Add `tap heal <path> [--yes]`: re-author a broken tap against the page as it stands today. Fields that still match are kept, only the broken ones are walked, and the previous file is kept as `<path>.bak` (once, so a second heal cannot bury the original). A tap under `node_modules` is printed rather than written.
- `tap doctor` is unchanged.

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
