import type { Theme } from '../types'

// Sports news across leagues. Every source ships RSS/Atom, so each is fetched
// directly (ingest auto-detects the feed); no taps are needed. The opt-in live
// test (NEUROWIRE_LIVE) flags any that need attention.
const sports: Theme = {
  key: 'sports',
  title: 'Sports',
  sources: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
    { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/' },
    { name: 'SB Nation', url: 'https://www.sbnation.com/rss/index.xml' },
    { name: 'The Guardian Sport', url: 'https://www.theguardian.com/sport/rss' },
    { name: 'ESPN NFL', url: 'https://www.espn.com/espn/rss/nfl/news' },
    { name: 'Deadspin', url: 'https://deadspin.com/rss' },
    { name: 'Defector', url: 'https://defector.com/feed' },
  ],
}

export default sports
export { sports }
