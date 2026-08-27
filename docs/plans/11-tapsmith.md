# Epic 11: Tapsmith (LLM tap forging and self-healing)

## Goal

Kill the two walls that cap the taps concept: **authoring** (someone has to
hand-write CSS selectors per site) and **rot** (sites redesign and taps break
silently). Tapsmith makes taps machine-forged and self-repairing:

- `neurowire tap forge <url>`: point at any feed-less site, get a verified,
  working tap JSON. Heuristics first, LLM only when heuristics fail.
- `neurowire tap heal`: detect broken registered taps and re-derive their
  selectors from the live page, swapping in the fix only after verification.

The LLM proposes; a deterministic verifier disposes. No LLM output ships
unchecked.

## Why a new package

LLM client code (API keys, HTTP, prompt text, retries) must not leak into
`ingest`, which stays deterministic and dependency-light. New package
`@neurowire/tapsmith`:

- Runtime deps: `@neurowire/core`, `@neurowire/ingest`, `zod`. No SDK
  dependency: providers are called over plain `fetch` against their HTTP APIs,
  keeping the package thin (same philosophy as the sinks in the CLI).
- Chain position: `core` <- `ingest` <- `tapsmith` <- `cli`. The CLI grows the
  `tap forge` / `tap heal` subcommands; taps and taps-pack are untouched.

## Design

### 1. Verification gate (deterministic, the heart of the epic)

`verifyTemplate(html, url, template): VerifyReport` in
`tapsmith/src/verify.ts`, built on the existing `applyTemplate`:

- extracted item count (fail under a minimum, default 3)
- every item has a non-empty title and a resolvable absolute link
- links are on-host or declared-host, deduplicated
- date extraction rate if the template claims a date selector
- a stability probe: selectors that match exactly one container pattern rather
  than accidentally matching nav/footer noise (heuristic: item parents share a
  common ancestor)

The report is scored; forge and heal only accept templates above the score
threshold. This gate is what makes LLM involvement safe: candidates that fail
verification are rejected regardless of how confident the model was.

### 2. Forge pipeline (`tapsmith/src/forge.ts`)

```
fetch page (ingest fetchDocument)
  -> proposeTemplate heuristic (already in ingest)
       verified? -> done, zero LLM cost
  -> LLM loop (max N attempts, default 3):
       prompt = distilled DOM outline + prior attempt's VerifyReport failures
       -> candidate FeedTemplate (parsed with FeedTemplateSchema, retried on parse failure)
       -> verifyTemplate
  -> best passing candidate, or a failure report listing every attempt's diagnosis
```

DOM distillation matters: the model never sees raw multi-hundred-KB HTML. A
cheerio pass reduces the page to a skeleton (tag, id, classes, child counts,
trimmed text samples of repeated structures), capped at a few KB. This keeps
cost low and removes most prompt-injection surface, and the output is
constrained anyway: a `FeedTemplate` is data (CSS selector strings validated by
zod), never executable.

### 3. Heal pipeline (`tapsmith/src/heal.ts`)

- `checkTap(tap): TapHealth`: fetch the tap's host page, run `verifyTemplate`
  with the current selectors. Healthy, degraded (score dropped), or broken
  (zero items).
- `healTap(tap)`: run the forge pipeline seeded with the old template and its
  failure report ("these selectors used to work; the site changed"). On a
  verified fix, return the new template; the caller decides where to write it.
- CLI `neurowire tap heal [path|--all]`: checks user taps
  (`~/.config/neurowire/taps/*.json`), writes healed JSON back with the old
  file kept as `<name>.json.bak`, prints a health table. `--dry-run` reports
  without writing. Bundled taps in `taps`/`taps-pack` are code, not user files:
  heal prints the proposed diff for them but never writes into `node_modules`
  or the repo; fixing bundled taps stays a PR workflow (heal makes the PR
  trivial to write).

### 4. Provider abstraction (`tapsmith/src/provider.ts`)

```ts
interface TapsmithProvider {
  name: string
  complete(input: { system: string; prompt: string; maxTokens: number }): Promise<string>
}
```

- `anthropicProvider` (default): Claude API via fetch, model default
  `claude-sonnet-5` (cheap, plenty for selector derivation), key from
  `ANTHROPIC_API_KEY`.
- `openAiCompatProvider`: any OpenAI-compatible endpoint (`baseUrl`, `model`,
  `apiKey`), which covers local runtimes (Ollama, LM Studio) for free healing.
- CLI flags `--provider`, `--model`; env `NEUROWIRE_TAPSMITH_PROVIDER`.
- Tests use a `mockProvider` with canned completions; no network, no keys.

## CLI surface

