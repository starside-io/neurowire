import type { Theme } from '../types'

// Programming languages and web frameworks. Every source below ships a real
// RSS/Atom feed (verified by fetching the URL), so none need a tap. The opt-in
// live test (NEUROWIRE_LIVE) flags any that later drop their feed.
const languages: Theme = {
  key: 'languages',
  title: 'Languages & Frameworks',
  sources: [
    { name: 'Rust Blog', url: 'https://blog.rust-lang.org/feed.xml' },
    { name: 'Go Blog', url: 'https://go.dev/blog/feed.atom' },
    { name: 'Python Insider', url: 'https://blog.python.org/feeds/posts/default' },
    { name: 'TypeScript DevBlog', url: 'https://devblogs.microsoft.com/typescript/feed/' },
    { name: 'Node.js Blog', url: 'https://nodejs.org/en/feed/blog.xml' },
    { name: 'Deno Blog', url: 'https://deno.com/feed' },
    { name: 'React Blog', url: 'https://react.dev/rss.xml' },
    { name: 'Vue.js Blog', url: 'https://blog.vuejs.org/feed.rss' },
    { name: 'Svelte Blog', url: 'https://svelte.dev/blog/rss.xml' },
    { name: 'Angular Blog', url: 'https://blog.angular.dev/feed' },
    { name: 'Kotlin Blog', url: 'https://blog.jetbrains.com/kotlin/feed/' },
    { name: 'PHP News', url: 'https://www.php.net/feed.atom' },
    { name: 'Ruby News', url: 'https://www.ruby-lang.org/en/feeds/news.rss' },
  ],
}

export default languages
export { languages }
