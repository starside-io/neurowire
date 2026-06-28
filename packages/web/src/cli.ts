import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ConstructSchema, MeshSchema, type NeurowireFeed } from '@neurowire/core'
import {
  createConfigMeshResolver,
  fetchConstruct,
  fetchFeed,
  fetchMesh,
  flattenConstruct,
} from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'
import { filterByCutoff, resolveCutoff } from './cli-helpers'
import { toConstructPages, toHtml } from './render'

const HELP = `neurowire-web - generate a self-contained HTML news page.

Usage:
  neurowire-web --mesh <file> [--out <file>]
  neurowire-web --construct <file> --out <dir> [--combined]
  neurowire-web <url> [--out <file>]

Options:
  -m, --mesh <file>       Build the page from a mesh (a JSON bundle of named sources).
  -c, --construct <file>  Build from a construct (a bundle of meshes). Writes a repo:
                          an index.html overview plus one page per mesh into --out (a dir).
      --combined          With --construct, write a single combined page instead, with
                          each entry tagged by the mesh it came from.
  -o, --out <file|dir>    Write output. A file for a feed/mesh/combined construct, a
                          directory for a multi-page construct (default: stdout).
  -s, --since <age>       Keep only entries published within this window (e.g. 24h, 36h, 7d).
                          Entries without a date are dropped.
      --today             Keep only entries published since 00:00 UTC today.
                          Entries without a date are dropped.
  -h, --help              Show this help.

A construct bundles many meshes. Members are inline meshes or references by name
(resolved from ~/.config/neurowire/meshes or NEUROWIRE_MESHES):
  { "name": "Daily", "meshes": ["ai-news", { "name": "Custom", "sources": [...] }] }

Examples:
  neurowire-web --mesh ai-news.json --out public/index.html
  neurowire-web --construct daily.json --out public/
  neurowire-web --construct daily.json --combined --out public/index.html
  neurowire-web https://blog.rust-lang.org/feed.xml --out rust.html
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      mesh: { type: 'string', short: 'm' },
      construct: { type: 'string', short: 'c' },
      combined: { type: 'boolean' },
      out: { type: 'string', short: 'o' },
      since: { type: 'string', short: 's' },
      today: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  if (values.help) {
    process.stdout.write(HELP)
    return
  }

  // Built-in taps so feed-less sources (e.g. claude.com, cursor.com) resolve.
  registerAllTaps()

  const window = resolveCutoff({ today: values.today, since: values.since })
  if (!window.ok) {
    process.stderr.write(`error: ${window.error}\n`)
    process.exitCode = 1
    return
  }
  const cutoff = window.cutoff

  // Construct: a bundle of meshes. Default to a multi-page repo; --combined makes
  // a single source-tagged page.
  if (values.construct) {
    const construct = ConstructSchema.parse(JSON.parse(readFileSync(values.construct, 'utf8')))
    const fetched = await fetchConstruct(construct, { resolver: createConfigMeshResolver() })

    if (values.combined) {
      let feed = flattenConstruct(fetched)
      if (cutoff !== undefined) feed = filterByCutoff(feed, cutoff)
      const html = toHtml(feed)
      if (values.out) {
        writeFileSync(values.out, html)
        process.stderr.write(`Wrote ${feed.entries.length} entries to ${values.out}\n`)
      } else {
        process.stdout.write(html)
      }
      return
    }

    if (!values.out) {
      process.stderr.write('error: --construct writes multiple files, so --out <dir> is required\n')
      process.stderr.write('       (or pass --combined to write a single page to stdout)\n')
      process.exitCode = 1
      return
    }
    const trimmed =
      cutoff === undefined
        ? fetched
        : {
            ...fetched,
            parts: fetched.parts.map((part) => ({
              ...part,
              feed: filterByCutoff(part.feed, cutoff),
            })),
          }
    mkdirSync(values.out, { recursive: true })
    const pages = toConstructPages(trimmed)
    for (const page of pages) writeFileSync(join(values.out, page.filename), page.html)
    process.stderr.write(`Wrote ${pages.length} pages to ${values.out}/\n`)
    return
  }

  let feed: NeurowireFeed
  if (values.mesh) {
    feed = await fetchMesh(MeshSchema.parse(JSON.parse(readFileSync(values.mesh, 'utf8'))))
  } else {
    const url = positionals[0]
    if (!url) {
      process.stderr.write('error: pass a feed/site URL, --mesh <file>, or --construct <file>\n\n')
      process.stderr.write(HELP)
      process.exitCode = 1
      return
    }
    feed = await fetchFeed(url)
  }

  if (cutoff !== undefined) {
    const before = feed.entries.length
    feed = filterByCutoff(feed, cutoff)
    const label = values.today ? 'today' : `the last ${values.since}`
    process.stderr.write(`Filtered to ${feed.entries.length} of ${before} entries from ${label}\n`)
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
