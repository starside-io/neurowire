import type { Theme } from '../types'

// AI research and academia. Sources ship a real RSS/Atom feed (verified); arXiv
// uses its Atom query API. The opt-in live test (NEUROWIRE_LIVE) validates every
// source.
const research: Theme = {
  key: 'research',
  title: 'AI Research & Academia',
  sources: [
    {
      name: 'arXiv cs.AI (Artificial Intelligence)',
      url: 'http://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending',
    },
    {
      name: 'arXiv cs.LG (Machine Learning)',
      url: 'http://export.arxiv.org/api/query?search_query=cat:cs.LG&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending',
    },
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
  ],
}

export default research
export { research }
