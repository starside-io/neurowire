import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  type FeedTemplate,
  FeedTemplateSchema,
  type RawDocument,
  fetchDocument,
  listTemplates,
} from '@neurowire/ingest'
import {
  type TapField,
  type TapPreview,
  type TapSession,
  type VerifyReport,
  autoComplete,
  createTapSession,
  verifyTemplate,
} from '@neurowire/tap-wizard'
import { defaultTapsDir, registerAllTaps } from '@neurowire/taps'

/** Where the walkthrough reads and writes. Injected so tests drive it without a tty. */
export interface WizardIo {
  out(text: string): void
  err(text: string): void
  /** Prompt for one line. Never called on the `--yes` path. */
  ask(prompt: string): Promise<string>
}

/** The two things these commands need from the outside world: a page, and a session. */
export interface TapWizardDeps {
  io: WizardIo
  openSession?: (url: string) => Promise<TapSession>
  loadDocument?: (url: string) => Promise<RawDocument>
}

/** How many preview rows a step shows. */
const SAMPLE_ROWS = 3

/** How many times a step re-asks after unusable input before giving up. */
const MAX_RETRIES = 3

/**
 * Hosts registered as documentation rather than as real taps. The ingest registry
 * ships `example-blog.test` to show the shape of a template; checking it would fail
 * every run and make `tap check --all` useless in CI.
 */
const PLACEHOLDER_HOSTS = new Set(['example-blog.test'])

/** A tap plus where it came from and which page to check it against. */
export interface TapEntry {
  template: FeedTemplate
  /** The listing page to check, from the file's optional `url` hint. */
  url?: string
  /** The file this tap was read from, or "registry" for a registered one. */
  source: string
}

/**
 * A tap's health, as reported by `tap check`. `unknown` is the honest answer for a
 * tap that names no page: guessing `https://<host>/` would report a working tap for
 * `example.com/blog` as broken, which is worse than saying nothing.
 */
export type TapHealth = 'healthy' | 'degraded' | 'broken' | 'unknown'

export interface TapCheckResult {
  host?: string
  url?: string
  source: string
  health: TapHealth
  matched: number
  score: number
  checks: VerifyReport['checks']
}

/** What the user typed at a step. */
export type Choice =
  | { kind: 'pick'; selector: string }
  | { kind: 'skip' }
  | { kind: 'invalid'; message: string }

/**
 * Read one step answer: a number accepts that candidate, blank skips an optional
 * field (or takes the top candidate for a required one), and anything else is
 * taken verbatim as a hand-written selector.
 */
export function parseChoice(input: string, candidates: string[], required: boolean): Choice {
  const value = input.trim()

  if (!value) {
    if (!required) return { kind: 'skip' }
    const top = candidates[0]
    if (top) return { kind: 'pick', selector: top }
    return { kind: 'invalid', message: 'this field is required, type a selector' }
  }

  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1
    const picked = candidates[index]
    if (!picked) {
      return { kind: 'invalid', message: `no candidate ${value}, pick 1 to ${candidates.length}` }
    }
    return { kind: 'pick', selector: picked }
  }

  return { kind: 'pick', selector: value }
}

/** The numbered candidate list for a step, one selector per line. */
export function renderCandidates(candidates: string[]): string {
  if (!candidates.length) return '    (no suggestion, type a selector)'
  return candidates.map((selector, i) => `    ${i + 1}) ${selector}`).join('\n')
}

/** A few extracted rows, so a pick can be eyeballed before the next step. */
export function renderPreview(preview: TapPreview, limit = SAMPLE_ROWS): string {
  if (preview.error) return `    preview  ${preview.error}`
  if (!preview.entries.length) return `    preview  ${preview.matched} match(es), no rows yet`
  return preview.entries
    .slice(0, limit)
    .map((entry, i) => `    ${i === 0 ? 'preview ' : '        '} ${entry.title}  ${entry.link}`)
    .join('\n')
}

