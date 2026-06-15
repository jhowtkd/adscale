# Stack Research: v12.3 Integridade Criativa

**Domain:** Creative derivation pipeline QA hardening (factual integrity, visual hierarchy contracts, observable quality gates, corpus regression fixtures)
**Milestone:** v12.3 Integridade Criativa
**Researched:** 2026-06-15
**Confidence:** HIGH for keep/extend decisions; MEDIUM for optional `zod-to-json-schema` until QA/score schemas are finalized
**Scope:** Stack additions/changes only. Does not re-evaluate Next.js, TypeScript, Vitest, OpenAI image generation, Inngest, or Drizzle.

## Executive Decision

**Do not add a parallel QA stack.** The milestone is implemented by hardening modules already in production:

| Module | Role today | v12.3 stack change |
|--------|------------|-------------------|
| `prompt-builder.ts` | Builds derivation prompts | Inject dead constants `VISUAL_HIERARCHY_CONTRACT` + `ANTI_HALLUCINATION_RULES`; extend `extractPrompt*` helpers |
| `creative-qa.ts` | Vision QA via OpenAI Responses | Tighten output contract (`json_schema` strict) |
| `creative-score.ts` | Vision scoring + Zod normalize | Same schema tightening + factual score caps |
| `creative-quality-gate.ts` | Regex taxonomy → hard failures | New codes/patterns (invented entities, hierarchy overload) |
| `quality-fixtures.ts` | 6 synthetic regression cases | Add corpus-derived fixtures (Cantona, overload, generic template) |
| `derivation.ts` (Inngest job) | Runs gate after generation | Richer `generationLog` + structured logger/Sentry tags |
| Vitest suite | Prompt + gate pipeline tests | Expand fixtures; keep inline snapshots for prompt sections |

**Net new npm dependency:** at most **one** small bridge (`zod-to-json-schema`) if QA/score JSON schemas are generated from shared Zod types. Everything else is configuration and TypeScript inside existing packages.

**Audit driver:** `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` are defined in `prompt-builder.ts` but never appended to `buildDerivationPrompt()` output — regression tests pass while production prompts omit them. Corpus baseline: `app/exports/render-creatives/` (34 peças, média 58,5/100).

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **TypeScript** | ^5 (installed) | Shared contracts for prompts, gate taxonomy, fixtures | Single language for prompt sections, `CreativeContract`, gate classifiers, and test fixtures — no DSL split |
| **Zod** | ^3.0.0 (installed) | Normalize QA/score JSON; validate corpus fixture manifests and contract shapes | Already used in `creative-score.ts` and `env.ts`; extend for new hard-failure metadata and fixture catalog integrity |
| **OpenAI Node SDK** | ^6.34.0 (installed) | Vision QA + scoring on generated creatives (`responses.create` + `input_image`) | Already powers `analyzeCreativeQa` and `analyzeDerivationCreative`; factual integrity is a prompt + schema problem, not a new model vendor |
| **OpenAI Responses API — `text.format: json_schema`** | API surface (SDK 6.x) | Strict structured outputs for QA checklist and score breakdown | Replaces loose `json_object` parsing; reduces silent field drift that lets gate miss failures (HIGH confidence — OpenAI docs, Context7 `/websites/developers_openai_api`) |
| **Vitest** | ^4.1.5 (installed) | Deterministic regression for prompts, gate classification, regeneration briefs | Existing `quality-fixture-pipeline.test.ts`, `quality-prompt-regression.test.ts`; corpus cases become more fixtures, not a second runner |
| **Inngest** | ^4.4.0 (installed) | Async derivation job with `quality-gate` / `quality-gate-after-retry` steps | Gate observability belongs in `generationLog` steps already written by `derivation.ts` — no new queue |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **zod-to-json-schema** | ^3.25.2 (add) | Generate OpenAI `json_schema` from shared Zod types for QA/score | When QA and score response shapes are defined once in Zod and consumed by both `normalize*` and API calls — avoids duplicate hand-maintained JSON Schema |
| **sharp** | ^0.33.0 (installed) | Corpus fixture metadata (width/height/hash) in offline audit scripts | Dev/CI helper only (`scripts/` or `tsx`); **not** a runtime quality gate signal |
| **@sentry/nextjs** | ^10.53.1 (installed) | Tag derivations with `qualityVerdict`, `hardFailureCodes`, gate step failures | Production observability for gate regressions; wire in `creative-quality-gate` / job step catch blocks |
| **tsx** | ^4.19.0 (dev, installed) | Run corpus audit / controlled visual validation scripts | Optional `npm run audit:creative-corpus` against `app/exports/render-creatives/manifest.json` |
| **Node `crypto` (built-in)** | — | Stable fixture IDs from image bytes in corpus manifest | Deduplicate corpus entries when building regression catalog — no `uuid` needed for fixture keys |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Vitest inline snapshots** | Lock prompt section text (`extractPromptHardRulesSection`, hierarchy block) | Already in `quality-prompt-regression.test.ts`; add snapshots for `VISUAL HIERARCHY CONTRACT` and `ANTI-HALLUCINATION` once injected |
| **`quality-fixtures.ts` catalog tests** | Enforce unique failure modes, no private paths, expected verdicts | Extend `FAILURE_MODES` + catalog length when corpus cases land |
| **`run-release-gate.mjs`** | CI gate: unit + lint + build + Playwright release | Add creative QA unit glob to existing `npm test` — **do not** add live OpenAI corpus re-score to default release gate (cost + flake) |
| **Corpus manifest JSON** | `app/tests/fixtures/creative-corpus/manifest.json` (new data, no package) | Maps audited cases → synthetic `rawQaModelOutput` / contracts; references public URLs or committed PNGs under `app/tests/fixtures/` |

