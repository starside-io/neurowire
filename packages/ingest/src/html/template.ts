import type { NeurowireEntry, NeurowireFeed } from '@neurowire/core'
import type { CheerioAPI } from 'cheerio'
import { z } from 'zod'
import { type ParseContext, finalizeFeed, normDate, resolveUrl } from '../util'

/** A per-site recipe of CSS selectors for extracting articles from a listing page. */
export const FeedTemplateSchema = z.object({
  /** Hostname this template applies to, e.g. "blog.example.com". */
  host: z.string().optional(),
  /** Override feed title (otherwise the page <title> is used). */
  feedTitle: z.string().optional(),
  /** Selector matching each article row. */
  item: z.string(),
  /** Selector (within an item) for the title text. */
  title: z.string(),
  /** Selector for the link (its href is read). Omit when the item element itself is the link. */
  link: z.string().optional(),
  /** Selector for the date; reads [datetime] then text. */
  date: z.string().optional(),
  /** Selector for the summary text. */
  summary: z.string().optional(),
  /** Selector for the author name. */
  author: z.string().optional(),
  /** Selector matching tag elements. */
  tags: z.string().optional(),
})
export type FeedTemplate = z.infer<typeof FeedTemplateSchema>

/** Extract a feed from an HTML page using a CSS-selector template. */
export function applyTemplate(
  $: CheerioAPI,
  template: FeedTemplate,
  ctx: ParseContext,
): NeurowireFeed {
  const entries: NeurowireEntry[] = []

  $(template.item).each((_, el) => {
    const $el = $(el)
    const title = $el.find(template.title).first().text().trim()
    const $link = template.link ? $el.find(template.link).first() : $el
    const href = $link.attr('href') ?? $link.find('a').first().attr('href')
    if (!title || !href) return

    const link = resolveUrl(href, ctx.sourceUrl)
    const entry: NeurowireEntry = { id: '', title, link }

    if (template.date) {
      const $date = $el.find(template.date).first()
      const date = normDate($date.attr('datetime') ?? $date.text().trim())
      if (date) entry.published = date
    }
    if (template.summary) {
      const summary = $el.find(template.summary).first().text().trim()
      if (summary) entry.summary = summary
    }
    if (template.author) {
      const author = $el.find(template.author).first().text().trim()
      if (author) entry.authors = [{ name: author }]
    }
    if (template.tags) {
      const tags = $el
        .find(template.tags)
        .map((_i, t) => $(t).text().trim())
        .get()
        .filter((t) => t.length > 0)
      if (tags.length) entry.tags = tags
    }

    entries.push(entry)
  })

  const title = template.feedTitle ?? ($('title').first().text().trim() || ctx.sourceUrl)
  return finalizeFeed(
    { id: ctx.sourceUrl, title, home: ctx.sourceUrl, self: ctx.sourceUrl, entries },
    ctx,
  )
}
