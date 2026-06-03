import type { FeedTemplate } from '@neurowire/ingest'

/**
 * Recipe for https://mistral.ai/news.
 *
 * A Next.js site with no RSS/Atom feed. Each post is an `<article class="post-item">`
 * holding an `<h2>` title inside an `<a href="/news/...">`, with the publish date in a
 * small tertiary-text `<p>` (for example "May 27, 2026"). Featured posts are also
 * rendered as non-`post-item` cards, so scoping the item to `article.post-item`
 * keeps one entry per post instead of duplicating the highlighted ones.
 */
export const mistralNews: FeedTemplate = {
  host: 'mistral.ai',
  feedTitle: 'Mistral AI News',
  item: 'article.post-item',
  title: 'h2',
  link: 'a[href^="/news/"]',
  date: 'p.text-body-small',
}