```
neurowire tap forge <url> [-o file] [--provider p] [--model m] [--attempts n]
neurowire tap heal [path] [--all] [--dry-run] [--provider p]
neurowire tap check [path] [--all]        # health only, no LLM, exit 1 on broken
```

`tap doctor` (the existing heuristic proposal printer) stays as-is; `forge` is
its grown-up sibling. `tap check` is LLM-free and CI-safe, which incidentally
gives taps-pack a rot alarm, but the product here is the forge/heal loop, not
monitoring.

## Non-goals

- No LLM calls at ingest time, ever. Forging and healing are explicit,
  operator-invoked actions; the serving path stays deterministic.
- No autonomous background healing daemon (a `--watch`-style heal loop can come
  later once trust is earned).
- No full-article extraction, no summarization (different epics if ever).
- No bundled-tap auto-editing (repo taps get proposed diffs only).

## Dependencies

None on other epics. Epic 10's `propose_tap` MCP tool can later delegate to
forge, and a future MCP `forge_tap` tool is an easy follow-up, but nothing here
blocks on it.

## Files touched

| File | Change |
|------|--------|
| `packages/tapsmith/package.json`, `tsconfig.json`, `tsup.config.ts` | new package |
| `packages/tapsmith/src/verify.ts` + test | verification gate |
| `packages/tapsmith/src/distill.ts` + test | DOM skeleton distillation |
| `packages/tapsmith/src/forge.ts` + test | heuristic-then-LLM loop |
| `packages/tapsmith/src/heal.ts` + test | health check + reforge |
| `packages/tapsmith/src/provider.ts` + test | provider interface, anthropic + openai-compat + mock |
| `packages/tapsmith/src/prompts.ts` | system/user prompt builders (plain strings, testable) |
| `packages/tapsmith/src/index.ts` | exports |
| `packages/cli/src/index.ts` | `tap forge`, `tap heal`, `tap check` routing |
| `packages/cli/src/pipeline.ts` | pure arg-handling helpers for the new subcommands |
| `vitest.config.ts` | thresholds for `tapsmith` (target 90/95/90 like ingest; the LLM loop is mock-testable) |
| `docs/guide/taps.md` or new `docs/guide/tapsmith.md` | forge/heal guide |
| `docs/reference/tapsmith.md` | new reference page; nav entry |
| `README.md` | package table row |

## Steps

1. `verify.ts` + `distill.ts` with tests against saved-HTML fixtures (reuse the
   fixture style from ingest's autodetect tests). These two are useful alone.
2. Provider layer with the mock provider.
3. Forge loop: heuristic short-circuit, then mocked LLM attempts, error
   feedback threading, schema-parse retries.
4. Heal on top of forge; `.bak` handling; health table rendering.
5. CLI wiring for `forge` / `heal` / `check`.
6. Live gated tests: `NEUROWIRE_LIVE=1 NEUROWIRE_TAPSMITH_LIVE=1` forges a tap
   for one real site with a real key (skipped otherwise).
7. Docs, changelog, `pnpm docs:build`.

## Tests

- Verify: passing/failing templates against fixtures; score boundaries;
  nav/footer false-positive detection.
- Distill: size cap honored; repeated structures sampled not dumped.
- Forge: heuristic success skips the provider entirely (assert zero provider
  calls); failure report after N failed attempts lists per-attempt diagnostics;
  malformed LLM JSON triggers a schema-retry, not a crash.
- Heal: broken fixture heals with the mock provider; `--dry-run` writes
  nothing; `.bak` created exactly once.
- Providers: request shaping against a stubbed fetch (URL, headers, body),
  never a real call in offline tests.

## Risks

- **Nondeterministic LLM output.** Contained by design: verification is
  deterministic and mandatory; the model can only ever hand over data that then
  passes or fails the same gate a human-written tap would.
- **Cost runaway.** Capped attempts, distilled prompts, cheap default model,
  and the heuristic short-circuit means most easy sites cost zero tokens.
- **Prompt injection via page content.** Output is a zod-validated
  `FeedTemplate` (selector strings), never instructions or code; distillation
  strips most free text; the tap is then verified against the same page. Worst
  case is a bad tap that fails verification.
- **Key handling.** Keys only from env, never flags (no shell-history leaks),
  never written to any file; document alongside the existing `.env` discipline.

## Acceptance

- `neurowire tap forge <feed-less site>` produces a tap JSON that `neurowire
  <url> --taps <file>` then serves correctly, with the heuristic path costing
  zero LLM calls on sites `proposeTemplate` already handles.
- Breaking a fixture site's markup makes `tap check` exit 1 and `tap heal`
  (mock provider) restore a passing template.
- All offline tests green with no network and no keys; coverage thresholds
  hold; docs build passes.
