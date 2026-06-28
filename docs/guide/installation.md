# Installation

Neurowire is published as a set of scoped npm packages. Install only the ones you need for your use case.

## Requirements

- **Node >= 24.** Every package declares `engines.node: ">=24"`.
- **ESM only.** All packages are `"type": "module"`. Import them with `import`, not `require`.

## Published packages

| Package | Version | Role |
|---------|---------|------|
| `@neurowire/core` | 0.7.0 | Canonical model, serializers (NWF, atom, rss, json, md), `validateNwf`, `mergeFeeds`, mesh/construct types. Pure, no network. |
| `@neurowire/ingest` | 0.6.0 | Fetch + detect + parse, HTML auto-detect, the CSS-template engine, `fetchFeed`/`fetchMesh`/`fetchConstruct`. |
| `@neurowire/taps` | 0.3.0 | Curated per-host templates for feed-less sites plus loaders. |
| `@neurowire/cli` | 0.7.0 | The `neurowire` binary. |
| `@neurowire/web` | 0.5.0 | HTML page generator: `toHtml` plus the `neurowire-web` binary. |

::: tip Dependency direction
Dependencies flow strictly one way: `core` <- `ingest` <- `taps` <- (`cli`, `web`). Higher packages pull in everything below them, so you rarely install more than one for a given job.
:::

## Which package do I install?

### CLI users

Install the CLI globally and use the `neurowire` command. It bundles core, ingest, and taps.

::: code-group

```bash [pnpm]
pnpm add -g @neurowire/cli
```

```bash [npm]
npm install -g @neurowire/cli
```

:::

### Page generators

For self-contained HTML news pages, install the web package. It ships the `neurowire-web` binary and the `toHtml` / `toConstructHtml` / `toConstructPages` functions.

::: code-group

```bash [pnpm]
pnpm add -g @neurowire/web
```

```bash [npm]
npm install -g @neurowire/web
```

:::

### Library users

Add packages to your project as dependencies (not global). Most programmatic work needs `@neurowire/ingest` (which re-exports nothing from core, so add core too for the types and serializers):

::: code-group

```bash [pnpm]
pnpm add @neurowire/core @neurowire/ingest
```

```bash [npm]
npm install @neurowire/core @neurowire/ingest
```

:::

Add `@neurowire/taps` when you want curated recipes for feed-less sites (call `registerAllTaps()`), and `@neurowire/web` when you want HTML rendering:

::: code-group

```bash [pnpm]
pnpm add @neurowire/taps @neurowire/web
```

```bash [npm]
npm install @neurowire/taps @neurowire/web
```

:::

See [Library usage](/guide/library) for code examples.

## Verify the install

```bash
neurowire --version
```
