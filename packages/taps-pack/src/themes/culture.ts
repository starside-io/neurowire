import type { Theme } from '../types'

// Culture and ideas. Every source here ships RSS/Atom (verified at authoring
// time), so they are fetched directly with no tap. The first three carry over
// the verified URLs from examples/culture.mesh.json.
const culture: Theme = {
  key: 'culture',
  title: 'Culture & Ideas',
  sources: [
    { name: 'Aeon', url: 'https://aeon.co/feed.rss' },
    { name: 'The Marginalian', url: 'https://www.themarginalian.org/feed/' },
    { name: 'Longreads', url: 'https://longreads.com/feed/' },
    { name: 'The Paris Review', url: 'https://www.theparisreview.org/blog/feed/' },
    { name: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/' },
    { name: 'The New Yorker', url: 'https://www.newyorker.com/feed/everything' },
    { name: 'Nautilus', url: 'https://nautil.us/feed/' },
    { name: 'The New York Review of Books', url: 'https://www.nybooks.com/feed/' },
    { name: 'Vox', url: 'https://www.vox.com/rss/index.xml' },
    { name: 'Public Books', url: 'https://www.publicbooks.org/feed/' },
    { name: 'Noema Magazine', url: 'https://www.noemamag.com/feed/' },
  ],
}

export default culture
export { culture }
