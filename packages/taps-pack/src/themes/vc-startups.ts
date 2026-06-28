import type { Theme } from '../types'

// Venture capital and startups. All sources ship a real RSS/Atom feed (verified).
// a16z and NfX render their listings client-side and ship no usable feed, so they
// are replaced here by verified-feed alternatives in the same orbit; the opt-in
// live test (NEUROWIRE_LIVE) flags any that need a tap.
const vcStartups: Theme = {
  key: 'vc-startups',
  title: 'VC & Startups',
  sources: [
    { name: 'Y Combinator Blog', url: 'https://www.ycombinator.com/blog/rss' },
    { name: 'First Round Review', url: 'https://review.firstround.com/articles/rss' },
    { name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed' },
    { name: 'Stratechery (Ben Thompson)', url: 'https://stratechery.com/feed/' },
    { name: 'Sequoia Capital', url: 'https://www.sequoiacap.com/feed/' },
    { name: 'SaaStr', url: 'https://www.saastr.com/feed/' },
    { name: 'Tomasz Tunguz', url: 'https://tomtunguz.com/index.xml' },
    { name: 'Andrew Chen', url: 'https://andrewchen.com/feed/' },
    { name: 'Sam Altman', url: 'https://blog.samaltman.com/posts.atom' },
    { name: 'Not Boring (Packy McCormick)', url: 'https://www.notboring.co/feed' },
    { name: 'Will Larson (Irrational Exuberance)', url: 'https://lethain.com/feeds/' },
    { name: 'Eli Dourado', url: 'https://www.elidourado.com/feed' },
  ],
}

export default vcStartups
export { vcStartups }
