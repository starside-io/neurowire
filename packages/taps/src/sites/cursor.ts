import type { FeedTemplate } from '@neurowire/ingest'

/**
 * Recipe for https://cursor.com/blog.
 *
 * A Next.js site with no RSS/Atom feed. Each post is a single
 * `<a href="/blog/...">` card (the anchor itself is the link), with the title in
 * its first `<p>` and a `<time datetime>`. Topic-filter links (`/blog/topic/...`)
 * are excluded, so `link` is omitted: the matched anchor is the link.
 */
export const cursorBlog: FeedTemplate = {
  host: 'cursor.com',
  feedTitle: 'Cursor Blog',
  item: 'a[href^="/blog/"]:not([href*="/blog/topic/"])',
  title: 'p',
  date: 'time',
}
