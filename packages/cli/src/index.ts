import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import {
  ConstructSchema,
  FORMATS,
  MeshSchema,
  type NeurowireFeed,
  constructToOpml,
  entryKey,
  isFormat,
  journalToFeed,
  meshToOpml,
  serialize,
  validateNwf,
} from '@neurowire/core'
import {
  type FeedTemplate,
  FeedTemplateSchema,
  type FetchedConstruct,
  type Peer,
  createConfigMeshResolver,
  fetchConstruct,
  fetchDocument,
  fetchFeed,
  fetchMesh,
  flattenConstruct,
  openJournalStore,
  opmlToMesh,
  pollFeed,
  proposeTemplate,
  syncPeers,
} from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'
import {
  type CliValues,
  FILTER_FIELDS,
  applyFilterSpec,
  applySelectOptions,
  buildFilterSpec,
  buildJournalQuery,
  buildSelectOptions,
  journalFeedMeta,
  parseJournalCursor,
} from './pipeline'
import { deliver } from './sinks'
import {
  addPeer,
  formatPeersConfig,
  formatPeersList,
  formatSyncReport,
  peerFromArgs,
  peersConfigPath,
  readPeersConfig,
  removePeer,
} from './sync'
import { TAIL_STOP, runRemoteTail, runTail, tailIntervalMs } from './tail'
import { type WizardIo, runTapCheck, runTapHeal, runTapWizard } from './tap-wizard'

const VERSION = '0.10.0'

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
      --tap-pack <theme> Register themes from @neurowire/taps-pack (e.g. gaming,space),
                         or "all". Repeatable. Needs @neurowire/taps-pack installed.
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

Follow a feed as a stream (tail -f for the web):
  tail <url>             Print entries as they appear, forever. Also takes --mesh
                         and --construct, and honors the filter/shape flags per tick.
      -f nwf             With tail: stream raw nwfj journal lines for piping.
      --from <api-url>   With tail: render a remote /tail SSE stream instead of
                         polling locally.

Watch a feed or mesh and emit only new entries:
  -w, --watch            Long-poll on an interval, printing only entries not seen yet.
                         A batch-output alias for tail: one feed per tick.
      --interval <age>   Poll interval, e.g. 30s, 30m, 6h, 1d (default: 5m, floor 30s).
      --state <file>     JSON file of seen entry keys, so restarts skip old items.

Keep an append-only archive (a journal):
      --journal <id>     Append fetched entries to the journal <id>. Duplicates are
                         dropped, so re-running adds only what is new.
      --journal-dir <d>  Where journals live (default: ~/.config/neurowire/journal
                         or $NEUROWIRE_JOURNAL).

Sync journals from peers (nwf-sync/1):
      --peers            Sync every peer in ~/.config/neurowire/peers.json.
      --token <t>        Bearer token for a peer that requires one.

Deliver to sinks (push entries to a destination):
      --sink <url>       POST entries to a destination. Repeatable. Slack, Discord,
                         or a generic webhook, auto-detected by URL. With --watch,
                         only the new entries are delivered each tick.

Commands:
  tail [url]             Follow a feed, mesh, or construct as a live stream.
  validate <file-or-url> Check that an nwf document is well-formed (exits non-zero if not).
  tap wizard <url>       Author a tap step by step: candidates, live preview, and a
                         verification gate. --yes takes every top candidate.
  tap check [path]       Do taps still match their pages? --all checks the registry,
                         --json prints machine-readable results. Exits 1 on breakage.
  tap heal <path>        Re-author a broken tap against the page as it stands today.
  tap doctor <url>       Propose a FeedTemplate (tap) for a feed-less page.
  opml export            Export a mesh/construct to OPML 2.0 (--mesh or --construct, -o optional).
  opml import <src>      Import an OPML file or URL into a mesh JSON (-o, --name optional).
  journal head <id>      Print the journal's head cursor.
  journal cat <id>       Print a journal, all of it or the tail after --cursor <n>.
  journal query <id>     Query a journal with the same --filter/--since/--sort flags.
  sync <peer-url>        Pull journal deltas from a peer (or --peers for all).
  peers list|add|remove  Manage ~/.config/neurowire/peers.json.

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
  neurowire --mesh ai-news.json --journal ai
  neurowire journal query ai --filter tag:release --since 30d -f md
  neurowire tail --mesh ai-news.json --interval 60s
  neurowire tail --mesh ai-news.json -f nwf | grep -i release
  neurowire tail --from https://api.example.com/tail?src=ai-news
  neurowire peers add https://hub.example.com --token secret
  neurowire sync https://hub.example.com --journal ai
  neurowire sync --peers
  neurowire validate feed.nwf
  neurowire tap wizard https://example.com/blog
  neurowire tap wizard https://example.com/blog --yes -o ./example.json
  neurowire tap check ~/.config/neurowire/taps --json
  neurowire tap heal ~/.config/neurowire/taps/example.com.json
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
 * Terminal IO for the tap walkthrough. The readline interface is created on the
 * first prompt only, so the non-interactive paths (`--yes`, `check`, `heal --yes`)
 * never take stdin hostage.
 */
