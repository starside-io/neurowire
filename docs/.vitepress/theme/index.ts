import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import NwfStatsCard from './NwfStatsCard.vue'
import './custom.css'

// A tab opened before a deploy still references the previous build's chunk
// hashes. The search box (and any other lazily loaded component) is fetched on
// first use, so after a redeploy that fetch 404s and the click does nothing.
// Vite reports that as `vite:preloadError`; reload once so the page picks up
// the current build. The session flag stops a loop if the reload does not fix it.
const RELOAD_FLAG = 'neurowire:preload-reloaded'

function reloadOnStaleChunk(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (event) => {
    let reloaded = false
    try {
      reloaded = sessionStorage.getItem(RELOAD_FLAG) === window.location.href
      if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, window.location.href)
    } catch {
      // Storage unavailable (private mode): still reload, just without loop protection.
    }
    if (reloaded) return
    event.preventDefault()
    window.location.reload()
  })
}

export default {
  extends: DefaultTheme,
  enhanceApp() {
    reloadOnStaleChunk()
  },
  // Render the NWF byte-comparison card in the home hero's image slot, so it sits
  // to the right of the "Clean feeds from anything" headline.
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(NwfStatsCard),
    })
  },
}
