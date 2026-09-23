import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  type Construct,
  FORMATS,
  FeedSchema,
  type JournalCursor,
  type Mesh,
  type NeurowireFeed,
  PublicConstructSchema,
  PublicMeshSchema,
  filterEntries,
  isConstructRef,
  journalToFeed,
  selectEntries,
  serialize,
} from '@neurowire/core'
import {
  FeedTemplateSchema,
  type JournalStore,
  type RawDocument,
  fetchConstruct,
  fetchDocument,
  fetchFeed,
  fetchMesh,
  findTemplate,
  flattenConstruct,
  listTemplates,
  openJournalStore,
  proposeTemplate,
} from '@neurowire/ingest'
import { verifyTemplate } from '@neurowire/tap-wizard'
import { z } from 'zod'
import { ToolError, assertAllowed } from './allow'
import { type Catalog, createCatalog } from './catalog'
import { type DocsIndex, createDocsIndex, fetchDocsIndex } from './docs-search'
import {
  MAX_LIMIT,
  buildRefinement,
  clampLimit,
  describeError,
  errorResult,
  feedResult,
  summarize,
  textResult,
} from './shape'

export const SERVER_NAME = 'neurowire'
export const SERVER_VERSION = '0.1.0'

/** Everything the server touches outside itself. Each has a real default; tests inject fakes. */
export interface ServerDeps {
  fetchFeed?: (url: string) => Promise<NeurowireFeed>
  fetchMesh?: (mesh: Mesh) => Promise<NeurowireFeed>
  fetchConstruct?: typeof fetchConstruct
  fetchDocument?: (url: string, validate: (url: string) => void) => Promise<RawDocument>
  /** Opened lazily, on the first journal tool call. */
  journals?: () => JournalStore
  catalog?: Catalog
  docs?: DocsIndex
  /** Host allowlist for caller-supplied URLs. `undefined` allows every host. */
  allow?: string[]
  now?: () => number
}

const INSTRUCTIONS = [
  'Neurowire turns blogs, sites, RSS, Atom, and JSON Feed sources into clean feeds.',
  'Entry tools return NWF by default, the most token-efficient format, and every result opens with a one-line summary.',
  'To follow a journal over time, call whats_new and store the cursor it returns; pass it back next time to get only what arrived since.',
  'propose_tap drafts a tap for a page with no feed; a draft only counts once verify_tap passes it. Nothing is ever installed.',
].join(' ')

const formatShape = z
  .enum(FORMATS)
  .optional()
  .describe('Output format. Default nwf (most compact); json is JSON Feed 1.1.')
const limitShape = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(`Most entries to return. Default 30, values above ${MAX_LIMIT} are clamped.`)
const refineShape = {
  include: z
    .array(z.string())
    .optional()
    .describe(
      'Keep entries matching any rule, as field:pattern (fields: title, summary, source, author, tag). Wrap the pattern in /slashes/ for a regex.',
    ),
  exclude: z.array(z.string()).optional().describe('Drop entries matching any field:pattern rule.'),
  since: z.string().optional().describe('Only entries within this duration, e.g. 24h, 90m, 7d.'),
  today: z.boolean().optional().describe('Only entries since midnight UTC today.'),
  thisWeek: z.boolean().optional().describe('Only entries since Monday 00:00 UTC.'),
  between: z.string().optional().describe('An explicit window, <start>..<end> as ISO dates.'),
  sort: z.enum(['date', 'title', 'source']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
}
const readOnly = { readOnlyHint: true, openWorldHint: true } as const

/** Run a handler, turning anything it throws into a descriptive tool error. */
async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run()
  } catch (error) {
    return errorResult(describeError(error))
  }
}

function formatCursor(cursor: JournalCursor): string {
  return cursor.hash ? `${cursor.seq}.${cursor.hash}` : String(cursor.seq)
}

