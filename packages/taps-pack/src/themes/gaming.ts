import type { Theme } from '../types'

// Video game news. Every source ships a verified RSS/Atom feed, so none needs a
// tap. The opt-in live test (NEUROWIRE_LIVE) flags any that go dark.
const gaming: Theme = {
  key: 'gaming',
  title: 'Gaming',
  sources: [
    { name: 'IGN', url: 'https://www.ign.com/rss/articles/feed' },
    { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed' },
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed' },
    { name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/' },
    { name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml' },
    { name: 'GameSpot', url: 'https://www.gamespot.com/feeds/news/' },
    { name: 'Game Developer', url: 'https://www.gamedeveloper.com/rss.xml' },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest' },
    { name: 'VG247', url: 'https://www.vg247.com/feed' },
    { name: 'GamesIndustry.biz', url: 'https://www.gamesindustry.biz/feed' },
  ],
}

export default gaming
export { gaming }
