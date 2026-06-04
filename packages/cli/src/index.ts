import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  FORMATS,
  MeshSchema,
  type NeurowireFeed,
  type SelectOptions,
  type SortKey,
  type SortOrder,
  type WindowSpec,
  isFormat,
  parseDuration,
  resolveWindow,
  selectEntries,
  serialize,
  validateNwf,
} from '@neurowire/core'
import { type FeedTemplate, FeedTemplateSchema, fetchFeed, fetchMesh } from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'

const VERSION = '0.3.0'

const SORT_KEYS: readonly SortKey[] = ['date', 'title', 'source']
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc']

const HELP = `Neurowire ${VERSION} - turn any blog or feed into Atom and friends.

Usage:
  neurowire <url> [options]
  neurowire --mesh <file> [options]
  neurowire validate <file-or-url>

Options:
  -f, --format <fmt>     Output format: ${FORMATS.join(', ')}. Omit for a terminal view.
  -o, --out <file>       Write output to a file instead of stdout.
  -t, --template <file>  Path to a JSON CSS-selector template for HTML pages.
  -m, --mesh <file>      Fetch a mesh: a JSON bundle of named sources, merged into one feed.
      --taps <path>      Load extra taps: a .json file or a directory. Repeatable.
  -h, --help             Show this help.
  -v, --version          Show the version.

Shape the output (applied before --format):
      --sort <key>       Sort by date, title, or source.
      --order <dir>      asc or desc (default: newest-first for date, A-Z otherwise).
  -n, --limit <n>        Keep at most n entries. Handy for integrations: --limit 10.
      --since <age>      Keep entries within this window, e.g. 24h, 90m, 7d.
      --max-age <age>    Drop entries older than this (same window as --since).
      --today            Keep entries since midnight UTC today.
      --this-week        Keep entries since Monday midnight UTC.
      --between <a>..<b> Keep entries between two dates, e.g. 2026-01-01..2026-02-01.

Commands:
  validate <file-or-url> Check that an nwf document is well-formed (exits non-zero if not).

A mesh bundles many sources into one feed:
  { "name": "AI News", "sources": [{ "name": "...", "url": "..." }] }

Taps teach Neurowire to read sites with no RSS/Atom feed. Add your own with
--taps, the NEUROWIRE_TAPS env var (a path or ':'-separated list), or by dropping
*.json files into ~/.config/neurowire/taps/.

Examples:
  neurowire https://example.com/blog
  neurowire https://example.com/feed.xml --format atom > feed.xml
  neurowire --mesh ai-news.json --format json --limit 10
  neurowire --mesh ai-news.json --since 24h --sort date --format atom
  neurowire validate feed.nwf
`

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = paint('1')
const dim = paint('2')
const red = paint('31')
const cyan = paint('36')
const green = paint('32')
const yellow = paint('33')
const magenta = paint('35')

const day = (iso: string | undefined): string => (iso ? iso.slice(0, 10) : '')

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean
}

/** Read input from a file path or an http(s) URL. */
async function readInput(input: string): Promise<string> {
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
    return res.text()
  }
  return readFileSync(input, 'utf8')
}

async function runValidate(input: string | undefined): Promise<void> {
  if (!input) {
    process.stderr.write(
      'error: validate needs a path or URL\n\nUsage: neurowire validate <file-or-url>\n',
    )
    process.exitCode = 1
    return
  }

  const result = validateNwf(await readInput(input))

  for (const issue of result.warnings) {
    process.stderr.write(`${yellow('warning')} ${dim(`line ${issue.line}`)}: ${issue.message}\n`)
  }
  for (const issue of result.errors) {
    process.stderr.write(`${red('error')} ${dim(`line ${issue.line}`)}: ${issue.message}\n`)
  }

  if (result.valid && result.feed) {
    const feed = result.feed
    process.stdout.write(`${green('✓')} valid nwf\n`)
    process.stdout.write(
      dim(`  ${feed.title}  ·  ${feed.entries.length} entries  ·  updated ${day(feed.updated)}\n`),
    )
  } else {
    const count = result.errors.length
    process.stdout.write(`${red('✗')} invalid nwf: ${count} error${count === 1 ? '' : 's'}\n`)
    process.exitCode = 1
  }
}

type CliValues = Record<string, string | string[] | boolean | undefined>

/**
 * Apply the --sort/--order/--limit and time-window flags to a feed. Returns the
 * refined feed, or undefined after writing an error and setting a non-zero exit
 * code when a flag value is invalid.
 */
