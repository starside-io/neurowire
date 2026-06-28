import type { Theme } from '../types'

// Security and infosec. Every source here ships a verified RSS/Atom feed, so
// none needs a tap. The opt-in live test (NEUROWIRE_LIVE) flags any that drift.
const security: Theme = {
  key: 'security',
  title: 'Security',
  sources: [
    { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
    { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/' },
    {
      name: 'Google Project Zero',
      url: 'https://googleprojectzero.blogspot.com/feeds/posts/default',
    },
    { name: 'Google Security Blog', url: 'https://security.googleblog.com/feeds/posts/default' },
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    { name: 'Troy Hunt', url: 'https://feeds.feedburner.com/troyhunt' },
    { name: 'PortSwigger Research', url: 'https://portswigger.net/research/rss' },
    { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
    { name: 'tl;dr sec', url: 'https://tldrsec.com/feed.xml' },
    { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
    { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
  ],
}

export default security
export { security }
