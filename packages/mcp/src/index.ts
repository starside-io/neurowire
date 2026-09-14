import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerAllTaps } from '@neurowire/taps'
import { registerAll } from '@neurowire/taps-pack'
import { parseAllowList } from './allow'
import { createServer } from './server'

// taps-pack first, then the bundled and user taps, so a user tap wins a host collision.
await registerAll()
registerAllTaps()

const server = createServer({ allow: parseAllowList(process.env.NEUROWIRE_MCP_ALLOW) })
await server.connect(new StdioServerTransport())

export { createServer }
