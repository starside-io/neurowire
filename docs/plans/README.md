# Roadmap plans

One markdown plan per epic. Each plan is self-contained: goal, scope, non-goals,
dependencies, files touched, step list, tests, risks, acceptance.

## Epics

| # | Epic | Package(s) | Plan |
|---|------|-----------|------|
| 1 | RSS 2.0 output serializer | core | [01-rss-output.md](01-rss-output.md) |
| 2 | OPML import / export | core, ingest, cli | [02-opml.md](02-opml.md) |
| 3 | Fetch hardening (timeout, retry, backoff) | ingest | [03-fetch-hardening.md](03-fetch-hardening.md) |
| 4 | Self-host the API (operator owns security) | api | [04-self-host.md](04-self-host.md) |
| 5 | Tap pack: 100 curated taps, conditional import | new `@neurowire/taps-pack` | [05-taps-pack.md](05-taps-pack.md) |
| 6 | HTML page client-side search | web | [06-html-search.md](06-html-search.md) |
| 8 | Test the untested layers (api, cli, web) | api, cli, web | [08-testing.md](08-testing.md) |

## Dependency graph

```
1 (RSS output) ──────────────┐
                             ├─> 8 (testing picks up new code)
2 (OPML) ────────────────────┤
3 (fetch hardening) ─────────┤
6 (HTML search) ─────────────┤
4 (self-host) ───────────────┤
5 (taps-pack) ───────────────┘
```

- **No epic blocks another at the code level.** They touch mostly disjoint files
  and can ship in parallel.
- **Soft ordering:** Epic 8 (testing) should land *last* or grow *alongside*
  each feature, so it covers the new code rather than a moving target. If you
  freeze features first, 8 becomes a single clean pass.
- **Epic 5** reuses the existing `FeedTemplate` shape unchanged
  ([template.ts:6](../../packages/ingest/src/html/template.ts)), so it has no hard
  dep, but it adds the most new surface for Epic 8 to test.
- **Epic 2** export side overlaps conceptually with Epic 1 (both are "more
  formats") but shares no code; OPML is a subscription-list format, not a feed
  serializer, so it lives partly outside `core/src/serialize/`.

## Suggested sequence

1. **3** (fetch hardening) - reliability floor everything else rides on.
2. **1** (RSS output) - smallest, highest interop ROI.
3. **5** (taps-pack) - the product differentiator; biggest content lift.
4. **2** (OPML) - migration glue, pairs with 5.
5. **6** (HTML search) - UX polish on the most-seen surface.
6. **4** (self-host) - packaging + docs, do once API surface is stable.
7. **8** (testing) - lock all of the above behind coverage gates.
