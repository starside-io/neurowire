import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type FeedTemplate, FeedTemplateSchema, registerTemplate } from '@neurowire/ingest'
import { claudeBlog } from './sites/claude'
import { cursorBlog } from './sites/cursor'

/**
 * A "tap": a per-host {@link FeedTemplate} of CSS selectors that wiretaps a site
 * with no RSS/Atom feed and turns its listing page into a Neurowire feed.
 */
export type Tap = FeedTemplate

/** Taps bundled with Neurowire by default. */
export const taps: Tap[] = [claudeBlog, cursorBlog]

/** Register the bundled taps with the ingest registry. Safe to call repeatedly. */
export function registerTaps(): void {
  for (const tap of taps) registerTemplate(tap)
}

/** Load taps from a JSON file, or from every `*.json` file in a directory. Each is validated. */
export function loadTaps(pathOrDir: string): Tap[] {
  const files = statSync(pathOrDir).isDirectory()
    ? readdirSync(pathOrDir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => join(pathOrDir, name))
    : [pathOrDir]

  const loaded: Tap[] = []
  for (const file of files) {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const items: unknown[] = Array.isArray(data) ? data : [data]
    for (const item of items) loaded.push(FeedTemplateSchema.parse(item))
  }
  return loaded
}

/** Load taps from a path (file or directory) and register them. Returns what was registered. */
export function registerTapsFrom(pathOrDir: string): Tap[] {
  const loaded = loadTaps(pathOrDir)
  for (const tap of loaded) registerTemplate(tap)
  return loaded
}

/** Default drop-in directory for user taps: `$XDG_CONFIG_HOME/neurowire/taps` (or `~/.config/...`). */
export function defaultTapsDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'neurowire', 'taps')
}

/**
 * Register the built-in taps, then user taps from (in order) the default drop-in
 * directory, the `NEUROWIRE_TAPS` env var (a path, or a `:`/`,`-separated list),
 * and any `extraPaths` (e.g. CLI `--taps`). Later sources win on host collision.
 *
 * A missing default directory is ignored; an explicitly requested path that is
 * missing or invalid throws. Returns the user taps that were registered.
 */
export function registerAllTaps(extraPaths: string[] = []): { user: Tap[] } {
  registerTaps()

  const user: Tap[] = []
  const dir = defaultTapsDir()
  if (existsSync(dir)) user.push(...registerTapsFrom(dir))

  const fromEnv = (process.env.NEUROWIRE_TAPS ?? '')
    .split(/[:,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  for (const source of [...fromEnv, ...extraPaths]) {
    user.push(...registerTapsFrom(source))
  }
  return { user }
}

export { claudeBlog } from './sites/claude'
export { cursorBlog } from './sites/cursor'