function refineFeed(feed: NeurowireFeed, values: CliValues): NeurowireFeed | undefined {
  const fail = (message: string): undefined => {
    process.stderr.write(`error: ${message}\n`)
    process.exitCode = 1
    return undefined
  }

  const sort = values.sort as string | undefined
  if (sort !== undefined && !SORT_KEYS.includes(sort as SortKey)) {
    return fail(`unknown --sort "${sort}". Use one of: ${SORT_KEYS.join(', ')}`)
  }
  const order = values.order as string | undefined
  if (order !== undefined && !SORT_ORDERS.includes(order as SortOrder)) {
    return fail(`unknown --order "${order}". Use asc or desc`)
  }

  let limit: number | undefined
  if (values.limit !== undefined) {
    limit = Number(values.limit)
    if (!Number.isInteger(limit) || limit < 0) {
      return fail(`--limit must be a non-negative integer (got "${values.limit as string}")`)
    }
  }

  const spec: WindowSpec = {}
  if (typeof values.since === 'string') spec.since = values.since
  if (typeof values['max-age'] === 'string') spec.maxAge = values['max-age']
  if (values.today) spec.today = true
  if (values['this-week']) spec.thisWeek = true
  if (typeof values.between === 'string') {
    const parts = values.between.split('..')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return fail('--between expects <start>..<end>, e.g. 2026-01-01..2026-02-01')
    }
    spec.between = [parts[0], parts[1]]
  }

  for (const [flag, value] of [
    ['--since', spec.since],
    ['--max-age', spec.maxAge],
  ] as const) {
    if (value !== undefined && parseDuration(value) === undefined) {
      return fail(`invalid ${flag} "${value}" (use e.g. 24h, 90m, 7d)`)
    }
  }
  if (spec.between) {
    const [a, b] = spec.between
    if (Number.isNaN(Date.parse(a)) || Number.isNaN(Date.parse(b))) {
      return fail('--between needs two parseable dates, e.g. 2026-01-01..2026-02-01')
    }
  }

  const window = resolveWindow(spec, Date.now())
  const opts: SelectOptions = {
    ...window,
    sort: sort as SortKey | undefined,
    order: order as SortOrder | undefined,
    limit,
  }
  const before = feed.entries.length
  const refined = selectEntries(feed, opts)
  if (refined.entries.length !== before) {
    process.stderr.write(`Refined to ${refined.entries.length} of ${before} entries\n`)
  }
  return refined
}

function renderTerminal(feed: NeurowireFeed): void {
  const out: string[] = [bold(cyan(feed.title))]
  const sub = [feed.home, `${feed.entries.length} entries`, `updated ${day(feed.updated)}`].filter(
    Boolean,
  )
  out.push(dim(sub.join('  ·  ')), '')

  feed.entries.forEach((entry, index) => {
    out.push(`${dim(String(index + 1).padStart(2))}  ${bold(entry.title)}`)

    const meta: string[] = []
    if (entry.source?.name) meta.push(cyan(entry.source.name))
    const date = day(entry.published ?? entry.updated)
    if (date) meta.push(yellow(date))
    if (entry.authors?.length) meta.push(entry.authors.map((a) => a.name).join(', '))
    if (entry.tags?.length) meta.push(magenta(entry.tags.map((t) => `#${t}`).join(' ')))
    if (meta.length) out.push(`    ${meta.join(dim(' · '))}`)

    out.push(`    ${green(entry.link)}`)
    if (entry.summary) out.push(`    ${dim(truncate(entry.summary, 100))}`)
    out.push('')
  })

  process.stdout.write(`${out.join('\n')}\n`)
}

async function main(): Promise<void> {
  // Tolerate a leading `--` that `pnpm run` and tsx can inject when forwarding args.
  const argv = process.argv.slice(2)
  const args = argv[0] === '--' ? argv.slice(1) : argv
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      format: { type: 'string', short: 'f' },
      out: { type: 'string', short: 'o' },
      template: { type: 'string', short: 't' },
      mesh: { type: 'string', short: 'm' },
      taps: { type: 'string', multiple: true },
      sort: { type: 'string' },
      order: { type: 'string' },
      limit: { type: 'string', short: 'n' },
      since: { type: 'string' },
      'max-age': { type: 'string' },
      today: { type: 'boolean' },
      'this-week': { type: 'boolean' },
      between: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })

  if (values.help) {
    process.stdout.write(HELP)
    return
  }
  if (values.version) {
    process.stdout.write(`neurowire ${VERSION}\n`)
    return
  }

  if (positionals[0] === 'validate') {
    await runValidate(positionals[1])
    return
  }

  // Built-in taps plus any from --taps, NEUROWIRE_TAPS, or ~/.config/neurowire/taps.
  const { user } = registerAllTaps(values.taps ?? [])
  if (user.length) process.stderr.write(`Loaded ${user.length} custom tap(s)\n`)

  let feed: NeurowireFeed
  if (values.mesh) {
    const mesh = MeshSchema.parse(JSON.parse(readFileSync(values.mesh, 'utf8')))
    feed = await fetchMesh(mesh)
  } else {
    const url = positionals[0]
    if (!url) {
      process.stderr.write('error: missing <url> (or use --mesh <file>)\n\n')
      process.stderr.write(HELP)
      process.exitCode = 1
      return
    }
    let template: FeedTemplate | undefined
    if (values.template) {
      template = FeedTemplateSchema.parse(JSON.parse(readFileSync(values.template, 'utf8')))
    }
    feed = await fetchFeed(url, { template })
  }

  const refined = refineFeed(feed, values)
  if (!refined) return
  feed = refined

  if (values.format) {
    if (!isFormat(values.format)) {
      process.stderr.write(
        `error: unknown format "${values.format}". Use one of: ${FORMATS.join(', ')}\n`,
      )
      process.exitCode = 1
      return
    }
    const output = serialize(feed, values.format)
    if (values.out) {
      writeFileSync(values.out, output)
      process.stderr.write(`Wrote ${feed.entries.length} entries to ${values.out}\n`)
    } else {
      process.stdout.write(output)
    }
    return
  }

  renderTerminal(feed)
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
