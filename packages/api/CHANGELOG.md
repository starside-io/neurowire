# @neurowire/api

## Unreleased

- Add `GET /tail`: a feed, mesh, or construct as a server-sent event stream (`format=json|nwf`, `interval=` clamped to a 60 second floor). Emits an `init` event, then one `entry` event per new entry with its cursor as the event id, plus a keep-alive comment every 25 seconds and `X-Accel-Buffering: no`.
- One poll loop per distinct target, shared by every client following it and torn down when the last one disconnects.
- Cursor resume: with `journal=<id>` naming a journal the operator has created, the route appends what it sees and replays everything after `Last-Event-ID` (or `?since=`) before going live. Without one the tail is live-only, and `init` says so.
- Serve `nwf-sync/1`: `GET /sync/journals`, `/sync/head`, `/sync/since`, and `/sync/snapshot`, mounted at `/sync/*` and versioned by an `NWF-Sync-Version: 1` response header. Deltas are whole NWFJ segments served straight off disk.
- Publishing is explicit: `NEUROWIRE_SYNC_PUBLISH` or `~/.config/neurowire/sync.json` name the journal ids exposed, and nothing is published by default. An unpublished id and a nonexistent one answer the same 404.
- Optional static bearer token (`NEUROWIRE_SYNC_TOKEN`, or `token` in the config file), compared in constant time and checked before the publish list.

## 0.4.1

- Republish so the pinned `@neurowire/core`, `@neurowire/ingest`, and `@neurowire/taps` versions match the current release. No behavior change; journals are not served over HTTP yet.

## 0.1.0

- Initial release: the Hono service (`GET /feed`, `GET` / `POST /mesh`, `/healthz`) plus the `neurowire-api` bin for self-hosting.
