import type { FeedTemplate } from '@neurowire/ingest'

/**
 * Recipe for https://deepmind.google/discover/blog/.
 *
 * A server-rendered listing of `<article class="card card-blog ...">` cards. Each
 * card is itself a link (`card--is-link`) wrapping an `<h3>` title and a `<time>`
 * that carries a month-and-year label (for example "May 2026"). Posts link either to
 * a `/blog/<slug>/` path on deepmind.google or to a cross-posted blog.google URL, so
 * `link: 'a'` takes the card's anchor and relative paths resolve against the listing.
 */
export const deepmindBlog: FeedTemplate = {
  host: 'deepmind.google',
  feedTitle: 'Google DeepMind Blog',
  item: 'article.card-blog',
  title: 'h3',
  link: 'a',
  date: 'time',
}
