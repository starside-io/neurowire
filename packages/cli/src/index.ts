import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  ConstructSchema,
  FORMATS,
  type FilterField,
  type FilterRule,
  type FilterSpec,
  MeshSchema,
  type NeurowireFeed,
  type SelectOptions,
  type SortKey,
  type SortOrder,
  type WindowSpec,
  constructToOpml,
  entryKey,
  filterEntries,
  isFormat,
  meshToOpml,
  newEntries,
  parseDuration,
  resolveWindow,
  selectEntries,
  serialize,
  validateNwf,
} from '@neurowire/core'
import {
  type FeedTemplate,
  FeedTemplateSchema,
  type FetchedConstruct,
  createConfigMeshResolver,
  fetchConstruct,
  fetchDocument,
  fetchFeed,
  fetchMesh,
  flattenConstruct,
  opmlToMesh,
  proposeTemplate,
} from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'
import { deliver } from './sinks'

const VERSION = '0.6.0'

const SORT_KEYS: readonly SortKey[] = ['date', 'title', 'source']
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc']
const FILTER_FIELDS: readonly FilterField[] = ['title', 'summary', 'source', 'author', 'tag']

const HELP = `Neurowire ${VERSION} - turn any blog or feed into Atom and friends.

Usage:
  neurowire <url> [options]
  neurowire --mesh <file> [options]
  neurowire --construct <file> [options]
  neurowire validate <file-or-url>

Options:
  -f, --format <fmt>     Output format: ${FORMATS.join(', ')}. Omit for a terminal view.
  -o, --out <file>       Write output to a file instead of stdout.
  -t, --template <file>  Path to a JSON CSS-selector template for HTML pages.
  -m, --mesh <file>      Fetch a mesh: a JSON bundle of named sources, merged into one feed.
  -c, --construct <file> Fetch a construct: a bundle of meshes. Terminal view keeps the
                         per-mesh grouping; --format flattens it into one feed.
      --taps <path>      Load extra taps: a .json file or a directory. Repeatable.
  -h, --help             Show this help.
  -v, --version          Show the version.

Shape the output (applied before --format):
      --filter <f:p>     Keep entries where field f matches pattern p. Repeatable.
      --exclude <f:p>    Drop entries where field f matches pattern p. Repeatable.
                         Pattern is a substring by default, or /regex/ for a regex.
                         Fields: title, summary, source, author, tag.
      --sort <key>       Sort by date, title, or source.
      --order <dir>      asc or desc (default: newest-first for date, A-Z otherwise).
  -n, --limit <n>        Keep at most n entries. Handy for integrations: --limit 10.
      --since <age>      Keep entries within this window, e.g. 24h, 90m, 7d.
      --max-age <age>    Drop entries older than this (same window as --since).
      --today            Keep entries since midnight UTC today.
      --this-week        Keep entries since Monday midnight UTC.
      --between <a>..<b> Keep entries between two dates, e.g. 2026-01-01..2026-02-01.

Watch a feed or mesh and emit only new entries:
  -w, --watch            Long-poll on an interval, printing only entries not seen yet.
      --interval <age>   Poll interval, e.g. 30m, 6h, 1d (default: 5m).
      --state <file>     JSON file of seen entry keys, so restarts skip old items.

Deliver to sinks (push entries to a destination):
      --sink <url>       POST entries to a destination. Repeatable. Slack, Discord,
                         or a generic webhook, auto-detected by URL. With --watch,
                         only the new entries are delivered each tick.

Commands:
  validate <file-or-url> Check that an nwf document is well-formed (exits non-zero if not).
  tap doctor <url>       Propose a FeedTemplate (tap) for a feed-less page.
  opml export            Export a mesh/construct to OPML 2.0 (--mesh or --construct, -o optional).
  opml import <src>      Import an OPML file or URL into a mesh JSON (-o, --name optional).

A mesh bundles many sources into one feed:
  { "name": "AI News", "sources": [{ "name": "...", "url": "..." }] }

A construct bundles many meshes. Members are inline meshes or references by name
(resolved from ~/.config/neurowire/meshes or NEUROWIRE_MESHES):
  { "name": "Daily", "meshes": ["ai-news", { "name": "Custom", "sources": [...] }] }

Taps teach Neurowire to read sites with no RSS/Atom feed. Add your own with
--taps, the NEUROWIRE_TAPS env var (a path or ':'-separated list), or by dropping
*.json files into ~/.config/neurowire/taps/.

Examples:
  neurowire https://example.com/blog
  neurowire https://example.com/feed.xml --format atom > feed.xml
  neurowire --mesh ai-news.json --format json --limit 10
  neurowire --construct daily.json
  neurowire --construct daily.json --format atom --limit 20
  neurowire --mesh ai-news.json --since 24h --sort date --format atom
  neurowire --mesh ai-news.json --filter tag:release --exclude title:sponsored --format json
  neurowire --mesh ai-news.json --watch --interval 15m --format json
  neurowire --mesh ai-news.json --watch --sink https://hooks.slack.com/services/...
  neurowire validate feed.nwf
  neurowire tap doctor https://example.com/blog > ~/.config/neurowire/taps/example.com.json
  neurowire opml export --mesh ai-news.json > ai-news.opml
  neurowire opml import subscriptions.opml -o mesh.json --name "My Reader"
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

/**
 * Fetch a feed-less page and propose a FeedTemplate (tap) for it. Prints the
 * template as pretty JSON to stdout (redirect it into a taps file) and a human
 * preview to stderr. Exits non-zero when no url is given or nothing is found.
 */
async function runTapDoctor(url: string | undefined): Promise<void> {
  if (!url) {
    process.stderr.write('error: tap doctor needs a url\n\nUsage: neurowire tap doctor <url>\n')
    process.exitCode = 1
    return
  }

  const doc = await fetchDocument(url)
  const proposal = proposeTemplate(doc.body, doc.url)
  if (!proposal) {
    process.stderr.write(`${red('error')}: could not propose a template for ${url}\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write(`${JSON.stringify(proposal.template, null, 2)}\n`)

  process.stderr.write(
    `${green('✓')} matched ${proposal.matched} entr${proposal.matched === 1 ? 'y' : 'ies'}\n`,
  )
  for (const title of proposal.sampleTitles) {
    process.stderr.write(`  ${dim('·')} ${title}\n`)
  }
  const host = proposal.template.host ?? 'host'
  process.stderr.write(
    dim(`# save this as ~/.config/neurowire/taps/${host}.json or pass with --taps\n`),
  )
}

