import type { Theme } from '../types'

// Hardware and chips. Every source here ships a verified RSS/Atom feed, so none
// needs a tap. The opt-in live test (NEUROWIRE_LIVE) flags any that drift.
const hardware: Theme = {
  key: 'hardware',
  title: 'Hardware & Chips',
  sources: [
    { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' },
    { name: 'Apple Newsroom', url: 'https://www.apple.com/newsroom/rss-feed.rss' },
    { name: 'SemiAnalysis', url: 'https://semianalysis.com/feed/' },
    { name: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all' },
    { name: 'IEEE Spectrum', url: 'https://spectrum.ieee.org/feeds/feed.rss' },
    { name: 'Hackaday', url: 'https://hackaday.com/feed/' },
    { name: 'Intel Newsroom', url: 'https://newsroom.intel.com/feed' },
    { name: 'The Register Hardware', url: 'https://www.theregister.com/headlines.atom' },
    { name: 'EE Times', url: 'https://www.eetimes.com/feed/' },
    { name: 'ServeTheHome', url: 'https://www.servethehome.com/feed/' },
    { name: 'Electronics Weekly', url: 'https://www.electronicsweekly.com/feed/' },
  ],
}

export default hardware
export { hardware }
