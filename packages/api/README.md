# @neurowire/api

A small, self-hostable HTTP service for [Neurowire](https://github.com/starside-io/neurowire), built on [Hono](https://hono.dev). Run it on your own server to expose any feed, or your own named meshes, as an API in Atom, JSON Feed, Markdown, or nwf.

## Install and run

```bash
# Run directly
npx @neurowire/api

# or install and run
npm install -g @neurowire/api
neurowire-api
```

The server listens on `PORT` (default `8787`):

```bash
PORT=3000 neurowire-api
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service info: name, version, formats, and available mesh names. |
| `GET` | `/healthz` | Health check. |
| `GET` | `/feed?url=<encoded-url>&format=<fmt>` | Build a feed from any URL. `format` defaults to `atom`. |
| `GET` | `/mesh?src=<name>&format=<fmt>` | Serve a named mesh. |
| `POST` | `/mesh?format=<fmt>` | Build a mesh from a JSON body. |

`format` is one of `atom`, `json`, `md`, `nwf`. Responses set the matching content type and `Cache-Control: public, max-age=300`.

```bash
curl 'http://localhost:8787/feed?url=https%3A%2F%2Fexample.com%2Fblog&format=json'
curl 'http://localhost:8787/mesh?src=ai-news&format=nwf'
curl -X POST 'http://localhost:8787/mesh?format=atom' \
  -H 'content-type: application/json' \
  -d '{"name":"My Mesh","sources":[{"name":"Example","url":"https://example.com/blog"}]}'
```

## Named meshes

`GET /mesh?src=<name>` resolves named meshes from `~/.config/neurowire/meshes/*.json`, plus a bundled `ai-news` mesh. Drop a mesh JSON file in that directory to add your own.

## Embedding

The Hono app is exported if you want to mount it yourself:

```ts
import { app } from '@neurowire/api'
```

## License

Apache-2.0