/**
 * Export a mesh or construct to OPML 2.0. Reads the JSON file named by --mesh or
 * --construct, serializes it, and writes to --out or stdout. Exits non-zero when
 * neither flag is given.
 */
function runOpmlExport(values: CliValues): void {
  let opml: string
  if (typeof values.mesh === 'string') {
    const mesh = MeshSchema.parse(JSON.parse(readFileSync(values.mesh, 'utf8')))
    opml = meshToOpml(mesh)
  } else if (typeof values.construct === 'string') {
    const construct = ConstructSchema.parse(JSON.parse(readFileSync(values.construct, 'utf8')))
    opml = constructToOpml(construct)
  } else {
    process.stderr.write(
      'error: opml export needs --mesh <file> or --construct <file>\n\n' +
        'Usage: neurowire opml export --mesh <file>|--construct <file> [-o out.opml]\n',
    )
    process.exitCode = 1
    return
  }

  if (typeof values.out === 'string') {
    writeFileSync(values.out, opml)
    process.stderr.write(`Wrote OPML to ${values.out}\n`)
  } else {
    process.stdout.write(opml)
  }
}

/**
 * Import an OPML subscription list (file path or http(s) URL) into a mesh JSON.
 * The mesh name comes from --name, else the OPML head/title, else "imported".
 * Writes the mesh JSON to --out or stdout. Exits non-zero when no input is given.
 */
