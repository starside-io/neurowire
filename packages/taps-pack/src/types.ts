import type { FeedTemplate } from '@neurowire/ingest'

/**
 * One source in a theme. `url` is the page or feed URL. When the site ships no
 * RSS/Atom feed, `tap` carries the CSS-selector recipe ({@link FeedTemplate})
 * that turns its listing page into a feed; otherwise the source is fetched
 * directly (ingest auto-detects the feed).
 */
export interface ThemeSource {
  /** Human-readable source name (used as the mesh source name). */
  name: string
  /** Page or feed URL to fetch. */
  url: string
  /** Present only for feed-less sites: the tap recipe for `url`. */
  tap?: FeedTemplate
}

/** A named, themed bundle of sources (a slice of the catalog). */
export interface Theme {
  /** Stable kebab-case key, matches the file name and the subpath export. */
  key: string
  /** Display title. */
  title: string
  /** At least 10 sources. Feed-less ones carry a `tap`. */
  sources: ThemeSource[]
}
