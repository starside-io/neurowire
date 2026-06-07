import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Construct, ConstructSchema } from '@neurowire/core'

/** Built-in constructs, so `?src=daily` works with no setup. */
const BUNDLED: Record<string, Construct> = {
  daily: {
    name: 'Daily Brief',
    meshes: [
      {
        name: 'Models',
        sources: [
          { name: 'Claude Blog', url: 'https://claude.com/blog' },
          { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
        ],
      },
      {
        name: 'Releases',
        sources: [
          {
            name: 'Claude Code Releases',
            url: 'https://github.com/anthropics/claude-code/releases.atom',
          },
        ],
      },
    ],
  },
}

function constructDirs(): string[] {
  const dirs = (process.env.NEUROWIRE_CONSTRUCTS ?? '')
    .split(/[:,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  dirs.push(
    join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'neurowire', 'constructs'),
  )
  return dirs
}

/**
 * Resolve a named construct: user construct directories first
 * (NEUROWIRE_CONSTRUCTS, then ~/.config/neurowire/constructs), then the bundled
 * defaults. Names are simple identifiers; anything path-like is rejected.
 */
export function resolveConstruct(name: string): Construct | undefined {
  if (!/^[\w.-]+$/.test(name) || name.includes('..')) return undefined
  for (const dir of constructDirs()) {
    for (const file of [`${name}.construct.json`, `${name}.json`]) {
      const path = join(dir, file)
      if (existsSync(path)) return ConstructSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    }
  }
  return BUNDLED[name]
}

/** Names of all available constructs (bundled plus any in the construct directories). */
export function listConstructNames(): string[] {
  const names = new Set(Object.keys(BUNDLED))
  for (const dir of constructDirs()) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      const match = file.match(/^(.+?)(?:\.construct)?\.json$/)
      if (match?.[1]) names.add(match[1])
    }
  }
  return [...names].sort()
}
