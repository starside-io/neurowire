import type { FeedTemplate } from '@neurowire/ingest'

/**
 * Recipe for https://claude.com/blog.
 *
 * The site is built on Webflow and ships no RSS or Atom feed. Each post is an
 * `<article class="card_blog_list_wrap">` holding the title, a category, and a
 * publish date in a visually-hidden `[fs-list-field="date"]` element (for
 * example "May 28, 2026"). Auto-detect finds the titles and links but not the
 * dates or categories, which is exactly what this recipe adds.
 */
export const claudeBlog: FeedTemplate = {
  host: 'claude.com',
  feedTitle: 'Claude Blog',
  item: 'article.card_blog_list_wrap',
  title: '.card_blog_list_title',
  link: 'a[href^="/blog/"]',
  date: '[fs-list-field="date"]',
  tags: '[fs-list-field="category"]',
}
