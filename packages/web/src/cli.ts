import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { MeshSchema, type NeurowireFeed } from '@neurowire/core'
import { fetchFeed, fetchMesh } from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'
import { toHtml } from './render'

const HELP = `neurowire-web - generate a self-contained HTML news page.

Usage:
  neurowire-web --mesh <file> [--out <file>]
  neurowire-web <url> [--out <file>]

Options:
  -m, --mesh <file>  Build the page from a mesh (a JSON bundle of named sources).
  -o, --out <file>   Write the HTML to a file (default: stdout).
  -s, --since <age>  Keep only entries published within this window (e.g. 24h, 36h, 7d).
                     Entries without a date are dropped.
  -h, --help         Show this help.

Examples:
  neurowire-web --mesh ai-news.json --out public/index.html
  neurowire-web --mesh ai-news.json --since 24h --out public/index.html
  neurowire-web https://blog.rust-lang.org/feed.xml --out rust.html
`

/** Parse a window like "24h", "90m", or "7d" into milliseconds. */
function parseDuration(value: string): number | undefined {
  const match = /^(\d+)\s*([mhd])$/.exec(value.trim())
  if (!match) return undefined
  const amount = Number(match[1])
  const unitMs = match[2] === 'm' ? 60_000 : match[2] === 'h' ? 3_600_000 : 86_400_000
  return amount * unitMs
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      mesh: { type: 'string', short: 'm' },
      out: { type: 'string', short: 'o' },
      since: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    process.stdout.write(HELP)
    return
  }

  // Built-in taps so feed-less sources (e.g. claude.com, cursor.com) resolve.
  registerAllTaps()

  let feed: NeurowireFeed
  if (values.mesh) {
    feed = await fetchMesh(MeshSchema.parse(JSON.parse(readFileSync(values.mesh, 'utf8'))))
  } else {
    const url = positionals[0]
    if (!url) {
      process.stderr.write('error: pass a feed/site URL or --mesh <file>\n\n')
      process.stderr.write(HELP)
      process.exitCode = 1
      return
    }
    feed = await fetchFeed(url)
  }

  if (values.since !== undefined) {
    const windowMs = parseDuration(values.since)
    if (windowMs === undefined) {
      process.stderr.write(`error: invalid --since "${values.since}" (use e.g. 24h, 36h, 7d)\n`)
      process.exitCode = 1
      return
    }
    const cutoff = Date.now() - windowMs
    const kept = feed.entries.filter((entry) => {
      const when = Date.parse(entry.published ?? entry.updated ?? '')
      return !Number.isNaN(when) && when >= cutoff
    })
    process.stderr.write(
      `Filtered to ${kept.length} of ${feed.entries.length} entries from the last ${values.since}\n`,
    )
    feed = { ...feed, entries: kept }
  }

  const html = toHtml(feed)
  if (values.out) {
    writeFileSync(values.out, html)
    process.stderr.write(`Wrote ${feed.entries.length} entries to ${values.out}\n`)
  } else {
    process.stdout.write(html)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
