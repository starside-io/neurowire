/** The docs site, used to make the index's page paths absolute. */
export const DOCS_ORIGIN = 'https://neurowire.starside.io'

/** The flattened docs the site publishes through the llms.txt plugin. */
export const DOCS_INDEX_URL = `${DOCS_ORIGIN}/llms-full.txt`

export interface DocSection {
  /** The heading the section starts at. */
  title: string
  /** The page the section came from, when the index names it. */
  url?: string
  body: string
}

/**
 * Split a flattened docs file into heading-led sections. A `url:` line (the
 * per-page frontmatter the plugin writes) tags every section that follows it
 * until the next one.
 */
export function splitSections(text: string): DocSection[] {
  const sections: DocSection[] = []
  let url: string | undefined
  let current: DocSection | undefined
  let fenced = false

  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced
    const urlMatch = fenced ? null : /^url:\s*(\S+)\s*$/.exec(line)
    if (urlMatch?.[1]) {
      url = new URL(urlMatch[1], DOCS_ORIGIN).toString()
      continue
    }
    const heading = fenced ? null : /^#{1,3}\s+(.+)$/.exec(line)
    if (heading?.[1]) {
      current = { title: heading[1].trim(), url, body: '' }
      sections.push(current)
      continue
    }
    if (current) current.body += `${line}\n`
  }
  for (const section of sections) section.body = section.body.trim()
  return sections.filter((section) => section.body)
}

/** Rank sections by query-term hits, weighting title hits. Returns the best `limit`. */
export function searchSections(sections: DocSection[], query: string, limit: number): DocSection[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 1)
  if (!terms.length) return []

  const scored = sections.map((section) => {
    const title = section.title.toLowerCase()
    const body = section.body.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (title.includes(term)) score += 5
      score += body.split(term).length - 1
    }
    return { section, score }
  })
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.section)
}

export interface DocsIndex {
  search(query: string, limit: number): Promise<DocSection[]>
}

/**
 * A docs index over a loader (the network fetch in production, a string in
 * tests). The load is cached once it succeeds; a failed load is retried on the
 * next search rather than cached.
 */
export function createDocsIndex(load: () => Promise<string>): DocsIndex {
  let sections: Promise<DocSection[]> | undefined
  return {
    async search(query, limit) {
      sections ??= load().then(splitSections)
      try {
        return searchSections(await sections, query, limit)
      } catch (error) {
        sections = undefined
        throw error
      }
    },
  }
}

/** Load the published docs index over the network. */
export async function fetchDocsIndex(url = DOCS_INDEX_URL): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`docs index returned HTTP ${response.status}`)
  return response.text()
}