function createTerminalIo(): { io: WizardIo; close(): void } {
  let rl: ReturnType<typeof createInterface> | undefined
  return {
    io: {
      out: (text: string) => {
        process.stdout.write(text)
      },
      err: (text: string) => {
        process.stderr.write(text)
      },
      ask: (prompt: string) => {
        rl ??= createInterface({ input: process.stdin, output: process.stdout })
        return rl.question(prompt)
      },
    },
    close: () => rl?.close(),
  }
}

/** Read a string flag, or undefined when it was not given. */
const str = (value: CliValues[string]): string | undefined =>
  typeof value === 'string' ? value : undefined

/** Dispatch the `tap` subcommand group: `wizard`, `check`, `heal`, or `doctor`. */
async function runTap(sub: string | undefined, rest: string[], values: CliValues): Promise<void> {
  const terminal = createTerminalIo()
  const deps = { io: terminal.io }
  try {
    if (sub === 'wizard') {
      process.exitCode = await runTapWizard(
        rest[0],
        { yes: Boolean(values.yes), out: str(values.out) },
        deps,
      )
      return
    }
    if (sub === 'check') {
      process.exitCode = await runTapCheck(
        rest[0],
        {
          all: Boolean(values.all),
          json: Boolean(values.json),
          url: str(values.url),
          tapPaths: (values.taps as string[] | undefined) ?? [],
        },
        deps,
      )
      return
    }
    if (sub === 'heal') {
      process.exitCode = await runTapHeal(
        rest[0],
        { yes: Boolean(values.yes), url: str(values.url) },
        deps,
      )
      return
    }
    process.stderr.write(
      'error: tap needs a subcommand: wizard, check, heal, or doctor\n\n' +
        'Usage:\n' +
        '  neurowire tap wizard <url> [-o file] [--yes]\n' +
        '  neurowire tap check [path] [--all] [--json] [--url <page>]\n' +
        '  neurowire tap heal <path> [--yes] [--url <page>]\n' +
        '  neurowire tap doctor <url>\n',
    )
    process.exitCode = 1
  } finally {
    terminal.close()
  }
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

/** Open the journal store for this invocation, honoring --journal-dir. */
function journalStore(values: CliValues) {
  const dir = values['journal-dir']
  return openJournalStore(typeof dir === 'string' ? { dir } : {})
}

/**
 * Append a feed's entries to a journal when --journal is set. The store drops
 * entries it already holds, so re-running the same fetch appends nothing.
 */
function appendToJournal(feed: NeurowireFeed, values: CliValues): void {
  const id = values.journal
  if (typeof id !== 'string') return
  const { added, head } = journalStore(values).append(id, feed.entries, journalFeedMeta(feed))
  process.stderr.write(
    `Journaled ${added} new entr${added === 1 ? 'y' : 'ies'} to ${id} (head ${head.seq})\n`,
  )
}

/** Write a journal-derived feed, honoring --format, --out, and the terminal view. */
function emitJournalFeed(feed: NeurowireFeed, values: CliValues): void {
  if (typeof values.format === 'string' && typeof values.out === 'string') {
    if (!isFormat(values.format)) {
      process.stderr.write(
        `error: unknown format "${values.format}". Use one of: ${FORMATS.join(', ')}\n`,
      )
      process.exitCode = 1
      return
    }
    writeFileSync(values.out, serialize(feed, values.format))
    process.stderr.write(`Wrote ${feed.entries.length} entries to ${values.out}\n`)
    return
  }
  emitFeed(feed, values)
}

/**
 * Dispatch the `journal` subcommand group: `head`, `cat`, or `query`. Reading
 * an archive goes through the same filter, window, sort, and format flags the
 * fetch path uses, so a journal answers what a live feed answers.
 */
function runJournal(sub: string | undefined, rest: string[], values: CliValues): void {
  const usage =
    'Usage:\n' +
    '  neurowire journal head <id>\n' +
    '  neurowire journal cat <id> [--cursor <n>] [-f <fmt>]\n' +
    '  neurowire journal query <id> [--filter f:p] [--since 30d] [-f <fmt>]\n'

  if (sub !== 'head' && sub !== 'cat' && sub !== 'query') {
    process.stderr.write(`error: journal needs a subcommand: head, cat, or query\n\n${usage}`)
    process.exitCode = 1
    return
  }

  const id = rest[0]
  if (!id) {
    process.stderr.write(`error: journal ${sub} needs a journal id\n\n${usage}`)
    process.exitCode = 1
    return
  }

  const store = journalStore(values)

  if (sub === 'head') {
    const head = store.head(id)
    process.stdout.write(`${head.hash ? `${head.seq}.${head.hash}` : head.seq}\n`)
    return
  }

  const asFeed = (entries: NeurowireFeed['entries']): NeurowireFeed =>
    journalToFeed(
      {
        records: entries.map((entry, index) => ({ seq: index + 1, entry })),
        head: store.head(id),
        issues: [],
      },
      { id, title: id },
    )

  if (sub === 'cat') {
    let entries: NeurowireFeed['entries']
    if (typeof values.cursor === 'string') {
      const cursor = parseJournalCursor(values.cursor)
      if (!cursor) {
        process.stderr.write(
          `error: invalid --cursor "${values.cursor}" (use a sequence number, e.g. 42 or 42.<hash>)\n`,
        )
        process.exitCode = 1
        return
      }
      const result = store.since(id, cursor)
      if (result.tooOld) {
        process.stderr.write(
          `warning: cursor ${cursor.seq} is older than the oldest retained entry, the delta is incomplete\n`,
        )
      }
      entries = result.entries
    } else {
      entries = store.read(id).map((record) => record.entry)
    }
    emitJournalFeed(asFeed(entries), values)
    return
  }

  const query = buildJournalQuery(values, Date.now())
  if (!query.ok) {
    process.stderr.write(`error: ${query.error}\n`)
    process.exitCode = 1
    return
  }
  const result = store.query(id, query.value)
  if (result.skipped.length) {
    process.stderr.write(
      dim(`Scanned ${result.scanned.length} segment(s), skipped ${result.skipped.length}\n`),
    )
  }
  emitJournalFeed(asFeed(result.entries), values)
}

/**
 * Read the configured peers. A missing file is an empty list; an unreadable one
 * is an error, never an empty list, so nothing later overwrites it.
 */
function readPeersFile(): { ok: true; peers: Peer[] } | { ok: false; error: string } {
  const path = peersConfigPath()
  if (!existsSync(path)) return { ok: true, peers: [] }
  return readPeersConfig(readFileSync(path, 'utf8'))
}

/** Narrow every peer to one journal when --journal is set on a sync run. */
function scopePeers(peers: Peer[], journal: string | undefined): Peer[] {
  if (!journal) return peers
  return peers.map((peer) => ({ ...peer, journals: [journal] }))
}

/**
 * Pull journal deltas from a peer URL, or from every configured peer with
 * --peers. Prints one line per journal plus a summary, and exits non-zero when
 * any peer or journal failed, so a cron job notices.
 */
async function runSync(rest: string[], values: CliValues): Promise<void> {
  const token = typeof values.token === 'string' ? values.token : undefined
  const journal = typeof values.journal === 'string' ? values.journal : undefined

  let peers: Peer[]
  if (values.peers) {
    const configured = readPeersFile()
    if (!configured.ok) {
      process.stderr.write(`error: cannot read ${peersConfigPath()}: ${configured.error}\n`)
      process.exitCode = 1
      return
    }
    peers = scopePeers(configured.peers, journal)
    if (peers.length === 0) {
      process.stderr.write(
        `error: no peers configured in ${peersConfigPath()}\n\nAdd one: neurowire peers add https://hub.example.com\n`,
      )
      process.exitCode = 1
      return
    }
  } else {
    const url = rest[0]
    if (!url) {
      process.stderr.write(
        'error: sync needs a peer url (or --peers)\n\n' +
          'Usage: neurowire sync <peer-url> [--journal <id>] [--token <t>]\n' +
          '       neurowire sync --peers\n',
      )
      process.exitCode = 1
      return
    }
    peers = [peerFromArgs(url, token, journal)]
  }

  const report = await syncPeers(peers, journalStore(values))
  for (const line of formatSyncReport(report)) process.stdout.write(`${line}\n`)
  if (report.errors) process.exitCode = 1
}

/** Dispatch the `peers` subcommand group: `list`, `add <url>`, or `remove <url>`. */
function runPeers(sub: string | undefined, rest: string[], values: CliValues): void {
  const usage =
    'Usage:\n' +
    '  neurowire peers list\n' +
    '  neurowire peers add <url> [--token <t>] [--journal <id>]\n' +
    '  neurowire peers remove <url>\n'

  if (sub !== 'list' && sub !== 'add' && sub !== 'remove') {
    process.stderr.write(`error: peers needs a subcommand: list, add, or remove\n\n${usage}`)
    process.exitCode = 1
    return
  }

  const path = peersConfigPath()
  const configured = readPeersFile()
  if (!configured.ok) {
    // Refusing here is the point: rewriting the file would drop every peer and
    // token the operator cannot see because the file no longer parses.
    process.stderr.write(`error: cannot read ${path}: ${configured.error}\n`)
    process.exitCode = 1
    return
  }
  const peers = configured.peers

  if (sub === 'list') {
    for (const line of formatPeersList(peers)) process.stdout.write(`${line}\n`)
    return
  }

  const url = rest[0]
  if (!url) {
    process.stderr.write(`error: peers ${sub} needs a url\n\n${usage}`)
    process.exitCode = 1
    return
  }

  const write = (next: Peer[]): void => {
    mkdirSync(dirname(path), { recursive: true })
    // 0600: this file holds bearer tokens.
    writeFileSync(path, formatPeersConfig(next), { mode: 0o600 })
  }

  if (sub === 'add') {
    const token = typeof values.token === 'string' ? values.token : undefined
    const journal = typeof values.journal === 'string' ? values.journal : undefined
    write(addPeer(peers, peerFromArgs(url, token, journal)))
    process.stderr.write(`Added ${url} to ${path}\n`)
    return
  }

  const { peers: kept, removed } = removePeer(peers, url)
  if (!removed) {
    process.stderr.write(`error: no peer matching ${url} in ${path}\n`)
    process.exitCode = 1
    return
  }
  write(kept)
  process.stderr.write(`Removed ${url} from ${path}\n`)
}

/**
 * Apply the --filter (include) and --exclude rules to a feed. Returns the
 * filtered feed, or undefined after writing an error and setting a non-zero
 * exit code when a rule has an unknown field. Pure parsing lives in pipeline.ts;
 * this wrapper owns the stderr/exit-code reporting.
 */
function applyFilters(feed: NeurowireFeed, values: CliValues): NeurowireFeed | undefined {
  const spec = buildFilterSpec(values)
  if (!spec.ok) {
    process.stderr.write(
      `error: bad filter "${spec.bad}". Use field:pattern with one of: ${FILTER_FIELDS.join(', ')}\n`,
    )
    process.exitCode = 1
    return undefined
  }
  if (!spec.value) return feed

  const before = feed.entries.length
  const filtered = applyFilterSpec(feed, spec.value)
  if (filtered.entries.length !== before) {
    process.stderr.write(`Filtered to ${filtered.entries.length} of ${before} entries\n`)
  }
  return filtered
}

/**
 * Apply the --sort/--order/--limit and time-window flags to a feed. Returns the
 * refined feed, or undefined after writing an error and setting a non-zero exit
 * code when a flag value is invalid. Pure parsing/validation lives in
 * pipeline.ts; this wrapper owns the stderr/exit-code reporting.
 */
function refineFeed(feed: NeurowireFeed, values: CliValues): NeurowireFeed | undefined {
  const opts = buildSelectOptions(values, Date.now())
  if (!opts.ok) {
    process.stderr.write(`error: ${opts.error}\n`)
    process.exitCode = 1
    return undefined
  }
  const before = feed.entries.length
  const refined = applySelectOptions(feed, opts.value)
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
 * One tick of the fetch pipeline: load the source, then apply the filter and
 * refine flags exactly as a one-shot run would. Returns undefined once a flag
 * error has been reported, which ends the loop without a second message.
 */
async function tickFeed(
  values: CliValues,
  positionals: string[],
): Promise<NeurowireFeed | undefined> {
  const feed = await loadFeed(values, positionals)
  if (!feed) return undefined
  const filtered = applyFilters(feed, values)
  if (!filtered) return undefined
  return refineFeed(filtered, values)
}

/**
 * Long-poll a feed or mesh on an interval, emitting only entries not seen yet.
 * Seen-state lives here in the CLI: an in-memory Set, optionally persisted to a
 * --state JSON file so restarts skip items already reported. The loop itself is
 * ingest's poll engine, the same one `tail` and the API's /tail route use.
 */
async function runWatch(values: CliValues, positionals: string[]): Promise<void> {
  const interval = tailIntervalMs(values.interval as string | undefined)
  if (!interval.ok) {
    process.stderr.write(`error: ${interval.error}\n`)
    process.exitCode = 1
    return
  }

  const statePath = values.state as string | undefined
  const seen = new Set<string>(statePath ? loadSeenState(statePath) : [])

  const controller = new AbortController()
  const load = async (): Promise<NeurowireFeed> => {
    const feed = await tickFeed(values, positionals)
    if (!feed) {
      controller.abort()
      throw TAIL_STOP
    }
    return feed
  }

  const ticks = pollFeed(load, {
    intervalMs: interval.value,
    seen,
    signal: controller.signal,
    onError: (error) => {
      process.stderr.write(
        `[watch] error: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    },
  })

  for await (const { fresh, feed } of ticks) {
    if (fresh.length > 0) emitFeed({ ...feed, entries: fresh }, values)
    if (fresh.length > 0) appendToJournal({ ...feed, entries: fresh }, values)
    await deliverToSinks({ ...feed, entries: fresh }, values)

    for (const entry of fresh) seen.add(entryKey(entry))
    if (statePath) writeFileSync(statePath, JSON.stringify([...seen]))

    process.stderr.write(`[watch] ${fresh.length} new (${seen.size} seen)\n`)
  }
}

/** Flags that shape a feed locally, and so have no meaning for a remote stream. */
const SHAPE_FLAGS = [
  'filter',
  'exclude',
  'sort',
  'order',
  'limit',
  'since',
  'max-age',
  'between',
] as const

/**
 * `neurowire tail`: the same poll engine as watch, printing entries one at a
 * time as they arrive rather than a feed per tick. `-f nwf` streams raw NWFJ
 * journal lines instead, and `--from` renders a remote /tail SSE stream.
 */
async function runTailCommand(values: CliValues, positionals: string[]): Promise<void> {
  const format = typeof values.format === 'string' ? values.format : undefined
  if (format !== undefined && !isFormat(format)) {
    process.stderr.write(`error: unknown format "${format}". Use one of: ${FORMATS.join(', ')}\n`)
    process.exitCode = 1
    return
  }
  const raw = format === 'nwf'
  const io = {
    out: (text: string) => {
      process.stdout.write(text)
    },
    err: (text: string) => {
      process.stderr.write(text)
    },
  }
  const journalId = typeof values.journal === 'string' ? values.journal : undefined

  const from = typeof values.from === 'string' ? values.from : undefined
  if (from) {
    // Shaping happens on the server for a remote stream, so local shape flags
    // would silently do nothing. Say so rather than pretend they applied.
    const ignored = SHAPE_FLAGS.filter((flag) => values[flag] !== undefined)
    if (ignored.length) {
      process.stderr.write(
        `warning: --from streams what the server sends, so ${ignored
          .map((flag) => `--${flag}`)
          .join(', ')} ${ignored.length === 1 ? 'is' : 'are'} ignored\n`,
      )
    }
    await runRemoteTail(from, {
      io,
      color: useColor,
      raw,
      journalId,
      onError: (error) => {
        process.stderr.write(
          `[tail] ${error instanceof Error ? error.message : String(error)}, reconnecting\n`,
        )
      },
      onEntry: async (entry) => {
        if (journalId === undefined && !(values.sink as string[] | undefined)?.length) return
        const feed: NeurowireFeed = {
          id: from,
          title: from,
          updated: entry.updated ?? entry.published ?? new Date().toISOString(),
          entries: [entry],
        }
        appendToJournal(feed, values)
        await deliverToSinks(feed, values)
      },
    })
    return
  }

  const interval = tailIntervalMs(values.interval as string | undefined)
  if (!interval.ok) {
    process.stderr.write(`error: ${interval.error}\n`)
    process.exitCode = 1
    return
  }

  const statePath = values.state as string | undefined
  const seen = new Set<string>(statePath ? loadSeenState(statePath) : [])

  process.stderr.write(`[tail] polling every ${Math.round(interval.value / 1000)}s\n`)

  await runTail({
    tick: () => tickFeed(values, positionals),
    intervalMs: interval.value,
    seen,
    raw,
    journalId,
    color: useColor,
    emit: format && !raw ? (feed) => emitFeed(feed, values) : undefined,
    io,
    onFresh: async (feed) => {
      appendToJournal(feed, values)
      await deliverToSinks(feed, values)
      for (const entry of feed.entries) seen.add(entryKey(entry))
      if (statePath) writeFileSync(statePath, JSON.stringify([...seen]))
    },
  })
}

/**
 * Register taps from the optional `@neurowire/taps-pack` catalog. Each `--tap-pack`
 * value is a comma-separated list of theme keys (or "all"). If the package is not
 * installed, print an install hint and continue without it.
 */
async function registerTapPacks(values: string[]): Promise<void> {
  const keys = values.flatMap((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  if (!keys.length) return

  let pack: typeof import('@neurowire/taps-pack')
  try {
    pack = await import('@neurowire/taps-pack')
  } catch {
    process.stderr.write(
      'error: --tap-pack needs @neurowire/taps-pack. Install it: pnpm add @neurowire/taps-pack\n',
    )
    process.exitCode = 1
    return
  }

  if (keys.includes('all')) {
    await pack.registerAll()
    process.stderr.write(`Registered all ${pack.THEME_KEYS.length} taps-pack themes\n`)
    return
  }

  const valid = new Set<string>(pack.THEME_KEYS)
  let count = 0
  for (const key of keys) {
    if (!valid.has(key)) {
      process.stderr.write(`warning: unknown tap-pack theme "${key}" (skipped)\n`)
      continue
    }
    await pack.registerTheme(key as (typeof pack.THEME_KEYS)[number])
    count++
  }
  if (count) process.stderr.write(`Registered ${count} taps-pack theme(s)\n`)
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
      'tap-pack': { type: 'string', multiple: true },
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
      from: { type: 'string' },
      journal: { type: 'string' },
      'journal-dir': { type: 'string' },
      cursor: { type: 'string' },
      peers: { type: 'boolean' },
      token: { type: 'string' },
      sink: { type: 'string', multiple: true },
      name: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      all: { type: 'boolean' },
      json: { type: 'boolean' },
      url: { type: 'string' },
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

  if (positionals[0] === 'journal') {
    runJournal(positionals[1], positionals.slice(2), values)
    return
  }

  if (positionals[0] === 'sync') {
    await runSync(positionals.slice(1), values)
    return
  }

  if (positionals[0] === 'peers') {
    runPeers(positionals[1], positionals.slice(2), values)
    return
  }

  if (positionals[0] === 'tap' && positionals[1] === 'doctor') {
    await runTapDoctor(positionals[2])
    return
  }
  if (positionals[0] === 'tap') {
    await runTap(positionals[1], positionals.slice(2), values)
    return
  }
  if (positionals[0] === 'doctor') {
    await runTapDoctor(positionals[1])
    return
  }

  // Built-in taps plus any from --taps, NEUROWIRE_TAPS, or ~/.config/neurowire/taps.
  const { user } = registerAllTaps(values.taps ?? [])
  if (user.length) process.stderr.write(`Loaded ${user.length} custom tap(s)\n`)

  // Optional: register taps from @neurowire/taps-pack themes via --tap-pack.
  if (values['tap-pack']?.length) await registerTapPacks(values['tap-pack'])

  if (positionals[0] === 'tail') {
    await runTailCommand(values, positionals.slice(1))
    return
  }

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
    const flat = flattenConstruct(refinedConstruct)
    appendToJournal(flat, values)
    await deliverToSinks(flat, values)
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
    appendToJournal(feed, values)
    await deliverToSinks(feed, values)
    return
  }

  renderTerminal(feed)
  appendToJournal(feed, values)
  await deliverToSinks(feed, values)
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
