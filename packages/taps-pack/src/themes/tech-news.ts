import type { Theme } from '../types'

// Tech news and general industry coverage. Every source here ships a verified
// RSS/Atom feed, so none needs a tap. The opt-in live test (NEUROWIRE_LIVE)
// flags any that drift.
const techNews: Theme = {
  key: 'tech-news',
  title: 'Tech News',
  sources: [
    { name: 'Hacker News front page', url: 'https://news.ycombinator.com/rss' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
    { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/' },
    { name: 'Stratechery', url: 'https://stratechery.com/feed/' },
    { name: 'Platformer', url: 'https://www.platformer.news/rss/' },
    { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/' },
    { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
    { name: 'The Register', url: 'https://www.theregister.com/headlines.atom' },
  ],
}

export default techNews
export { techNews }