/** The verification summary line plus a line per failed check. */
export function renderVerify(report: VerifyReport): string {
  const summary = report.checks
    .map((check) => `${check.name} ${check.detail ?? (check.ok ? 'ok' : 'failed')}`)
    .join(' · ')
  const lines = [`  verify  ${report.matched} items · ${summary}`]
  if (!report.ok) {
    for (const check of report.checks.filter((c) => !c.ok)) {
      lines.push(`  failed  ${check.name}: ${check.detail ?? 'failed'}`)
    }
  }
  return lines.join('\n')
}

/** Healthy is a clean sweep, degraded passed the gate with a soft failure, broken did not pass. */
export function classify(report: VerifyReport): TapHealth {
  if (!report.ok) return 'broken'
  return report.score >= 1 ? 'healthy' : 'degraded'
}

/** The file a tap is saved as: `<host>.json`, or `tap.json` when the host is unknown. */
export function tapFilename(template: FeedTemplate, url: string): string {
  let host = template.host
  if (!host) {
    try {
      host = new URL(url).hostname || undefined
    } catch {
      host = undefined
    }
  }
  return `${(host ?? 'tap').replace(/[^a-z0-9.-]/gi, '-')}.json`
}

/** Serialize a tap the way the drop-in directory expects it. */
function tapJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Keep the file about to be replaced as `<path>.bak`, once. A second run would
 * otherwise overwrite the backup with the first run's output, losing the hand-written
 * original, which is the one file worth keeping. Returns the backup path, if made.
 */
function backup(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const target = `${path}.bak`
  if (existsSync(target)) return undefined
  copyFileSync(path, target)
  return target
}

/** Write a tap file, creating the drop-in directory when it does not exist yet. */
function writeTap(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, tapJson(value))
}

/**
 * Read tap files WITHOUT dropping unknown keys, so an optional `url` hint (the
 * listing page `tap check` should fetch) survives. The template itself still goes
 * through the schema, so an invalid tap fails here exactly as it would on load.
 */
export function loadTapEntries(pathOrDir: string): TapEntry[] {
  const files = statSync(pathOrDir).isDirectory()
    ? readdirSync(pathOrDir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => join(pathOrDir, name))
    : [pathOrDir]

  const entries: TapEntry[] = []
  for (const file of files) {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const items: unknown[] = Array.isArray(data) ? data : [data]
    for (const item of items) {
      const template = FeedTemplateSchema.parse(item)
      const hint = (item as { url?: unknown }).url
      entries.push({
        template,
        url: typeof hint === 'string' ? hint : undefined,
        source: file,
      })
    }
  }
  return entries
}

/**
 * The page a tap is checked against: an explicit `--url`, else the file's `url` hint.
 * A tap's `host` is deliberately NOT turned into a page: most listing pages live at a
 * path (`example.com/blog`), so fetching the apex would report a healthy tap as broken.
 */
export function checkUrlFor(entry: TapEntry, override?: string): string | undefined {
  return override || entry.url
}

/**
 * Taps from the user's own files (the drop-in directory, `NEUROWIRE_TAPS`, and any
 * `--taps` path), read raw so their `url` hints survive. A missing default directory
 * is ignored, exactly as `registerAllTaps` ignores it.
 */
