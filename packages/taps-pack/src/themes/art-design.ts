import type { Theme } from '../types'

// Art and design. Every source here ships RSS/Atom (verified at authoring time),
// so they are fetched directly with no tap. The first four carry over the
// verified URLs from examples/art-design.mesh.json.
const artDesign: Theme = {
  key: 'art-design',
  title: 'Art & Design',
  sources: [
    { name: 'Colossal', url: 'https://www.thisiscolossal.com/feed/' },
    { name: 'Hyperallergic', url: 'https://hyperallergic.com/feed/' },
    { name: 'Designboom', url: 'https://www.designboom.com/feed/' },
    { name: "It's Nice That", url: 'https://feeds.feedburner.com/itsnicethat' },
    { name: 'Creative Bloq', url: 'https://www.creativebloq.com/feeds/all' },
    { name: 'Dezeen', url: 'https://www.dezeen.com/feed/' },
    { name: 'Core77', url: 'https://www.core77.com/feed' },
    { name: 'Artnet News', url: 'https://news.artnet.com/feed' },
    { name: 'Juxtapoz', url: 'https://www.juxtapoz.com/feed/' },
    { name: 'ArchDaily', url: 'https://www.archdaily.com/rss/' },
    { name: 'The Art Newspaper', url: 'https://www.theartnewspaper.com/rss.xml' },
  ],
}

export default artDesign
export { artDesign }
