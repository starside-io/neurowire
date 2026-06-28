import type { Theme } from '../types'

// Music news, reviews, and criticism. Every source ships RSS/Atom, so each is
// fetched directly (ingest auto-detects the feed); no taps are needed. The
// opt-in live test (NEUROWIRE_LIVE) flags any that need attention.
const music: Theme = {
  key: 'music',
  title: 'Music',
  sources: [
    { name: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss' },
    { name: 'Stereogum', url: 'https://www.stereogum.com/feed/' },
    { name: 'Rolling Stone Music', url: 'https://www.rollingstone.com/music/feed/' },
    { name: 'NME', url: 'https://www.nme.com/feed' },
    { name: 'Billboard', url: 'https://www.billboard.com/feed/' },
    { name: 'Brooklyn Vegan', url: 'https://www.brooklynvegan.com/feed/' },
    { name: 'Loudwire', url: 'https://loudwire.com/feed/' },
    { name: 'Spin', url: 'https://www.spin.com/feed/' },
    { name: 'The Fader', url: 'https://www.thefader.com/feed' },
    { name: 'Consequence', url: 'https://consequence.net/feed/' },
  ],
}

export default music
export { music }