async function runOpmlImport(input: string | undefined, values: CliValues): Promise<void> {
  if (!input) {
    process.stderr.write(
      'error: opml import needs a path or URL\n\n' +
        'Usage: neurowire opml import <file-or-url> [-o mesh.json] [--name <name>]\n',
    )
    process.exitCode = 1
    return
  }

  const name = typeof values.name === 'string' ? values.name : undefined
  const mesh = opmlToMesh(await readInput(input), name)
  const json = `${JSON.stringify(mesh, null, 2)}\n`

  if (typeof values.out === 'string') {
    writeFileSync(values.out, json)
    process.stderr.write(
      `Wrote mesh "${mesh.name}" (${mesh.sources.length} sources) to ${values.out}\n`,
    )
  } else {
    process.stdout.write(json)
  }
}

/** Dispatch the `opml` subcommand group: `export` or `import`. */
async function runOpml(sub: string | undefined, rest: string[], values: CliValues): Promise<void> {
  if (sub === 'export') {
    runOpmlExport(values)
    return
  }
  if (sub === 'import') {
    await runOpmlImport(rest[0], values)
    return
  }
  process.stderr.write(
    'error: opml needs a subcommand: export or import\n\n' +
      'Usage:\n' +
      '  neurowire opml export --mesh <file>|--construct <file> [-o out.opml]\n' +
      '  neurowire opml import <file-or-url> [-o mesh.json] [--name <name>]\n',
  )
  process.exitCode = 1
}

type CliValues = Record<string, string | string[] | boolean | undefined>

/**
 * Parse a `field:pattern` string into a filter rule. Splits on the first colon
 * only (patterns may contain colons). A pattern wrapped in slashes (`/.../`) is
 * a case-insensitive regex; otherwise it is a case-insensitive substring.
 * Returns undefined when the field is unknown.
 */
function parseFilterRule(value: string): FilterRule | undefined {
  const colon = value.indexOf(':')
  const field = (colon === -1 ? value : value.slice(0, colon)) as FilterField
  if (!FILTER_FIELDS.includes(field)) return undefined
  let pattern = colon === -1 ? '' : value.slice(colon + 1)
  let regex = false
  if (pattern.length >= 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    pattern = pattern.slice(1, -1)
    regex = true
  }
  return { field, pattern, regex }
}

/**
 * Apply the --filter (include) and --exclude rules to a feed. Returns the
 * filtered feed, or undefined after writing an error and setting a non-zero
 * exit code when a rule has an unknown field.
 */
function applyFilters(feed: NeurowireFeed, values: CliValues): NeurowireFeed | undefined {
  const fail = (raw: string): undefined => {
    process.stderr.write(
      `error: bad filter "${raw}". Use field:pattern with one of: ${FILTER_FIELDS.join(', ')}\n`,
    )
    process.exitCode = 1
    return undefined
  }

  const collect = (raw: string[]): FilterRule[] | undefined => {
    const rules: FilterRule[] = []
    for (const value of raw) {
      const rule = parseFilterRule(value)
      if (!rule) return fail(value)
      rules.push(rule)
    }
    return rules
  }

  const filterRaw = (values.filter as string[] | undefined) ?? []
  const excludeRaw = (values.exclude as string[] | undefined) ?? []
  if (filterRaw.length === 0 && excludeRaw.length === 0) return feed

  const include = collect(filterRaw)
  if (!include) return undefined
  const exclude = collect(excludeRaw)
  if (!exclude) return undefined

  const spec: FilterSpec = { include, exclude }
  const before = feed.entries.length
  const filtered = filterEntries(feed, spec)
  if (filtered.entries.length !== before) {
    process.stderr.write(`Filtered to ${filtered.entries.length} of ${before} entries\n`)
  }
  return filtered
}

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

