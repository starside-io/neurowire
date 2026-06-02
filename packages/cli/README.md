# @neurowire/cli

The `neurowire` command-line tool. Point it at any blog, website, RSS, or Atom feed and get back a terminal view or any of four formats: Atom, JSON Feed 1.1, Markdown, and nwf. Bundle many sources into one mesh.

## Install

```bash
npm install -g @neurowire/cli
# or run without installing
npx @neurowire/cli https://example.com/blog
```

## Usage

```
neurowire <url> [options]
neurowire --mesh <file> [options]
neurowire validate <file-or-url>
```

### Options

| Flag | Description |
|------|-------------|
| `-f, --format <fmt>` | Output format: `atom`, `json`, `md`, `nwf`. Omit for a terminal view. |
| `-o, --out <file>` | Write output to a file instead of stdout. |
| `-t, --template <file>` | Path to a JSON CSS-selector template for HTML pages. |
| `-m, --mesh <file>` | Fetch a mesh: a JSON bundle of named sources, merged into one feed. |
| `--taps <path>` | Load extra taps: a `.json` file or a directory. Repeatable. |
| `-h, --help` | Show help. |
| `-v, --version` | Show the version. |

### Examples

```bash
neurowire https://example.com/blog
neurowire https://example.com/feed.xml --format atom > feed.xml
neurowire --mesh ai-news.json --format atom
neurowire validate feed.nwf
```

## Taps

Taps teach Neurowire to read sites with no RSS or Atom feed. Add your own with `--taps`, the `NEUROWIRE_TAPS` env var (a path or `:`-separated list), or by dropping `*.json` files into `~/.config/neurowire/taps/`. See [`@neurowire/taps`](https://www.npmjs.com/package/@neurowire/taps).

## License

Apache-2.0
