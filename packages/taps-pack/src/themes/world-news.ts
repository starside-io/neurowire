import type { Theme } from '../types'

// World news. Every source here ships RSS/Atom (verified at authoring time), so
// they are fetched directly with no tap. The first three carry over the verified
// URLs from examples/world-news.mesh.json (this theme uses the BBC world feed).
const worldNews: Theme = {
  key: 'world-news',
  title: 'World News',
  sources: [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'Deutsche Welle', url: 'https://rss.dw.com/xml/rss-en-world' },
    { name: 'France 24', url: 'https://www.france24.com/en/rss' },
    {
      name: 'The New York Times World',
      url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    },
    { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml' },
    { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss' },
    { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml' },
  ],
}

export default worldNews
export { worldNews }
