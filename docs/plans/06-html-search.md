# Epic 6: HTML page client-side search

## Goal

Add an in-page search/filter box to the generated HTML
([web/src/render.ts](../../packages/web/src/render.ts)). `toHtml` inlines every
entry into one self-contained page; for a 200-entry mesh that is a wall of
headlines with no way to find anything. A pure client-side filter keeps the page
self-contained (no network, no build step, no external JS) while making large
pages usable.

**Search only.** Pagination, sorting controls, and light/dark theming are
explicitly out of this epic (they were part of the broader idea; deferred).

## Scope

- A search `<input>` rendered above the entry list in `toHtml`, and in the
  per-mesh pages of `toConstructPages` (each page filters its own entries).
- Inline `<script>` (the page already ships one for the parallax effect) that:
  - filters entry cards by a case-insensitive substring match over title +
    summary + source + tags + author,
  - shows a live "N of M shown" count,
  - shows an empty-state message when nothing matches,
  - debounces input (~120ms),
  - respects `prefers-reduced-motion` (no animated show/hide, just toggle).
- Works with zero JS as a graceful fallback: with JS off, the input is inert and
  all entries show (progressive enhancement).
- No external requests, no dependency: the page stays a single self-contained
  file (a core property of `@neurowire/web`).

## Non-goals

- Pagination / lazy chunks (separate follow-up; note in docs).
- Sort controls, theme toggle (deferred from the original epic 6).
- Fuzzy / tokenized / ranked search (a plain substring `includes` is enough at
  these sizes; revisit only if pages exceed thousands of entries).
- Search across the construct overview page that links out to mesh pages (each
  mesh page searches itself; a global cross-mesh search is a non-goal).
- Server-side search / API.

## Dependencies

None hard. Pure `web`. Independent of all other epics. Touches `render.ts` only.
If Epic 8 (testing) adds web snapshot tests, do 6 before finalizing those
snapshots so the search markup is covered.

## Design notes

- **Data for matching:** add a `data-search` attribute on each entry card
  containing the lowercased concatenation of title + summary + source + tags +
  author. The script reads `data-search`, not the DOM text, so matching is cheap
  and markup-independent.
- **Markup:** wrap the existing entry list; add `<input class="search"
  type="search" placeholder="Filter stories...">` and a `<p class="count">`
  live-region (`aria-live="polite"`).
- **Script:** vanilla, IIFE, appended to the existing inline script. Toggle a
  `hidden`/class on each card; update count; toggle empty-state element.
- **Styling:** extend the `STYLE` constant
  ([render.ts:34](../../packages/web/src/render.ts)) with `.search`, `.count`,
  `.empty` rules using the existing CSS variables so it matches the theme.
- **Accessibility:** `<input type="search">`, associated `<label>` (visually
  hidden), `aria-live` count, focus ring from existing tokens.

## Steps

1. Read `render.ts`: the entry-card template, the `STYLE` constant, and the
   existing inline `<script>` block to append to (not replace).
2. Add `data-search` to the card template (build the string from the same fields
   the card already renders; lowercase it).
3. Inject the search input + count + empty-state into the page shell, and into
   each `toConstructPages` mesh page (reuse the same shell helper if one exists;
   if `toHtml` and the per-mesh render share a shell, change it once).
4. Add the filter script (debounced, accessible, reduced-motion aware).
5. Add CSS rules to `STYLE`.
6. Verify in a browser preview at desktop + mobile (560px breakpoint), JS on and
   off, reduced-motion on. Confirm the file is still self-contained (no external
   refs): grep the output for `http`/`src=`/`href=` to outside hosts.
7. `pnpm build && pnpm typecheck && pnpm lint`. Add web snapshot test if Epic 8
   is in flight.

## Risks / decisions

- **Self-contained invariant:** the killer feature of `@neurowire/web` is a
  single portable file. The search must add zero external requests. Enforce in a
  test (assert output has no off-host `http(s)://` in src/href except the entry
  links themselves).
- **Large pages:** at thousands of cards, toggling `hidden` per keystroke could
  jank; the 120ms debounce + `data-search` substring keeps it fine into the low
  thousands. If pages grow past that, that is the pagination follow-up, not this
  epic.
- **CSP-friendliness:** inline script may trip strict CSP if a user serves the
  page behind one. Document that the page uses one inline script (already true
  today for parallax).

## Acceptance

- Typing in the box filters cards live with an accurate "N of M" count and an
  empty state.
- Page remains a single self-contained file with no new external requests.
- Works on mobile + desktop; degrades gracefully with JS disabled; honors
  reduced-motion.