function userTapEntries(extraPaths: string[]): TapEntry[] {
  const fromEnv = (process.env.NEUROWIRE_TAPS ?? '')
    .split(/[:,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  const entries: TapEntry[] = []
  for (const path of [defaultTapsDir(), ...fromEnv, ...extraPaths]) {
    if (!existsSync(path)) continue
    entries.push(...loadTapEntries(path))
  }
  return entries
}

/** Whether a field selector still pulls something out of the page. */
async function fieldWorks(session: TapSession, field: TapField, value: string): Promise<boolean> {
  if (!value) return false
  const preview = await session.choose(field, value)
  if (preview.error || preview.matched === 0) return false
  if (field === 'item') return true
  if (field === 'tags') return preview.entries.some((entry) => entry.tags.length > 0)
  if (field === 'link') return preview.entries.some((entry) => Boolean(entry.link))
  if (field === 'title') return preview.entries.some((entry) => Boolean(entry.title))
  if (field === 'date') return preview.entries.some((entry) => Boolean(entry.date))
  if (field === 'author') return preview.entries.some((entry) => Boolean(entry.author))
  return preview.entries.some((entry) => Boolean(entry.summary))
}

/**
 * Ask one step until the answer is usable, then record it.
 *
 * "Usable" means the pick actually extracts something: a typo in step one otherwise
 * only surfaces at the verification gate, after six more answers that are then thrown
 * away. The last attempt is recorded either way, so a deliberate selector the preview
 * cannot show still goes through. Returns false when nothing usable was offered.
 */
async function askStep(
  session: TapSession,
  field: TapField,
  required: boolean,
  io: WizardIo,
): Promise<boolean> {
  const candidates = session.candidates(field)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const last = attempt === MAX_RETRIES - 1
    const choice = parseChoice(await io.ask('  > '), candidates, required)
    if (choice.kind === 'invalid') {
      io.err(`  ${choice.message}\n`)
      continue
    }
    if (choice.kind === 'skip') {
      await session.choose(field, '')
      return true
    }

    const preview = await session.choose(field, choice.selector)
    io.out(`${renderPreview(preview)}\n`)
    if (preview.error || preview.matched === 0) {
      if (last) return true
      io.err(`  ${choice.selector} pulls nothing off this page, try another\n`)
      continue
    }
    return true
  }
  return false
}

export interface WizardOptions {
  /** Accept every top candidate without prompting. */
  yes?: boolean
  /** Where to write the tap. Defaults to the drop-in directory. */
  out?: string
}

/**
 * Walk a page into a verified tap.
 *
 * One fetch opens the session; every step re-applies against the held document. The
 * template is written only after {@link verifyTemplate} passes, on the `--yes` path
 * exactly as on the interactive one. Returns a process exit code.
 */
export async function runTapWizard(
  url: string | undefined,
  options: WizardOptions,
  deps: TapWizardDeps,
): Promise<number> {
  const { io } = deps
  if (!url) {
    io.err('error: tap wizard needs a url\n\nUsage: neurowire tap wizard <url> [-o file] [--yes]\n')
    return 1
  }

  const open =
    deps.openSession ?? (async (target: string) => createTapSession(await fetchDocument(target)))
  const session = await open(url)

  if (options.yes) {
    const preview = await autoComplete(session)
    for (const step of session.steps) {
      const chosen = session.template[step.field]
      if (chosen) io.out(`  ${step.label.padEnd(14)} ${chosen}\n`)
    }
    io.out(`${renderPreview(preview)}\n`)
  } else {
    const total = session.steps.length
    for (const [index, step] of session.steps.entries()) {
      const candidates = session.candidates(step.field)
      const flag = step.required ? 'required' : 'optional, Enter to skip'
      io.out(`\n  step ${index + 1}/${total}  ${step.label}  (${flag})\n`)
      io.out(`  ${step.hint}\n`)
      io.out(`${renderCandidates(candidates)}\n`)
      if (!(await askStep(session, step.field, step.required, io))) {
        io.err('error: gave up on that step, nothing was written\n')
        return 1
      }
    }
  }

  const report = await session.verify()
  io.out(`${renderVerify(report)}\n`)
  if (!report.ok) {
    io.err('error: this template did not pass verification, nothing was written\n')
    return 1
  }

  const template = session.template
  const path = options.out ?? join(defaultTapsDir(), tapFilename(template, url))
  const kept = backup(path)
  writeTap(path, { ...template, url })
  io.out(`  wrote   ${path}${kept ? ` (previous kept as ${kept})` : ''}\n`)
  return 0
}

export interface CheckOptions {
  /** Check every registered tap instead of a file. */
  all?: boolean
  json?: boolean
  /** Force the page to check against, instead of each tap's own `url` hint. */
  url?: string
  /** Extra tap paths to register with `--all` (the CLI's `--taps` flag). */
  tapPaths?: string[]
}

/** Check one tap against its live page. Never throws: a failed fetch is a broken tap. */
async function checkOne(
  entry: TapEntry,
  options: CheckOptions,
  load: (url: string) => Promise<RawDocument>,
): Promise<TapCheckResult> {
  const url = checkUrlFor(entry, options.url)
  const base = { host: entry.template.host, url, source: entry.source }
  if (!url) {
    return {
      ...base,
      health: 'unknown',
      matched: 0,
      score: 0,
      checks: [
        {
          name: 'url',
          ok: false,
          detail: 'no page to check, add a "url" key to the tap or pass --url',
        },
      ],
    }
  }

  let doc: RawDocument
  try {
    doc = await load(url)
  } catch (error) {
    return {
      ...base,
      health: 'broken',
      matched: 0,
      score: 0,
      checks: [
        {
          name: 'fetch',
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  const report = await verifyTemplate(doc, entry.template)
  return {
    ...base,
    health: classify(report),
    matched: report.matched,
    score: report.score,
    checks: report.checks,
  }
}

/** How many results carry each health, for the summary line and the `--json` shape. */
function tally(results: TapCheckResult[]): Record<TapHealth, number> {
  return {
    healthy: results.filter((r) => r.health === 'healthy').length,
    degraded: results.filter((r) => r.health === 'degraded').length,
    broken: results.filter((r) => r.health === 'broken').length,
    unknown: results.filter((r) => r.health === 'unknown').length,
  }
}

/** The human table `tap check` prints: one line per tap, plus the failed checks under it. */
export function renderCheckTable(results: TapCheckResult[]): string {
  const lines: string[] = []
  for (const result of results) {
    const name = result.host ?? result.url ?? result.source
    lines.push(`  ${result.health.padEnd(9)} ${name}  (${result.matched} items)`)
    if (result.health !== 'healthy') {
      for (const check of result.checks.filter((c) => !c.ok)) {
        lines.push(`             ${check.name}: ${check.detail ?? 'failed'}`)
      }
    }
  }
  const counts = tally(results)
  lines.push(
    `  ${results.length} tap(s): ${counts.healthy} healthy, ${counts.degraded} degraded, ` +
      `${counts.broken} broken, ${counts.unknown} unknown`,
  )
  return lines.join('\n')
}

/**
 * Check that taps still match the pages they were written for. Deterministic and
 * network-cheap (one fetch per tap), so it belongs in CI: it exits non-zero the day
 * a site redesign breaks a tap, instead of letting the feed quietly go empty.
 */
export async function runTapCheck(
  target: string | undefined,
  options: CheckOptions,
  deps: TapWizardDeps,
): Promise<number> {
  const { io } = deps
  const load = deps.loadDocument ?? ((url: string) => fetchDocument(url))

  let entries: TapEntry[]
  if (options.all) {
    const extraPaths = options.tapPaths ?? []
    registerAllTaps(extraPaths)
    // The registry validates templates through the schema, which drops the `url`
    // hint, so read the user's own files again to put each tap's page back.
    const hints = new Map<string, string>()
    for (const entry of userTapEntries(extraPaths)) {
      if (entry.template.host && entry.url) hints.set(entry.template.host, entry.url)
    }
    entries = listTemplates()
      .filter((template) => !PLACEHOLDER_HOSTS.has(template.host ?? ''))
      .map((template) => ({
        template,
        url: template.host ? hints.get(template.host) : undefined,
        source: 'registry',
      }))
  } else if (target) {
    entries = loadTapEntries(target)
  } else {
    io.err(
      'error: tap check needs a path or --all\n\n' +
        'Usage: neurowire tap check [path] [--all] [--json] [--url <page>]\n',
    )
    return 1
  }

  if (!entries.length) {
    io.err('error: no taps to check\n')
    return 1
  }

  const results: TapCheckResult[] = []
  for (const entry of entries) {
    results.push(await checkOne(entry, options, load))
  }

  if (options.json) {
    io.out(
      `${JSON.stringify({ checked: results.length, ...tally(results), taps: results }, null, 2)}\n`,
    )
  } else {
    io.out(`${renderCheckTable(results)}\n`)
  }

  return results.some((result) => result.health === 'broken') ? 1 : 0
}

export interface HealOptions {
  yes?: boolean
  /** Force the page to heal against, instead of the hint or `https://<host>/`. */
  url?: string
}

/** A file under `node_modules` is someone else's code: print the diff, never write it. */
function isVendored(path: string): boolean {
  return path.split(/[\\/]/).includes('node_modules')
}

/**
 * Re-author a tap against the page as it stands today.
 *
 * Every field of the old template is re-applied first, so fields that still match
 * are kept verbatim and only the broken ones are walked. The result goes through the
 * same gate as the wizard, and the previous file is kept as `<path>.bak`.
 */
export async function runTapHeal(
  path: string | undefined,
  options: HealOptions,
  deps: TapWizardDeps,
): Promise<number> {
  const { io } = deps
  if (!path) {
    io.err('error: tap heal needs a tap file\n\nUsage: neurowire tap heal <path> [--yes]\n')
    return 1
  }

  const entries = loadTapEntries(path)
  const entry = entries[0]
  if (!entry) {
    io.err(`error: ${path} holds no taps\n`)
    return 1
  }
  if (entries.length > 1) {
    io.err(`error: ${path} holds ${entries.length} taps, heal one tap per file\n`)
    return 1
  }

  const url = checkUrlFor(entry, options.url)
  if (!url) {
    io.err('error: this tap has no host and no url hint, pass --url <page>\n')
    return 1
  }

  const load = deps.loadDocument ?? ((target: string) => fetchDocument(target))
  const doc = await load(url)

  const before = await verifyTemplate(doc, entry.template)
  io.out(`  the tap as it stands against ${url}:\n${renderVerify(before)}\n`)
  if (before.ok) {
    io.out('  nothing to heal, this tap still matches\n')
    return 0
  }

  const session = createTapSession(doc)
  for (const step of session.steps) {
    const old = entry.template[step.field]
    // Healing repairs the tap it was given, it does not grow it: a field the tap
    // never claimed stays unclaimed.
    if (!old && !step.required) continue
    if (old && (await fieldWorks(session, step.field, old))) {
      io.out(`  keep    ${step.label.padEnd(14)} ${old}\n`)
      continue
    }

    const candidates = session.candidates(step.field)
    io.out(`\n  broken  ${step.label}  ${old ? `(was ${old})` : '(was unset)'}\n`)
    io.out(`${renderCandidates(candidates)}\n`)

    if (options.yes) {
      const top = candidates[0] ?? ''
      await session.choose(step.field, top)
      io.out(`  picked  ${top || '(skipped)'}\n`)
      continue
    }
    if (!(await askStep(session, step.field, step.required, io))) {
      io.err('error: gave up on that step, nothing was written\n')
      return 1
    }
  }

  const after = await session.verify()
  io.out(`${renderVerify(after)}\n`)
  if (!after.ok) {
    io.err('error: the healed template did not pass verification, nothing was written\n')
    return 1
  }

  // The selectors are the thing that rotted. The tap's identity (which host it is
  // for, what the feed is called) is the author's, so it survives the heal.
  const healed = { ...session.template, url }
  if (entry.template.host) healed.host = entry.template.host
  if (entry.template.feedTitle) healed.feedTitle = entry.template.feedTitle

  if (isVendored(entry.source)) {
    io.out('  vendored tap, not writing. The proposed replacement:\n')
    io.out(tapJson(healed))
    return 0
  }

  const kept = backup(entry.source)
  writeTap(entry.source, healed)
  io.out(`  wrote   ${entry.source}${kept ? ` (previous kept as ${kept})` : ''}\n`)
  return 0
}
