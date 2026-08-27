# @neurowire/api

## Unreleased

- Serve `nwf-sync/1`: `GET /sync/journals`, `/sync/head`, `/sync/since`, and `/sync/snapshot`, mounted at `/sync/*` and versioned by an `NWF-Sync-Version: 1` response header. Deltas are whole NWFJ segments served straight off disk.
- Publishing is explicit: `NEUROWIRE_SYNC_PUBLISH` or `~/.config/neurowire/sync.json` name the journal ids exposed, and nothing is published by default. An unpublished id and a nonexistent one answer the same 404.
- Optional static bearer token (`NEUROWIRE_SYNC_TOKEN`, or `token` in the config file), compared in constant time and checked before the publish list.

## 0.4.1

- Republish so the pinned `@neurowire/core`, `@neurowire/ingest`, and `@neurowire/taps` versions match the current release. No behavior change; journals are not served over HTTP yet.

## 0.1.0

- Initial release: the Hono service (`GET /feed`, `GET` / `POST /mesh`, `/healthz`) plus the `neurowire-api` bin for self-hosting.
