import type { Theme } from '../types'

// Food and cooking. Every source here ships RSS/Atom (verified at authoring
// time), so they are fetched directly with no tap.
const food: Theme = {
  key: 'food',
  title: 'Food',
  sources: [
    { name: 'Eater', url: 'https://www.eater.com/rss/index.xml' },
    { name: 'Bon Appetit', url: 'https://www.bonappetit.com/feed/rss' },
    { name: 'Smitten Kitchen', url: 'https://smittenkitchen.com/feed/' },
    { name: 'The Kitchn', url: 'https://www.thekitchn.com/main.rss' },
    { name: 'Epicurious', url: 'https://www.epicurious.com/feed/rss' },
    { name: 'Saveur', url: 'https://www.saveur.com/feed/' },
    { name: 'The Guardian Food', url: 'https://www.theguardian.com/food/rss' },
    { name: 'David Lebovitz', url: 'https://www.davidlebovitz.com/feed/' },
    { name: '101 Cookbooks', url: 'https://101cookbooks.com/feed' },
    { name: 'Minimalist Baker', url: 'https://minimalistbaker.com/feed/' },
    { name: 'Budget Bytes', url: 'https://www.budgetbytes.com/feed/' },
  ],
}

export default food
export { food }
