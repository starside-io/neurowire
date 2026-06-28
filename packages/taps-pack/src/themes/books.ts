import type { Theme } from '../types'

// Books and literature. Every source here ships RSS/Atom (verified at authoring
// time), so they are fetched directly with no tap.
const books: Theme = {
  key: 'books',
  title: 'Books',
  sources: [
    { name: 'Literary Hub', url: 'https://lithub.com/feed/' },
    { name: 'Book Riot', url: 'https://bookriot.com/feed/' },
    {
      name: 'The New York Times Books',
      url: 'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml',
    },
    { name: 'The Guardian Books', url: 'https://www.theguardian.com/books/rss' },
    { name: 'Electric Literature', url: 'https://electricliterature.com/feed/' },
    { name: 'The Paris Review', url: 'https://www.theparisreview.org/blog/feed/' },
    { name: 'Reactor (Tor.com)', url: 'https://reactormag.com/feed/' },
    { name: 'The New York Review of Books', url: 'https://www.nybooks.com/feed/' },
    { name: 'The Marginalian', url: 'https://www.themarginalian.org/feed/' },
    { name: 'Aeon', url: 'https://aeon.co/feed.rss' },
  ],
}

export default books
export { books }
