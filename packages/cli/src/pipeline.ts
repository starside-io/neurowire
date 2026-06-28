import {
  type FilterField,
  type FilterRule,
  type FilterSpec,
  type NeurowireFeed,
  type SelectOptions,
  type SortKey,
  type SortOrder,
  type WindowSpec,
  entryKey,
  filterEntries,
  newEntries,
  parseDuration,
  resolveWindow,
  selectEntries,
} from '@neurowire/core'

export const SORT_KEYS: readonly SortKey[] = ['date', 'title', 'source']
export const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc']
export const FILTER_FIELDS: readonly FilterField[] = ['title', 'summary', 'source', 'author', 'tag']

/** Values bag produced by parseArgs, shared by the CLI helpers. */
export type CliValues = Record<string, string | string[] | boolean | undefined>

/**
 * Parse a `field:pattern` string into a filter rule. Splits on the first colon
 * only (patterns may contain colons). A pattern wrapped in slashes (`/.../`) is
 * a case-insensitive regex; otherwise it is a case-insensitive substring.
 * Returns undefined when the field is unknown.
 */
export function parseFilterRule(value: string): FilterRule | undefined {
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

/** A parse result: either a value, or the raw token that failed to parse. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; bad: string }

/** Parse a list of `field:pattern` tokens, failing on the first bad token. */
export function parseFilterRules(raw: string[]): ParseResult<FilterRule[]> {
  const rules: FilterRule[] = []
  for (const value of raw) {
    const rule = parseFilterRule(value)
    if (!rule) return { ok: false, bad: value }
    rules.push(rule)
  }
  return { ok: true, value: rules }
}

/**
 * Build the include/exclude filter spec from the parsed CLI values. Returns a
 * spec, undefined when no filter flags are present, or the bad token on error.
 */
export function buildFilterSpec(values: CliValues): ParseResult<FilterSpec | undefined> {
  const filterRaw = (values.filter as string[] | undefined) ?? []
  const excludeRaw = (values.exclude as string[] | undefined) ?? []
  if (filterRaw.length === 0 && excludeRaw.length === 0) {
    return { ok: true, value: undefined }
  }
  const include = parseFilterRules(filterRaw)
  if (!include.ok) return include
  const exclude = parseFilterRules(excludeRaw)
  if (!exclude.ok) return exclude
  return { ok: true, value: { include: include.value, exclude: exclude.value } }
}

/** Apply a filter spec to a feed (pure passthrough to core). */
export function applyFilterSpec(feed: NeurowireFeed, spec: FilterSpec): NeurowireFeed {
  return filterEntries(feed, spec)
}

/** A validation result: either a value or a human-readable error message. */
export type ValidateResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Parse and validate the --sort/--order/--limit and time-window flags into the
 * SelectOptions accepted by core's selectEntries. `now` is injected so the
 * relative windows are testable. Returns an error message on any bad flag.
 */
export function buildSelectOptions(values: CliValues, now: number): ValidateResult<SelectOptions> {
  const sort = values.sort as string | undefined
  if (sort !== undefined && !SORT_KEYS.includes(sort as SortKey)) {
    return { ok: false, error: `unknown --sort "${sort}". Use one of: ${SORT_KEYS.join(', ')}` }
  }
  const order = values.order as string | undefined
  if (order !== undefined && !SORT_ORDERS.includes(order as SortOrder)) {
    return { ok: false, error: `unknown --order "${order}". Use asc or desc` }
  }

  let limit: number | undefined
  if (values.limit !== undefined) {
    limit = Number(values.limit)
    if (!Number.isInteger(limit) || limit < 0) {
      return {
        ok: false,
        error: `--limit must be a non-negative integer (got "${values.limit as string}")`,
      }
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
      return { ok: false, error: '--between expects <start>..<end>, e.g. 2026-01-01..2026-02-01' }
    }
    spec.between = [parts[0], parts[1]]
  }

  for (const [flag, value] of [
    ['--since', spec.since],
    ['--max-age', spec.maxAge],
  ] as const) {
    if (value !== undefined && parseDuration(value) === undefined) {
      return { ok: false, error: `invalid ${flag} "${value}" (use e.g. 24h, 90m, 7d)` }
    }
  }
  if (spec.between) {
    const [a, b] = spec.between
    if (Number.isNaN(Date.parse(a)) || Number.isNaN(Date.parse(b))) {
      return {
        ok: false,
        error: '--between needs two parseable dates, e.g. 2026-01-01..2026-02-01',
      }
    }
  }

  const window = resolveWindow(spec, now)
  return {
    ok: true,
    value: {
      ...window,
      sort: sort as SortKey | undefined,
      order: order as SortOrder | undefined,
      limit,
    },
  }
}

/** Apply select options to a feed (pure passthrough to core). */
export function applySelectOptions(feed: NeurowireFeed, opts: SelectOptions): NeurowireFeed {
  return selectEntries(feed, opts)
}

/**
 * Split a feed's entries into the ones not yet in `seen`. Returns the fresh
 * entries plus the keys to add to the seen set. Pure: it does not mutate `seen`.
 */
export function partitionNew(
  feed: NeurowireFeed,
  seen: ReadonlySet<string>,
): { fresh: NeurowireFeed['entries']; keys: string[] } {
  const fresh = newEntries(feed, seen)
  return { fresh, keys: fresh.map((entry) => entryKey(entry)) }
}
