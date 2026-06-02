import { serve } from '@hono/node-server'
import { app } from './app'

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`Neurowire API listening on http://localhost:${info.port}\n`)
})

export { app }
