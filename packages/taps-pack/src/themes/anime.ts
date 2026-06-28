import type { Theme } from '../types'

// Anime news and culture. Every source ships RSS/Atom, so each is fetched
// directly (ingest auto-detects the feed); no taps are needed. Anime News
// Network sits behind a bot challenge for unauthenticated curl, but serves a
// real feed to ordinary clients; the opt-in live test (NEUROWIRE_LIVE) flags
// any that need attention.
const anime: Theme = {
  key: 'anime',
  title: 'Anime',
  sources: [
    { name: 'ComicBook Anime', url: 'https://comicbook.com/anime/news/feed/' },
    { name: 'MyAnimeList News', url: 'https://myanimelist.net/rss/news.xml' },
    { name: 'Crunchyroll Anime', url: 'https://www.crunchyroll.com/rss/anime' },
    { name: 'Otaku USA', url: 'https://otakuusamagazine.com/feed/' },
    { name: 'Anime UK News', url: 'https://animeuknews.net/feed/' },
    { name: "Honey's Anime", url: 'https://honeysanime.com/feed/' },
    { name: 'Anime Corner', url: 'https://www.animecorner.me/feed/' },
    { name: 'CBR Anime', url: 'https://www.cbr.com/feed/category/anime/' },
    { name: 'Siliconera', url: 'https://www.siliconera.com/feed/' },
    { name: 'Sakuga Blog', url: 'https://blog.sakugabooru.com/feed/' },
  ],
}

export default anime
export { anime }
