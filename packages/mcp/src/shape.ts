import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  type FilterField,
  type FilterRule,
  type FilterSpec,
  type Format,
  type NeurowireFeed,
  type SelectOptions,
  type SortKey,
  type SortOrder,
  type WindowSpec,
  parseDuration,
  resolveWindow,
  selectEntries,
  serialize,
} from '@neurowire/core'
import { ToolError } from './allow'

export const DEFAULT_LIMIT = 30
export const MAX_LIMIT = 200

const FILTER_FIELDS: readonly FilterField[] = ['title', 'summary', 'source', 'author', 'tag']

/** Default to 30, and clamp anything larger than 200 rather than rejecting it. */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)))
}

function day(value: string | undefined): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString().slice(0, 10)
}

/**
 * The one-line preamble every entry result opens with, so an agent can triage
 * without parsing: "32 entries from 5 sources, newest 2026-08-25".
 */
export function summarize(feed: NeurowireFeed, shown = feed.entries.length): string {
  const total = feed.entries.length
  const sources = new Set(feed.entries.map((entry) => entry.source?.name).filter(Boolean))
  const from = sources.size
    ? `from ${sources.size} source${sources.size === 1 ? '' : 's'}`
    : `from "${feed.title}"`
  const newest = feed.entries
    .map((entry) => day(entry.updated ?? entry.published))
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop()
  const count = `${total} entr${total === 1 ? 'y' : 'ies'}`
  const showing = shown < total ? ` (showing ${shown})` : ''
  return `${count}${showing} ${from}${newest ? `, newest ${newest}` : ''}`
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `error: ${message}` }], isError: true }
}

/** A descriptive message for any thrown value. Never a stack trace. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues
    if (Array.isArray(issues)) {
      return issues
        .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
        .join('; ')
    }
    return error.message
  }
  return String(error)
}

/**
 * Serialize a feed for an agent: cap the entries, then open with the summary
 * line and any notes before the body.
 */
export function feedResult(
  feed: NeurowireFeed,
  format: Format,
  limit: number | undefined,
  notes: string[] = [],
): CallToolResult {
  const capped = selectEntries(feed, { limit: clampLimit(limit) })
  const head = [summarize(feed, capped.entries.length), ...notes].join('\n')
  return textResult(`${head}\n\n${serialize(capped, format)}`)
}

/**
 * Parse `field:pattern` rules, the same syntax as the CLI's `--filter`. A
 * pattern wrapped in slashes is a case-insensitive regex.
 */
export function parseFilterRules(raw: string[] | undefined): FilterRule[] {
  return (raw ?? []).map((value) => {
    const colon = value.indexOf(':')
    const field = (colon === -1 ? value : value.slice(0, colon)) as FilterField
    if (!FILTER_FIELDS.includes(field)) {
      throw new ToolError(
        `bad filter "${value}". Use field:pattern with one of: ${FILTER_FIELDS.join(', ')}`,
      )
    }
    let pattern = colon === -1 ? '' : value.slice(colon + 1)
    let regex = false
    if (pattern.length >= 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
      pattern = pattern.slice(1, -1)
      regex = true
    }
    return { field, pattern, regex }
  })
}

export interface RefineInput {
  include?: string[]
  exclude?: string[]
  since?: string
  today?: boolean
  thisWeek?: boolean
  between?: string
  sort?: SortKey
  order?: SortOrder
}

/** Build the filter spec and select options a query tool applies. */
export function buildRefinement(
  input: RefineInput,
  now: number,
): { filter?: FilterSpec; select: SelectOptions } {
  const include = parseFilterRules(input.include)
  const exclude = parseFilterRules(input.exclude)
  const filter = include.length || exclude.length ? { include, exclude } : undefined

  const spec: WindowSpec = {}
  if (input.since !== undefined) {
    if (parseDuration(input.since) === undefined) {
      throw new ToolError(`invalid since "${input.since}" (use e.g. 24h, 90m, 7d)`)
    }
    spec.since = input.since
  }
  if (input.today) spec.today = true
  if (input.thisWeek) spec.thisWeek = true
  if (input.between !== undefined) {
    const parts = input.between.split('..')
    const [start, end] = parts
    if (
      parts.length !== 2 ||
      !start ||
      !end ||
      Number.isNaN(Date.parse(start)) ||
      Number.isNaN(Date.parse(end))
    ) {
      throw new ToolError('between expects <start>..<end>, e.g. 2026-01-01..2026-02-01')
    }
    spec.between = [start, end]
  }

  return {
    filter,
    select: { ...resolveWindow(spec, now), sort: input.sort, order: input.order },
  }
}
