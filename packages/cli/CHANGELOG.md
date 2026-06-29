# @neurowire/cli

## 0.8.0

- Add `--tap-pack <theme[,theme...]|all>`: register themes from the optional `@neurowire/taps-pack` catalog (repeatable). Prints an install hint if the package is absent.

## 0.7.0

- Add the `opml` subcommand: `neurowire opml export --mesh|--construct` and `neurowire opml import <file-or-url>`.
- `-f rss` now emits RSS 2.0 (via the new core format).

## 0.1.0

- Initial release: the `neurowire` bin with a terminal view, `--format`, `--out`, `--template`, `--mesh`, `--taps`, and the `validate` subcommand.
