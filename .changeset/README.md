# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). It records intended version bumps and changelog entries for the `@neurowire/*` packages.

The `@neurowire/*` packages are versioned in lockstep (see the `fixed` group in `config.json`), so any change releases them all at the same version.

## Workflow

```bash
# 1. Describe a change (pick the bump level, write a summary).
pnpm changeset

# 2. Apply pending changesets: bump versions and update each CHANGELOG.md.
pnpm version-packages

# 3. Build and publish to npm (requires the `neurowire` npm org and a publish token).
pnpm release
```

`pnpm release` runs `pnpm build` first, then `changeset publish`, which rewrites the `workspace:*` ranges to real versions and publishes in dependency order with public access.
