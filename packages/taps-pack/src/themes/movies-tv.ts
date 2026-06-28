import type { Theme } from '../types'

// Movies and TV trade and review coverage. Every source ships RSS/Atom, so each
// is fetched directly (ingest auto-detects the feed); no taps are needed. The
// opt-in live test (NEUROWIRE_LIVE) flags any that need attention.
const moviesTv: Theme = {
  key: 'movies-tv',
  title: 'Movies & TV',
  sources: [
    { name: 'Variety', url: 'https://variety.com/feed/' },
    { name: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/' },
    { name: 'Deadline', url: 'https://deadline.com/feed/' },
    { name: 'IndieWire', url: 'https://www.indiewire.com/feed/' },
    { name: 'Collider', url: 'https://collider.com/feed/' },
    { name: '/Film', url: 'https://www.slashfilm.com/feed/' },
    { name: 'Screen Rant', url: 'https://screenrant.com/feed/' },
    { name: 'The Wrap', url: 'https://www.thewrap.com/feed/' },
    { name: 'The AV Club', url: 'https://www.avclub.com/rss' },
    { name: 'Den of Geek', url: 'https://www.denofgeek.com/feed/' },
    { name: 'Rolling Stone TV & Movies', url: 'https://www.rollingstone.com/tv-movies/feed/' },
  ],
}

export default moviesTv
export { moviesTv }
