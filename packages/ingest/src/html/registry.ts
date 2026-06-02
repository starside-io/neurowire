import { type FeedTemplate, FeedTemplateSchema } from './template'

const registry = new Map<string, FeedTemplate>()

/** Register a per-host template. Validated with zod; ignored if it has no `host`. */
export function registerTemplate(template: FeedTemplate): void {
  const parsed = FeedTemplateSchema.parse(template)
  if (parsed.host) registry.set(parsed.host, parsed)
}

/** Look up a template for a URL's hostname. */
export function findTemplate(url: string): FeedTemplate | undefined {
  try {
    return registry.get(new URL(url).hostname)
  } catch {
    return undefined
  }
}

export function listTemplates(): FeedTemplate[] {
  return [...registry.values()]
}

// Built-in example. This shows the shape for a site the auto-detector would miss.
// Add real ones with registerTemplate({ host: '...', item: '...', title: '...', link: '...' }).
registerTemplate({
  host: 'example-blog.test',
  feedTitle: 'Example Blog',
  item: '.post-list .post',
  title: '.post-title',
  link: '.post-title a',
  date: 'time',
  summary: '.post-excerpt',
})
