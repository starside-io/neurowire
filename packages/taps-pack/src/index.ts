import type { Mesh } from '@neurowire/core'
import { registerTemplate } from '@neurowire/ingest'
import type { Theme, ThemeSource } from './types'

export type { Theme, ThemeSource } from './types'

/**
 * Every theme key, paired with a lazy loader. The loaders use dynamic `import()`
 * so registering one theme by name never pulls the others into the bundle.
 */
export const THEME_LOADERS = {
  // tech cluster
  'frontier-labs': () => import('./themes/frontier-labs'),
  'ai-tools': () => import('./themes/ai-tools'),
  'cloud-infra': () => import('./themes/cloud-infra'),
  devtools: () => import('./themes/devtools'),
  languages: () => import('./themes/languages'),
  security: () => import('./themes/security'),
  data: () => import('./themes/data'),
  hardware: () => import('./themes/hardware'),
  'tech-news': () => import('./themes/tech-news'),
  research: () => import('./themes/research'),
  'vc-startups': () => import('./themes/vc-startups'),
  'product-design': () => import('./themes/product-design'),
  // general-interest cluster
  space: () => import('./themes/space'),
  science: () => import('./themes/science'),
  gaming: () => import('./themes/gaming'),
  anime: () => import('./themes/anime'),
  'movies-tv': () => import('./themes/movies-tv'),
  music: () => import('./themes/music'),
  sports: () => import('./themes/sports'),
  'art-design': () => import('./themes/art-design'),
  culture: () => import('./themes/culture'),
  'world-news': () => import('./themes/world-news'),
  books: () => import('./themes/books'),
  food: () => import('./themes/food'),
} satisfies Record<string, () => Promise<{ default: Theme }>>

export type ThemeKey = keyof typeof THEME_LOADERS

/** All theme keys. */
export const THEME_KEYS = Object.keys(THEME_LOADERS) as ThemeKey[]

/** Load a single theme by key (lazy dynamic import). */
export async function loadTheme(key: ThemeKey): Promise<Theme> {
  const mod = await THEME_LOADERS[key]()
  return mod.default
}

/** Load every theme (opt-in to the full catalog). */
export async function loadAllThemes(): Promise<Theme[]> {
  return Promise.all(THEME_KEYS.map(loadTheme))
}

/** Register a theme's taps (the feed-less sources) with the ingest registry. */
export async function registerTheme(key: ThemeKey): Promise<void> {
  const theme = await loadTheme(key)
  for (const src of theme.sources) {
    if (src.tap) registerTemplate(src.tap)
  }
}

/** Register every theme's taps. Safe to call repeatedly. */
export async function registerAll(): Promise<void> {
  await Promise.all(THEME_KEYS.map(registerTheme))
}

/** Build a {@link Mesh} from a theme: every source becomes a mesh entry. */
export function themeMesh(theme: Theme): Mesh {
  return {
    name: theme.title,
    sources: theme.sources.map((s: ThemeSource) => ({ name: s.name, url: s.url })),
  }
}
