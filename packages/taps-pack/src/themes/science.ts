import type { Theme } from '../types'

// General science news. Every source ships a verified RSS/Atom feed, so none
// needs a tap. The opt-in live test (NEUROWIRE_LIVE) flags any that go dark.
const science: Theme = {
  key: 'science',
  title: 'Science',
  sources: [
    { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/' },
    { name: 'Phys.org', url: 'https://phys.org/rss-feed/' },
    { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml' },
    { name: 'Nature News', url: 'https://www.nature.com/nature.rss' },
    {
      name: 'Scientific American',
      url: 'https://www.scientificamerican.com/platform/syndication/rss/',
    },
    { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/' },
    { name: 'Live Science', url: 'https://www.livescience.com/feeds/all' },
    { name: 'Science Magazine News', url: 'https://www.science.org/rss/news_current.xml' },
    { name: 'Smithsonian Magazine', url: 'https://www.smithsonianmag.com/rss/latest_articles/' },
    { name: 'The Conversation', url: 'https://theconversation.com/us/technology/articles.atom' },
    { name: 'Eos (AGU)', url: 'https://eos.org/feed' },
  ],
}

export default science
export { science }