function parseCursor(value: string): JournalCursor {
  const dot = value.indexOf('.')
  const head = dot === -1 ? value : value.slice(0, dot)
  if (!/^\d+$/.test(head)) {
    throw new ToolError(`invalid cursor "${value}": pass the cursor whats_new returned`)
  }
  return dot === -1 ? { seq: Number(head) } : { seq: Number(head), hash: value.slice(dot + 1) }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/**
 * Build the Neurowire MCP server. Pure: it registers tools and resources but
 * connects no transport, so tests drive it over an in-memory pair and the bin
 * attaches stdio.
 */
export function createServer(deps: ServerDeps = {}): McpServer {
  const allow = deps.allow
  const now = deps.now ?? Date.now
  const catalog = deps.catalog ?? createCatalog()
  const docs = deps.docs ?? createDocsIndex(() => fetchDocsIndex())
  const loadFeed = deps.fetchFeed ?? ((url: string) => fetchFeed(url))
  const loadMesh = deps.fetchMesh ?? ((mesh: Mesh) => fetchMesh(mesh))
  const loadConstruct = deps.fetchConstruct ?? fetchConstruct
  const loadDocument =
    deps.fetchDocument ??
    ((url: string, validate: (url: string) => void) => fetchDocument(url, { validate }))
  let store: JournalStore | undefined
  const journals = () => {
    store ??= (deps.journals ?? (() => openJournalStore()))()
    return store
  }
  const checkUrl = (url: string) => assertAllowed(url, allow)

  async function namedMesh(name: string): Promise<Mesh> {
    const mesh = await catalog.mesh(name)
    if (!mesh) {
      throw new ToolError(`no mesh named "${name}". Available: ${catalog.meshNames().join(', ')}`)
    }
    return mesh
  }

  function namedConstruct(name: string): Construct {
    const construct = catalog.construct(name)
    if (!construct) {
      throw new ToolError(
        `no construct named "${name}". Available: ${catalog.constructNames().join(', ')}`,
      )
    }
    return construct
  }

  /** Resolve `{ ref }` members through the catalog, so refs can name taps-pack themes too. */
  async function inlineRefs(construct: Construct): Promise<Construct> {
    const meshes = await Promise.all(
      construct.meshes.map((member) =>
        isConstructRef(member) ? namedMesh(member.ref) : Promise.resolve(member),
      ),
    )
    return { ...construct, meshes }
  }

  function checkMeshSources(mesh: Mesh): void {
    for (const source of mesh.sources) checkUrl(source.url)
  }

  async function loadTarget(target: {
    url?: string
    mesh?: string
    construct?: string
  }): Promise<NeurowireFeed> {
    const given = [target.url, target.mesh, target.construct].filter((v) => v !== undefined)
    if (given.length !== 1) {
      throw new ToolError('pass exactly one of url, mesh, or construct')
    }
    if (target.url !== undefined) {
      checkUrl(target.url)
      return loadFeed(target.url)
    }
    if (target.mesh !== undefined) return loadMesh(await namedMesh(target.mesh))
    const construct = await inlineRefs(namedConstruct(target.construct as string))
    return flattenConstruct(await loadConstruct(construct))
  }

  function journalExists(id: string): void {
    const ids = journals().list()
    if (!ids.includes(id)) {
      throw new ToolError(
        `no journal named "${id}". Available: ${ids.length ? ids.join(', ') : '(none yet)'}`,
      )
    }
  }

  function journalFeed(id: string, entries: NeurowireFeed['entries']): NeurowireFeed {
    return journalToFeed(
      {
        records: entries.map((entry, index) => ({ seq: index + 1, entry })),
        head: journals().head(id),
        issues: [],
      },
      { id, title: id },
    )
  }

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  )

  // ---------- feeds ----------

  server.registerTool(
    'ingest_source',
    {
      title: 'Ingest a source',
      description:
        'Fetch any feed (RSS, Atom, RDF, JSON Feed) or an HTML listing page (via a registered tap or auto-detect) and return it as a clean feed.',
      inputSchema: {
        url: z.string().describe('The page or feed URL.'),
        format: formatShape,
        limit: limitShape,
      },
      annotations: readOnly,
    },
    ({ url, format, limit }) =>
      guard(async () => {
        checkUrl(url)
        return feedResult(await loadFeed(url), format ?? 'nwf', limit)
      }),
  )

  server.registerTool(
    'serialize',
    {
      title: 'Serialize a feed',
      description:
        'Convert a feed in the canonical model (JSON) to NWF, Atom, RSS, JSON Feed, or Markdown. No network.',
      inputSchema: {
        feed: FeedSchema.describe('A feed in the canonical Neurowire model.'),
        format: z.enum(FORMATS).describe('Target format.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ feed, format }) => guard(async () => textResult(serialize(feed, format))),
  )

  server.registerTool(
    'fetch_mesh',
    {
      title: 'Fetch a mesh',
      description:
        'Fetch a mesh (many sources merged, tagged by source, deduped, newest first). Pass a configured mesh name (see the neurowire://mesh resources; taps-pack theme keys work too) or an inline list of sources.',
      inputSchema: {
        name: z.string().optional().describe('A named mesh, e.g. ai-news.'),
        // Public schema: tool inputs are untrusted, so per-source headers are dropped.
        sources: PublicMeshSchema.shape.sources
          .optional()
          .describe('Inline sources: [{ name, url }].'),
        format: formatShape,
        limit: limitShape,
      },
      annotations: readOnly,
    },
    ({ name, sources, format, limit }) =>
      guard(async () => {
        if ((name === undefined) === (sources === undefined)) {
          throw new ToolError('pass exactly one of name or sources')
        }
        let mesh: Mesh
        if (name !== undefined) {
          mesh = await namedMesh(name)
        } else {
          mesh = { name: 'inline', sources: sources ?? [] }
          checkMeshSources(mesh)
        }
        return feedResult(await loadMesh(mesh), format ?? 'nwf', limit)
      }),
  )

  server.registerTool(
    'fetch_construct',
    {
      title: 'Fetch a construct',
      description:
        'Fetch a construct (a bundle of meshes). Returns one summary line per mesh, then the flattened entries.',
      inputSchema: {
        name: z.string().optional().describe('A named construct, e.g. daily.'),
        construct: PublicConstructSchema.optional().describe(
          'An inline construct: { name, meshes }.',
        ),
        format: formatShape,
        limit: limitShape,
      },
      annotations: readOnly,
    },
    ({ name, construct, format, limit }) =>
      guard(async () => {
        if ((name === undefined) === (construct === undefined)) {
          throw new ToolError('pass exactly one of name or construct')
        }
        const base = name !== undefined ? namedConstruct(name) : (construct as Construct)
        const resolved = await inlineRefs(base)
        if (name === undefined) {
          for (const member of resolved.meshes) {
            if (!isConstructRef(member)) checkMeshSources(member)
          }
        }
        const fetched = await loadConstruct(resolved)
        const groups = fetched.parts.map((part) => `- ${part.mesh.name}: ${summarize(part.feed)}`)
        return feedResult(flattenConstruct(fetched), format ?? 'nwf', limit, groups)
      }),
  )

  server.registerTool(
    'query',
    {
      title: 'Query a feed, mesh, or construct',
      description:
        'Fetch one target (exactly one of url, mesh, construct) and filter, window, sort, and limit its entries. Same semantics as the CLI flags.',
      inputSchema: {
        url: z.string().optional(),
        mesh: z.string().optional().describe('A named mesh.'),
        construct: z.string().optional().describe('A named construct.'),
        ...refineShape,
        format: formatShape,
        limit: limitShape,
      },
      annotations: readOnly,
    },
    (input) =>
      guard(async () => {
        const { filter, select } = buildRefinement(input, now())
        let feed = await loadTarget(input)
        if (filter) feed = filterEntries(feed, filter)
        feed = selectEntries(feed, select)
        return feedResult(feed, input.format ?? 'nwf', input.limit)
      }),
  )

  // ---------- journals ----------

  server.registerTool(
    'query_journal',
    {
      title: 'Query a journal',
      description:
        'Search an append-only journal (the archived history of a feed) with filters and a time window. Reads local disk only.',
      inputSchema: {
        id: z.string().describe('The journal id.'),
        ...refineShape,
        format: formatShape,
        limit: limitShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) =>
      guard(async () => {
        journalExists(input.id)
        const { filter, select } = buildRefinement(input, now())
        const result = journals().query(input.id, filter ? { ...select, filter } : select)
        const notes = [
          `scanned ${result.scanned.length} segment(s), skipped ${result.skipped.length}`,
        ]
        return feedResult(
          journalFeed(input.id, result.entries),
          input.format ?? 'nwf',
          input.limit,
          notes,
        )
      }),
  )

  server.registerTool(
    'whats_new',
    {
      title: "What's new in a journal",
      description:
        'Return entries that arrived in a journal since a cursor, plus the next cursor. Store the returned cursor and pass it on the next call to get exactly the delta. Without a cursor, returns the latest entries and the current head.',
      inputSchema: {
        journal: z.string().describe('The journal id.'),
        cursor: z.string().optional().describe('The cursor a previous whats_new call returned.'),
        format: formatShape,
        limit: limitShape,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ journal, cursor, format, limit }) =>
      guard(async () => {
        journalExists(journal)
        const cap = clampLimit(limit)
        const store = journals()

        if (cursor === undefined) {
          const head = store.head(journal)
          const records = store.read(journal).slice(-cap)
          const feed = journalFeed(
            journal,
            records.map((record) => record.entry),
          )
          return feedResult(feed, format ?? 'nwf', cap, [`cursor: ${formatCursor(head)}`])
        }

        const result = store.since(journal, parseCursor(cursor))
        const notes: string[] = []
        if (result.tooOld) {
          notes.push(
            'warning: the cursor is older than the oldest retained entry, so this delta is incomplete',
          )
        }
        const taken = result.records.slice(0, cap)
        const truncated = result.records.length > cap
        const last = taken[taken.length - 1]
        const next = truncated && last ? String(last.seq) : formatCursor(result.head)
        notes.unshift(`cursor: ${next}${truncated ? ' (more waiting, call again with it)' : ''}`)
        const feed = journalFeed(
          journal,
          taken.map((record) => record.entry),
        )
        return feedResult(feed, format ?? 'nwf', cap, notes)
      }),
  )

  // ---------- taps ----------

  server.registerTool(
    'list_taps',
    {
      title: 'List taps',
      description:
        'List the hosts this server can already read through a registered tap (a site with no feed).',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () =>
      guard(async () => {
        const hosts = listTemplates()
          .map((tap) => tap.host)
          .filter((host): host is string => Boolean(host))
          .sort()
        return textResult(`${hosts.length} tap(s)\n\n${hosts.join('\n')}`)
      }),
  )

  server.registerTool(
    'resolve_tap',
    {
      title: 'Resolve a tap',
      description: 'Show the tap (CSS-selector template) registered for a host, if any.',
      inputSchema: { host: z.string().describe('A hostname, e.g. claude.com.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ host }) =>
      guard(async () => {
        const tap = findTemplate(`https://${host}/`)
        return textResult(tap ? `tap for ${host}\n\n${json(tap)}` : `no tap registered for ${host}`)
      }),
  )

  server.registerTool(
    'propose_tap',
    {
      title: 'Propose a tap',
      description:
        'Draft a tap for a listing page with no feed, and run it through the verification gate. Returns JSON only; nothing is installed. Refine the draft and call verify_tap until it passes.',
      inputSchema: { url: z.string().describe('The listing page URL.') },
      annotations: readOnly,
    },
    ({ url }) =>
      guard(async () => {
        checkUrl(url)
        const doc = await loadDocument(url, checkUrl)
        const proposal = proposeTemplate(doc.body, doc.url)
        if (!proposal) {
          return textResult(
            `no repeating item structure found on ${doc.url}. Write a template by hand and call verify_tap.`,
          )
        }
        const report = await verifyTemplate(doc, proposal.template)
        const verdict = report.ok ? 'passes' : 'does not pass'
        return textResult(
          `draft ${verdict} the gate (score ${report.score.toFixed(2)}, ${report.matched} items). Nothing was installed.\n\n${json({ ...proposal, verify: report })}`,
        )
      }),
  )

  server.registerTool(
    'verify_tap',
    {
      title: 'Verify a tap',
      description:
        'Run a candidate tap against the live page through the deterministic gate: item count, titles, unique resolvable links, date rate, and a nav/footer probe. The gate decides; a template that fails is rejected.',
      inputSchema: {
        url: z.string().describe('The listing page URL.'),
        template: FeedTemplateSchema.describe('The candidate template.'),
      },
      annotations: readOnly,
    },
    ({ url, template }) =>
      guard(async () => {
        checkUrl(url)
        const doc = await loadDocument(url, checkUrl)
        const report = await verifyTemplate(doc, template)
        const failed = report.checks.filter((check) => !check.ok).map((check) => check.name)
        const head = report.ok
          ? `PASSED (score ${report.score.toFixed(2)}, ${report.matched} items)`
          : `REJECTED (score ${report.score.toFixed(2)}, ${report.matched} items; failed: ${failed.join(', ') || 'threshold'})`
        return textResult(`${head}\n\n${json(report)}`)
      }),
  )

  // ---------- docs ----------

  server.registerTool(
    'search_docs',
    {
      title: 'Search the docs',
      description:
        'Search the Neurowire documentation (the published llms-full.txt) and return the best-matching sections.',
      inputSchema: {
        query: z.string().describe('What to look for, e.g. "build a mesh".'),
        limit: z
          .number()
          .int()
          .positive()
          .max(10)
          .optional()
          .describe('Sections to return, default 5.'),
      },
      annotations: readOnly,
    },
    ({ query, limit }) =>
      guard(async () => {
        const hits = await docs.search(query, limit ?? 5)
        if (!hits.length) return textResult(`no docs sections match "${query}"`)
        const body = hits
          .map((hit) => `## ${hit.title}${hit.url ? `\n${hit.url}` : ''}\n\n${hit.body}`)
          .join('\n\n---\n\n')
        return textResult(`${hits.length} section(s) for "${query}"\n\n${body}`)
      }),
  )

  // ---------- resources ----------

  server.registerResource(
    'mesh',
    new ResourceTemplate('neurowire://mesh/{name}', {
      list: async () => ({
        resources: catalog.meshNames().map((name) => ({
          uri: `neurowire://mesh/${name}`,
          name,
          mimeType: 'application/json',
        })),
      }),
    }),
    { description: 'A configured mesh: its name and sources.', mimeType: 'application/json' },
    async (uri, { name }) => {
      const mesh = await catalog.mesh(String(name))
      if (!mesh) throw new Error(`no mesh named "${name}"`)
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: json(mesh) }] }
    },
  )

  server.registerResource(
    'construct',
    new ResourceTemplate('neurowire://construct/{name}', {
      list: async () => ({
        resources: catalog.constructNames().map((name) => ({
          uri: `neurowire://construct/${name}`,
          name,
          mimeType: 'application/json',
        })),
      }),
    }),
    { description: 'A configured construct: its meshes.', mimeType: 'application/json' },
    async (uri, { name }) => {
      const construct = catalog.construct(String(name))
      if (!construct) throw new Error(`no construct named "${name}"`)
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: json(construct) }] }
    },
  )

  return server
}