function pushEntry(out: string[], entry: NeurowireFeed['entries'][number], index: number): void {
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
}

function renderTerminal(feed: NeurowireFeed): void {
  const out: string[] = [bold(cyan(feed.title))]
  const sub = [feed.home, `${feed.entries.length} entries`, `updated ${day(feed.updated)}`].filter(
    Boolean,
  )
  out.push(dim(sub.join('  ·  ')), '')
  feed.entries.forEach((entry, index) => pushEntry(out, entry, index))
  process.stdout.write(`${out.join('\n')}\n`)
}

/** Render a construct to the terminal: a section per mesh, grouping preserved. */
function renderConstructTerminal(construct: FetchedConstruct): void {
  const total = construct.parts.reduce((sum, part) => sum + part.feed.entries.length, 0)
  const out: string[] = [bold(cyan(construct.name))]
  out.push(dim(`${construct.parts.length} meshes  ·  ${total} entries`), '')

  for (const part of construct.parts) {
    out.push(bold(magenta(`▍ ${part.mesh.name}`)))
    out.push(dim(`  ${part.feed.entries.length} entries`), '')
    part.feed.entries.forEach((entry, index) => pushEntry(out, entry, index))
  }

  process.stdout.write(`${out.join('\n')}\n`)
}

/** Parse a construct file and fetch it, resolving `{ ref }` members from config. */
async function loadConstruct(path: string): Promise<FetchedConstruct> {
  const construct = ConstructSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  return fetchConstruct(construct, { resolver: createConfigMeshResolver() })
}

/**
 * Fetch the feed for this invocation: a construct (flattened) when --construct is
 * set, a mesh when --mesh is set, otherwise the positional URL (optionally guided
 * by a --template). Returns undefined after writing an error and setting a
 * non-zero exit code when no source is given.
 */
async function loadFeed(
  values: CliValues,
  positionals: string[],
): Promise<NeurowireFeed | undefined> {
  if (typeof values.construct === 'string') {
    return flattenConstruct(await loadConstruct(values.construct))
  }
  if (typeof values.mesh === 'string') {
    const mesh = MeshSchema.parse(JSON.parse(readFileSync(values.mesh, 'utf8')))
    return fetchMesh(mesh)
  }
  const url = positionals[0]
  if (!url) {
    process.stderr.write('error: missing <url> (or use --mesh/--construct <file>)\n\n')
    process.stderr.write(HELP)
    process.exitCode = 1
    return undefined
  }
  let template: FeedTemplate | undefined
  if (typeof values.template === 'string') {
    template = FeedTemplateSchema.parse(JSON.parse(readFileSync(values.template, 'utf8')))
  }
  return fetchFeed(url, { template })
}

/**
 * Write a feed to stdout: serialized when --format is set, otherwise the
 * terminal view. Returns false after an error (unknown format), true otherwise.
 */
function emitFeed(feed: NeurowireFeed, values: CliValues): boolean {
  if (typeof values.format === 'string') {
    if (!isFormat(values.format)) {
      process.stderr.write(
        `error: unknown format "${values.format}". Use one of: ${FORMATS.join(', ')}\n`,
      )
      process.exitCode = 1
      return false
    }
    process.stdout.write(serialize(feed, values.format))
    return true
  }
  renderTerminal(feed)
  return true
}

/**
 * Push a feed's entries to every --sink url. Sinks are additive to stdout output
 * and never throw, so a failing sink prints a warning but does not abort the run
 * or the watch loop. A no-op when there are no entries to deliver.
 */
async function deliverToSinks(feed: NeurowireFeed, values: CliValues): Promise<void> {
  if (feed.entries.length === 0) return
  const sinks = (values.sink as string[] | undefined) ?? []
  for (const url of sinks) {
    await deliver(url, feed)
  }
}

