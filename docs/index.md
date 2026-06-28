---
layout: home

hero:
  name: Neurowire
  text: Clean feeds from anything
  tagline: >-
    Point it at a blog, website, RSS, or Atom feed and get back Atom, JSON Feed,
    Markdown, RSS, nwf, OPML, and self-contained HTML pages. Library, CLI, and HTTP API.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: Concepts
      link: /concepts/model
    - theme: alt
      text: View on GitHub
      link: https://github.com/starside-io/neurowire

features:
  - title: One model, many formats
    details: >-
      Every parser produces a single canonical feed model; every serializer
      consumes it. Emit Atom, JSON Feed 1.1, Markdown, RSS 2.0, or the compact nwf.
  - title: Feeds for feed-less sites
    details: >-
      Taps are per-host CSS-selector recipes that turn a plain HTML listing page
      into a real feed when a site has no RSS or Atom.
  - title: Bundle and merge
    details: >-
      A mesh fetches many sources in parallel and merges them; a construct bundles
      many meshes into one repo of feeds, grouped or flattened.
  - title: Deliver anywhere
    details: >-
      Render a self-contained HTML news page, push new entries to Slack, Discord,
      or a webhook, or serve everything over the HTTP API.
---