### Pipeline Integration Map

```
buildDerivationPrompt()
  └─ inject: VISUAL_HIERARCHY_CONTRACT, ANTI_HALLUCINATION_RULES, mode rules
        ↓
OpenAI Image API (existing)
        ↓
analyzeCreativeQa() / analyzeDerivationCreative()  ← json_schema strict
        ↓
normalizeCreativeQaResult() / normalizeCreativeScoreResult()  ← Zod
        ↓
classifyCreativeQualityGate() / deriveQualityVerdict()  ← taxonomy regex + caps
        ↓
derivations.qualityVerdict, hardFailures, generationLog  ← Postgres jsonb
        ↓
Vitest: QUALITY_FIXTURES + corpus fixtures + prompt snapshots
```

**Prompt regression contract (no new libs):** export `extractPromptVisualHierarchySection()` and `extractPromptAntiHallucinationSection()` mirroring existing `extractPromptHardRulesSection` pattern so tests fail if contracts are declared but not injected.

**Gate observability contract (no new libs):** extend `DerivationGenerationLog` steps with `quality-gate` detail JSON: `{ verdict, hardFailureCodes, scoreStatus, promptContractVersion }`.

---

## Installation

```bash
# Optional — only if adopting Zod → OpenAI json_schema single source of truth
cd app && npm install zod-to-json-schema@^3.25.2
```

**No install required** for the primary milestone path: prompt injection, taxonomy extension, fixture expansion, generation-log enrichment, and Vitest regression all use packages already in `app/package.json`.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| OpenAI vision QA + strict JSON schema | Local OCR (Tesseract) + string diff | Never for ADScale — OCR misses layout/hierarchy and celebrity/brand hallucinations; vision model already in pipeline |
| Zod + optional `zod-to-json-schema` | Hand-written JSON Schema in QA/score calls | Short-term acceptable for 1–2 schemas; becomes error-prone when checklist keys grow |
| TypeScript fixture modules (`quality-fixtures.ts`) | YAML/JSON corpus with `ajv` | If non-engineers must edit fixtures without TS — adds parser + second validation stack; not justified yet |
| Vitest + synthetic `rawQaModelOutput` | Live re-scoring of 34 PNGs in CI | Manual/scheduled `audit:creative-corpus` only — too slow, costly, and flaky for every PR |
| `sharp` metadata in dev scripts | `pixelmatch` / SSIM visual diff | Pixel diff detects rendering shifts, not invented Cantona or hierarchy overload — wrong signal |
| Structured logger + Sentry tags | New metrics vendor (Datadog custom) | Only if gate SLO dashboards are required in v12.3; otherwise Postgres + logs suffice |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **LangChain / LlamaIndex / Vercel AI SDK** | Extra orchestration layer over two OpenAI calls already wrapped in `creative-qa.ts` / `creative-score.ts` | Extend existing functions + shared Zod schemas |
| **Second vision provider** (Claude, Gemini) for gate | Divergent rubrics, dual maintenance, no fix for prompt-not-injected root cause | One rubric; improve prompts + taxonomy |
| **Local ML vision** (ONNX, transformers.js, CLIP) | High integration cost; poor at ad-specific factual rules (CTA drift, style-reference contamination) | OpenAI vision + deterministic gate classifiers |
| **pixelmatch / resemblejs / SSIM** | Measures pixels, not factual integrity or visual hierarchy congestion | Vision QA criteria + hierarchy contract in prompt |
| **ajv / typebox** (parallel to Zod) | Duplicate validation stack; Zod already normalizes score output | Extend existing Zod schemas |
| **mem0ai** for quality gates | Brand memory tool; unrelated to per-derivation hard failures | Keep mem0 for campaign memory only |
| **agentation** for gate logic | UI annotation dependency; not referenced in server pipeline | Fixtures authored in TS from audit notes |
| **New image generation models** | Milestone is QA hardening, not generation quality A/B | Keep `OPENAI_IMAGE_MODEL`; fix prompt + gate |
| **Playwright in default creative QA gate** | UI E2E cannot assert invented entities or hierarchy; expensive | Vitest for logic; optional offline corpus script |
| **Committing full `app/exports/render-creatives/` to git** | Large binary set; ephemeral export path | Curate 3–5 minimal PNGs + synthetic QA outputs under `app/tests/fixtures/creative-corpus/` |