/** Read a JSON array of seen entry keys from a state file, or [] when absent. */
function loadSeenState(path: string): string[] {
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf8')) as string[]
}

/**
 * Long-poll a feed or mesh on an interval, emitting only entries not seen yet.
 * Seen-state lives here in the CLI: an in-memory Set, optionally persisted to a
 * --state JSON file so restarts skip items already reported. The loop runs until
 * the process is killed.
 */
async function runWatch(values: CliValues, positionals: string[]): Promise<void> {
  const intervalMs = parseDuration((values.interval as string | undefined) ?? '5m')
  if (intervalMs === undefined) {
    process.stderr.write(
      `error: invalid --interval "${values.interval as string}" (use e.g. 30m, 6h, 1d)\n`,
    )
    process.exitCode = 1
    return
  }

  const statePath = values.state as string | undefined
  const seen = new Set<string>(statePath ? loadSeenState(statePath) : [])

  for (;;) {
    const feed = await loadFeed(values, positionals)
    if (!feed) return
    const filtered = applyFilters(feed, values)
    if (!filtered) return
    const refined = refineFeed(filtered, values)
    if (!refined) return

    const fresh = newEntries(refined, seen)
    if (fresh.length > 0) emitFeed({ ...refined, entries: fresh }, values)
    await deliverToSinks({ ...refined, entries: fresh }, values)

    for (const entry of fresh) seen.add(entryKey(entry))
    if (statePath) writeFileSync(statePath, JSON.stringify([...seen]))

    process.stderr.write(`[watch] ${fresh.length} new (${seen.size} seen)\n`)

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
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
      construct: { type: 'string', short: 'c' },
      taps: { type: 'string', multiple: true },
      filter: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      sort: { type: 'string' },
      order: { type: 'string' },
      limit: { type: 'string', short: 'n' },
      since: { type: 'string' },
      'max-age': { type: 'string' },
      today: { type: 'boolean' },
      'this-week': { type: 'boolean' },
      between: { type: 'string' },
      watch: { type: 'boolean', short: 'w' },
      interval: { type: 'string' },
      state: { type: 'string' },
      sink: { type: 'string', multiple: true },
      name: { type: 'string' },
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

  if (positionals[0] === 'opml') {
    await runOpml(positionals[1], positionals.slice(2), values)
    return
  }

  if (positionals[0] === 'tap' && positionals[1] === 'doctor') {
    await runTapDoctor(positionals[2])
    return
  }
  if (positionals[0] === 'doctor') {
    await runTapDoctor(positionals[1])
    return
  }

  // Built-in taps plus any from --taps, NEUROWIRE_TAPS, or ~/.config/neurowire/taps.
  const { user } = registerAllTaps(values.taps ?? [])
  if (user.length) process.stderr.write(`Loaded ${user.length} custom tap(s)\n`)

  if (values.watch) {
    await runWatch(values, positionals)
    return
  }

  // Construct without --format keeps the mesh grouping in a sectioned terminal
  // view. With --format it falls through to loadFeed, which flattens it.
  if (typeof values.construct === 'string' && !values.format) {
    const construct = await loadConstruct(values.construct)
    const parts = []
    for (const part of construct.parts) {
      const filtered = applyFilters(part.feed, values)
      if (!filtered) return
      const refined = refineFeed(filtered, values)
      if (!refined) return
      parts.push({ ...part, feed: refined })
    }
    const refinedConstruct: FetchedConstruct = { ...construct, parts }
    renderConstructTerminal(refinedConstruct)
    await deliverToSinks(flattenConstruct(refinedConstruct), values)
    return
  }

  const loaded = await loadFeed(values, positionals)
  if (!loaded) return
  const filtered = applyFilters(loaded, values)
  if (!filtered) return
  const feed = refineFeed(filtered, values)
  if (!feed) return

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
    await deliverToSinks(feed, values)
    return
  }

  renderTerminal(feed)
  await deliverToSinks(feed, values)
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
