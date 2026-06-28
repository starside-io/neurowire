import type { Theme } from '../types'

// Product and design. All sources ship a real RSS/Atom feed (verified). Julie
// Zhuo publishes via Medium (@joulee). Built for Mars and growth.design render
// client-side and ship no usable feed, so they are replaced here by verified-feed
// alternatives in the same orbit; the opt-in live test (NEUROWIRE_LIVE) flags any
// that need a tap.
const productDesign: Theme = {
  key: 'product-design',
  title: 'Product & Design',
  sources: [
    { name: 'Figma Blog', url: 'https://www.figma.com/blog/feed/atom.xml' },
    { name: 'Nielsen Norman Group', url: 'https://www.nngroup.com/feed/rss/' },
    { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/' },
    { name: 'A List Apart', url: 'https://alistapart.com/main/feed/' },
    { name: 'UX Collective', url: 'https://uxdesign.cc/feed' },
    { name: 'Intercom Blog', url: 'https://www.intercom.com/blog/feed/' },
    { name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed' },
    { name: 'Julie Zhuo (The Looking Glass)', url: 'https://medium.com/feed/@joulee' },
    { name: 'UX Planet', url: 'https://uxplanet.org/feed' },
    { name: 'UX Movement', url: 'https://feeds.feedburner.com/uxmovement' },
    { name: 'Figma Design (Medium)', url: 'https://medium.com/feed/figma-design' },
    { name: 'Stratechery (Ben Thompson)', url: 'https://stratechery.com/feed/' },
  ],
}

export default productDesign
export { productDesign }
