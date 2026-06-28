import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import NwfStatsCard from './NwfStatsCard.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // Render the NWF byte-comparison card in the home hero's image slot, so it sits
  // to the right of the "Clean feeds from anything" headline.
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(NwfStatsCard),
    })
  },
}
