import type { Theme } from '../types'

// Space and spaceflight. Every source ships a verified RSS/Atom feed, so none
// needs a tap. The opt-in live test (NEUROWIRE_LIVE) flags any that go dark.
const space: Theme = {
  key: 'space',
  title: 'Space',
  sources: [
    { name: 'NASA', url: 'https://www.nasa.gov/feed/' },
    { name: 'NASA JPL News', url: 'https://www.jpl.nasa.gov/feeds/news/' },
    { name: 'SpaceNews', url: 'https://spacenews.com/feed/' },
    { name: 'Spaceflight Now', url: 'https://spaceflightnow.com/feed/' },
    { name: 'Space.com', url: 'https://www.space.com/feeds/all' },
    { name: 'Universe Today', url: 'https://www.universetoday.com/feed/' },
    { name: 'Astronomy Magazine', url: 'https://www.astronomy.com/feed/' },
    { name: 'The Planetary Society', url: 'https://www.planetary.org/rss/articles' },
    { name: 'ESA Space News', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News' },
    { name: 'ESA Space Science', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science' },
    { name: 'Ars Technica Space', url: 'https://arstechnica.com/science/space/feed/' },
    { name: 'ScienceDaily Space & Time', url: 'https://www.sciencedaily.com/rss/space_time.xml' },
  ],
}

export default space
export { space }
