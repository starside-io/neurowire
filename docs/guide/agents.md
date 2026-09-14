# Agents (MCP)

Neurowire ships an MCP server, `@neurowire/mcp`, so an LLM agent can read feeds, follow
journals, and verify taps directly. Results default to NWF, the most compact format, which
keeps an agent's context small.

## Claude Code plugin

The plugin bundles the server and two skills (following feeds, authoring a tap), so one
install gives an agent both the tools and the know-how:

```bash
/plugin marketplace add starside-io/claude-plugins
/plugin install neurowire@starside
```

## Any MCP client

The server speaks stdio. Point your client at:

```bash
npx -y @neurowire/mcp
```

For Claude Code without the plugin:

```bash
claude mcp add neurowire -- npx -y @neurowire/mcp
```

For a client configured with JSON (Claude Desktop, Cursor, and similar):

```json
{
  "mcpServers": {
    "neurowire": {
      "command": "npx",
      "args": ["-y", "@neurowire/mcp"],
      "env": { "NEUROWIRE_MCP_ALLOW": "github.com,simonwillison.net,claude.com" }
    }
  }
}
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEUROWIRE_MCP_ALLOW` | (unset) | Comma separated hosts that caller-supplied URLs may fetch. Unset allows every host. |
| `NEUROWIRE_MESHES` | (unset) | Extra mesh directories, searched before `~/.config/neurowire/meshes`. |
| `NEUROWIRE_CONSTRUCTS` | (unset) | Extra construct directories, searched before `~/.config/neurowire/constructs`. |
| `NEUROWIRE_JOURNAL` | `~/.config/neurowire/journal` | Where the journal tools read from. |
| `NEUROWIRE_TAPS` | (unset) | Extra tap files or directories, as for the CLI. |

## What an agent can do

- **Answer "what shipped this week?"** with `fetch_mesh` on the bundled `ai-news` mesh, or
  `query` with `since: "7d"`.
- **Follow an archive over time.** Keep a journal fresh with the CLI
  (`neurowire --mesh ai-news.json --journal ai --watch`), then have the agent call
  `whats_new` and store the cursor it returns. The next call yields exactly what arrived.
- **Read a site with no feed.** `propose_tap` drafts a tap and `verify_tap` gates it. The
  agent can iterate on selectors, but only a passing template counts, and nothing is
  installed. See [Taps](/concepts/taps).
- **Answer questions about Neurowire itself** with `search_docs`, which reads the
  published [`llms.txt`](https://neurowire.starside.io/llms.txt) index.

The full tool list, input fields, and result conventions are in the
[`@neurowire/mcp` reference](/reference/mcp).

## Docs for agents

The docs site publishes a flattened, token-efficient copy of itself for any agent, MCP or
not:

- [`/llms.txt`](https://neurowire.starside.io/llms.txt): the table of contents.
- [`/llms-full.txt`](https://neurowire.starside.io/llms-full.txt): every page in one file.
