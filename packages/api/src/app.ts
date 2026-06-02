import {
  FORMATS,
  type Format,
  MEDIA_TYPES,
  type Mesh,
  MeshSchema,
  type NeurowireFeed,
  isFormat,
  serialize,
} from '@neurowire/core'
import { fetchFeed, fetchMesh } from '@neurowire/ingest'
import { registerAllTaps } from '@neurowire/taps'
import { type Context, Hono } from 'hono'
import { listMeshNames, resolveMesh } from './meshes'

// Built-in taps plus any from NEUROWIRE_TAPS or ~/.config/neurowire/taps.
registerAllTaps()

export const app = new Hono()

function feedResponse(c: Context, feed: NeurowireFeed, format: Format): Response {
  c.header('Content-Type', MEDIA_TYPES[format])
  c.header('Cache-Control', 'public, max-age=300')
  return c.body(serialize(feed, format))
}

app.get('/', (c) =>
  c.json({
    name: 'neurowire',
    version: '0.1.0',
    formats: FORMATS,
    endpoints: {
      feed: 'GET /feed?url=<encoded-url>&format=atom|json|md|nwf',
      mesh: 'GET /mesh?src=<name>&format=...  or  POST /mesh (mesh JSON body)',
    },
    meshes: listMeshNames(),
  }),
)

app.get('/healthz', (c) => c.json({ status: 'ok', service: 'neurowire', version: '0.1.0' }))

app.get('/feed', async (c) => {
  const url = c.req.query('url')
  if (!url) {
    return c.json({ error: 'missing required query parameter: url' }, 400)
  }
  const format = c.req.query('format') ?? 'atom'
  if (!isFormat(format)) {
    return c.json({ error: `unknown format "${format}"`, formats: FORMATS }, 400)
  }
  try {
    return feedResponse(c, await fetchFeed(url), format)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return c.json({ error: 'failed to build feed', detail }, 502)
  }
})

app.get('/mesh', async (c) => {
  const src = c.req.query('src')
  if (!src) {
    return c.json({ error: 'missing required query parameter: src', meshes: listMeshNames() }, 400)
  }
  const format = c.req.query('format') ?? 'atom'
  if (!isFormat(format)) {
    return c.json({ error: `unknown format "${format}"`, formats: FORMATS }, 400)
  }
  const mesh = resolveMesh(src)
  if (!mesh) {
    return c.json({ error: `unknown mesh "${src}"`, meshes: listMeshNames() }, 404)
  }
  try {
    return feedResponse(c, await fetchMesh(mesh), format)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return c.json({ error: 'failed to build mesh', detail }, 502)
  }
})

app.post('/mesh', async (c) => {
  const format = c.req.query('format') ?? 'atom'
  if (!isFormat(format)) {
    return c.json({ error: `unknown format "${format}"`, formats: FORMATS }, 400)
  }
  let mesh: Mesh
  try {
    mesh = MeshSchema.parse(await c.req.json())
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return c.json({ error: 'invalid mesh body', detail }, 400)
  }
  try {
    return feedResponse(c, await fetchMesh(mesh), format)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return c.json({ error: 'failed to build mesh', detail }, 502)
  }
})
