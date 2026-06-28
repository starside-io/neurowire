import type { Theme } from '../types'

// AI research and academia. Most sources ship a real RSS/Atom feed (verified).
// Papers with Code and Stanford HAI render their listings client-side and ship
// no usable feed, so they carry their listing URL for ingest auto-detect; the
// opt-in live test (NEUROWIRE_LIVE) flags any that need a tap.
const research: Theme = {
  key: 'research',
  title: 'AI Research & Academia',
  sources: [
    { name: 'arXiv cs.AI (Artificial Intelligence)', url: 'https://rss.arxiv.org/rss/cs.AI' },
    { name: 'arXiv cs.LG (Machine Learning)', url: 'https://rss.arxiv.org/rss/cs.LG' },
    { name: 'BAIR Blog (Berkeley AI Research)', url: 'https://bair.berkeley.edu/blog/feed.xml' },
    { name: 'The Gradient', url: 'https://thegradient.pub/rss/' },
    { name: 'Import AI (Jack Clark)', url: 'https://importai.substack.com/feed' },
    { name: 'Distill', url: 'https://distill.pub/rss.xml' },
    { name: 'MIT News (AI)', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2' },
    { name: 'Google DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml' },
    { name: 'Google Research Blog', url: 'https://blog.research.google/feeds/posts/default' },
    { name: 'Sebastian Raschka (Ahead of AI)', url: 'https://magazine.sebastianraschka.com/feed' },
    { name: "Lilian Weng's Blog", url: 'https://lilianweng.github.io/index.xml' },
    { name: 'Papers with Code', url: 'https://paperswithcode.com/latest' },
    { name: 'Stanford HAI News', url: 'https://hai.stanford.edu/news' },
  ],
}

export default research
export { research }