---

## Stack Patterns by Variant

**If hardening factual integrity only (Phase 1):**
- Inject `ANTI_HALLUCINATION_RULES` + extend `creative-quality-taxonomy.ts` with `INVENTED_ENTITY_PATTERN` / new `CreativeHardFailureCode`
- Add corpus fixture: Cantona / invented celebrity case with expected `invalid` verdict
- No new dependencies

**If tightening model output shape (Phase 2):**
- Add `creative-qa.schema.ts` / `creative-score.schema.ts` (Zod)
- Install `zod-to-json-schema`; switch `text: { format: { type: "json_schema", strict: true, ... } } }` in QA and score
- Keep `normalize*` as defense-in-depth

**If observable gates in production (Phase 3):**
- Extend `generationLog` + `logger.info({ derivationId, verdict, hardFailureCodes })`
- Sentry `setTag("quality.verdict", verdict)` in job catch paths
- No new dependencies

**If controlled visual validation (Phase 4 — offline):**
- `tsx scripts/audit-creative-corpus.mjs` reading manifest + calling existing `analyzeCreativeQa` / gate
- Gate script with env `CREATIVE_AUDIT_SAMPLE_SIZE`; not part of `release-gate`
- Uses installed `openai`, `sharp`, `tsx`

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `openai@^6.34.0` | Responses `text.format.json_schema` | Matches current `getOpenAI().responses.create` usage in `creative-qa.ts` |
| `zod@^3.0.0` | `zod-to-json-schema@^3.25.2` | Use v3 line of zod-to-json-schema; do not install v4 alpha |
| `zod@^3` | OpenAI `strict: true` schemas | All checklist keys must be `required`; optional `styleFidelity` needs explicit union schema per mode |
| `vitest@^4.1.5` | `toMatchInlineSnapshot` for prompt sections | Snapshot updates expected when hierarchy/anti-hallucination blocks are injected |
| `@sentry/nextjs@^10.53` | Zod errors integration | Already bundled; use tags/context, not new SDK |

---

## Environment Variables (no new secrets)

| Variable | Status | Purpose |
|----------|--------|---------|
| `OPENAI_API_KEY` | existing | QA + score vision calls |
| `OPENAI_TEXT_MODEL` | existing (default `gpt-5-mini`) | QA/score model; corpus audit uses same |
| `LOG_LEVEL` | existing | Gate step verbosity |
| `CREATIVE_AUDIT_SAMPLE_SIZE` | **optional new** | Cap offline corpus script cost (e.g. `5`) |
| `CREATIVE_PROMPT_CONTRACT_VERSION` | **optional new** | Bump when hierarchy/anti-hallucination text changes; logged in `generationLog` |

---

## Sources

- `app/package.json` — installed versions (OpenAI 6.34, Zod 3, Vitest 4.1.5, sharp 0.33, Sentry 10.53, Inngest 4.4)
- `app/src/server/ai/prompt-builder.ts` — `VISUAL_HIERARCHY_CONTRACT` / `ANTI_HALLUCINATION_RULES` defined but not injected into `buildDerivationPrompt` (verified 2026-06-15)
- `app/src/server/ai/creative-qa.ts` — `responses.create` with `text.format.type: "json_object"` (candidate for `json_schema`)
- `app/src/server/ai/creative-quality-gate.ts`, `creative-quality-taxonomy.ts` — hard failure taxonomy
- `app/src/server/ai/quality-fixtures.ts` — six synthetic regression fixtures
- `app/tests/unit/ai/quality-prompt-regression.test.ts` — prompt snapshot regression pattern
- `.planning/PROJECT.md` — v12.3 scope, corpus baseline, target metrics (≥75 média, ≥95 fidelidade)
- `.planning/STATE.md` — root-cause notes (rules declared but not injected; gate treats generic as polish)
- Context7 `/websites/developers_openai_api` — Responses API `text.format.json_schema` with `strict: true` (HIGH confidence)
- `npm view zod-to-json-schema` — latest 3.25.2 (MEDIUM confidence until adopted in repo)

---
*Stack research for: v12.3 Integridade Criativa — creative pipeline QA hardening*
*Researched: 2026-06-15*
