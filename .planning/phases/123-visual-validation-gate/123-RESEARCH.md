# Phase 123: Visual Validation Gate — Research

**Researched:** 2026-06-15
**Domain:** Live creative pipeline validation — controlled before/after generation, vision rubric scoring, milestone release gate
**Confidence:** HIGH for architecture and CI/operator split; MEDIUM for vision-score stability and exact 12-criterion aggregation until operator baseline captured

## Summary

Phases 115–122 hardened prompts, gate classifiers, score ceilings, and regression tests — all **without live OpenAI image generation in CI**. Phase 123 is the v12.3 **milestone release gate** that closes the loop with **controlled live validation**: same canonical campaigns and contracts, paired before (pre-fix corpus PNGs) vs after (post-fix regeneration), vision QA + score + gate on real pixels, and measurable thresholds (≥75 mean quality, ≥95% factual fidelity).

The codebase already has every production primitive needed: `analyzeCreativeQa`, `analyzeDerivationCreative`, `classifyCreativeQualityGate`, `computeQualityGateFromAnalysis`, `applyScoreCeilings`, `CANONICAL_CAMPAIGNS`, corpus fixtures, and the Phase 109/114 **evidence JSON + check script** pattern (`check-visual-evidence.mjs`, `run-release-gate.mjs`). What is missing is a **CI-safe evidence validator** and an **operator-run generation/scoring orchestrator** wired to a fixed validation matrix — not new gate logic.

**Primary recommendation:** Mirror Phase 109/114: operator captures `123-EVIDENCE.json` via a new `run-creative-validation.ts` (live OpenAI + vision); CI runs `npm test` / `lint` / `build` plus `check-creative-validation-evidence.mjs --stage final` on committed evidence. Do **not** put live image generation in GitHub CI.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-18 | Controlled before/after generation with same campaign and seed when supported for each mode in representative formats | Validation matrix below; before = corpus PNGs + manifest metadata; after = operator regeneration via derivation prompt path; seed documented as non-API (use fixed contract + base asset + `promptProvenance` hash) [VERIFIED: ROADMAP Phase 123; generate-all-outputs.ts lacks seed] |
| QA-19 | 12-criteria rubric on post-correction set: overall average ≥75 and factual fidelity ≥95 | Aggregate `qualityScore` mean ≥75; fidelity rate = % pieces with zero fidelity-class hard failures ≥95%; 12 criteria = 6 QA + 7 score dimensions − 1 shared `briefMatch` [VERIFIED: creative-quality-taxonomy.ts; FEATURES.md corpus eval] |
| QA-20 | No invented entities and no replaced campaigns in validation set | Reuse `classifyCreativeQualityGate` fidelity codes + `assertDerivationApprovable`; forbid `invented_factual_entity`, `campaign_identity_drift`, `style_reference_contamination`, `replaced_source_subject`, brand/offer drift codes [VERIFIED: creative-quality-gate.ts] |
| QA-21 | `npm test`, `npm run lint`, `npm run build` pass with milestone regression coverage | Same orchestration as Phase 114 `run-release-gate.mjs`; Phase 122 already green (1448 tests) [VERIFIED: 122-VERIFICATION.md] |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Controlled image regeneration | Operator script (CLI) | API / derivation job (reuse internals) | OpenAI image API is costly, non-deterministic, needs secrets — explicitly out of CI per Phase 122 |
| Before corpus reference | Static assets + manifest | CDN (`public_url` in manifest) | Pre-fix PNGs are audit baseline; may be gitignored — fetch via R2 URLs or local `app/exports/render-creatives/` |
| Vision QA + score (12-criteria rubric) | API / Backend (`creative-qa.ts`, `creative-score.ts`) | — | Vision models run server-side; prompts already inject observable rubric + allowedEntities |
| Hard-failure / entity / campaign drift detection | API / Backend (`creative-quality-gate.ts`) | — | Deterministic classifiers on QA notes + score issues; no hand-rolled vision logic |
| Threshold enforcement (≥75 / ≥95%) | CI check script | Operator report in evidence JSON | CI validates committed evidence; operator produces it |
| Milestone regression (TEST-01–04) | CI (`npm test`) | — | Phase 122 suites remain gate; Phase 123 adds evidence check, not duplicate matrix tests |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.9 [VERIFIED: npm registry] | Threshold unit tests, aggregation helpers | Project test runner; Phase 122 pattern |
| sharp | 0.35.1 [VERIFIED: npm registry] | PNG metadata, normalize regenerated outputs | Already in `generate-all-outputs.ts`, thumbnail tests |
| openai | 6.42.0 [VERIFIED: npm registry] | `images.edit` + vision via `responses.create` | Production stack in `derivation.ts`, `creative-qa.ts` |
| Existing server AI modules | — | QA, score, gate, corpus, prompt-builder | Brownfield — no new scoring framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `check-visual-evidence.mjs` pattern | — | SHA256 artifact validation, staged before/after/final | Adapt for `check-creative-validation-evidence.mjs` |
| `test-creatives.ts` | — | Batch vision QA + gate evaluation on local images | Reference for operator scoring loop |
| `corpus-fixtures.ts` / `creative-corpus.ts` | — | Canonical campaigns, archetypes, allowedEntities | Matrix contracts and QA-20 denylist |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Committed `123-EVIDENCE.json` + PNG hashes | Live CI vision re-score | CI would need `OPENAI_API_KEY`, flaky scores, cost — rejected per Phase 122 |
| Re-score entire 34-piece corpus | Minimal validation matrix (~8 cells) | Full corpus is expensive; matrix covers all modes + failure archetypes |
| New OCR/entity CV pipeline | Gate classifiers on vision JSON | FEATURES.md defers CV; gate+QA path already encodes v12.3 work |

**Installation:** No new dependencies required.

## Architecture Patterns

### System Architecture Diagram

```text
                    OPERATOR (local / release machine)
                              │
         OPENAI_API_KEY + base assets (repo fixtures or corpus parents)
                              │
                              ▼
              ┌───────────────────────────────┐
              │  run-creative-validation.ts   │
              │  • load VALIDATION_MATRIX     │
              │  • before: corpus PNG refs    │
              │  • after: images.edit regen   │
              │  • analyzeCreativeQa          │
              │  • analyzeDerivationCreative  │
              │  • computeQualityGate...      │
              └───────────────┬───────────────┘
                              │ writes
                              ▼
              .planning/phases/123.../123-EVIDENCE.json
              app/exports/render-creatives/validation-after/*.png
                              │
         CI (no OpenAI generation) │
                              ▼
              ┌───────────────────────────────┐
              │ check-creative-validation-    │
              │ evidence.mjs --stage final    │
              │ • matrix completeness         │
              │ • sha256 PNG hashes           │
              │ • meanQualityScore ≥ 75       │
              │ • factualFidelityRate ≥ 0.95  │
              │ • zero fidelity hard failures │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ run-creative-release-gate.mjs │
              │ npm test → lint → build →     │
              │ check-creative-validation...  │
              └───────────────────────────────┘
```

### Recommended Project Structure

```text
app/scripts/
  creative-validation-matrix.ts    # Single source: campaigns × modes × formats
  run-creative-validation.ts       # Operator: generate + score + write evidence
  check-creative-validation-evidence.mjs  # CI: validate 123-EVIDENCE.json + PNGs
  run-creative-release-gate.mjs    # Orchestrator (mirror run-release-gate.mjs)

.planning/phases/123-visual-validation-gate/
  123-EVIDENCE.json                # Committed after operator run
  123-VERIFICATION.md              # Generated at final stage
  123-BASELINE.md                  # Human-readable before/after table

app/tests/unit/ai/
  creative-validation-thresholds.test.ts  # Pure aggregation on fixture JSON

app/exports/render-creatives/
  manifest.json                    # Before corpus (existing)
  validation-after/                # Post-fix PNGs (operator output, committed subset)
```

### Pattern 1: CI-safe vs operator-run split

**What:** Phase 122 scoped out live generation in CI; Phase 123 is explicitly the **live validation** milestone gate but still splits **production** from **verification**.

| Layer | Runs where | Requires `OPENAI_API_KEY` | Blocks release if fail |
|-------|------------|---------------------------|------------------------|
| Regression (QA-21) | CI | No | Yes |
| Evidence structure + thresholds (QA-19, QA-20) | CI | No (reads committed JSON) | Yes |
| Regeneration + vision scoring (QA-18) | Operator machine | Yes | Produces evidence |
| Optional: re-run operator after prompt change | Operator | Yes | Refreshes evidence |

**When to use:** Every v12.3 ship; same pattern as Phase 108 (automated green + documented operator gates) and Phase 114 (Playwright capture operator-side, `check-release-gate.mjs` in CI).

### Pattern 2: Before / after evidence structure

**What:** Adapt Phase 109 `109-EVIDENCE.json` schema for creatives.

**Before captures** — point at pre-fix audit corpus (no regeneration):

- `source: "corpus"`
- `corpusRefId` / `idPrefix` from `CORPUS_MANIFEST_INDEX`
- `path` → `app/exports/render-creatives/{fileName}` or `public_url`
- `sha256` of PNG
- `auditArchetype` when applicable (from manifest-index enrichment)
- `qualityScore` / `verdict` from original audit (optional baseline metadata)

**After captures** — post-fix pipeline output:

- `source: "regenerated"`
- Same `matrixKey` as before (campaign slug + mode + format)
- `path` → `app/exports/render-creatives/validation-after/{matrixKey}__{hash}.png`
- `sha256`, `promptProvenanceHash` (hash of `buildDerivationPrompt` output or git hash of prompt-builder)
- `qa`, `score`, `gate`: normalized outputs from production analyzers
- `hardFailures[]`, `qualityVerdict`, `qualityScore` (post-ceiling)

**Final stage** adds `aggregate` and `requirements` rows for QA-18–21.

### Pattern 3: Twelve-criteria rubric and thresholds

**What:** The rubric is the **existing** QA + score surface, not a new checklist.

| # | Criterion | Source | Factual? |
|---|-----------|--------|----------|
| 1 | legibility | QA `checklist.legibility` | No |
| 2 | ctaOffer | QA `checklist.ctaOffer` | Partial |
| 3 | informationPreservation | QA `checklist.informationPreservation` | Yes |
| 4 | briefMatch | QA `checklist.briefMatch` | Yes |
| 5 | formatFit | QA `checklist.formatFit` | No |
| 6 | creativeRisk | QA `checklist.creativeRisk` | Partial |
| 7 | textLegibility | score `scoreBreakdown.textLegibility` | No |
| 8 | ctaClarity | score `scoreBreakdown.ctaClarity` | Partial |
| 9 | visualQuality | score `scoreBreakdown.visualQuality` | No |
| 10 | formatFit (score) | score `scoreBreakdown.formatFit` | No |
| 11 | variationLevelFit | score `scoreBreakdown.variationLevelFit` | No |
| 12 | informationPreservation (score) | score `scoreBreakdown.informationPreservation` | Yes |

[VERIFIED: creative-quality-taxonomy.ts — 6 QA core + 7 score keys; `briefMatch` appears in QA and score but counts once in taxonomy ID set (8 dimensions); requirement "12" = dual evaluation surfaces per FEATURES.md / v11.5 AIQ-01 decomposition]

**QA-19 enforcement (prescriptive):**

```typescript
// Overall ≥75 — use capped gate score, not raw vision output
const meanQualityScore =
  afterCaptures.reduce((s, c) => s + c.qualityScore, 0) / afterCaptures.length;
assert(meanQualityScore >= 75);

// Factual fidelity ≥95% — gate-based, not subjective
const FIDELITY_CODES = new Set([
  "invented_factual_entity",
  "campaign_identity_drift",
  "style_reference_contamination",
  "wrong_brand",
  "unauthorized_brand_or_ip",
  "unsupported_offer",
  "replaced_source_subject",
]);

const fidelityPassCount = afterCaptures.filter(
  (c) => !c.hardFailures.some((f) => FIDELITY_CODES.has(f.code))
).length;
const factualFidelityRate = fidelityPassCount / afterCaptures.length;
assert(factualFidelityRate >= 0.95);
```

### Pattern 4: Programmatic invented-entity and campaign-substitution detection (QA-20)

**What:** Do not hand-roll vision parsing. Use the production gate stack:

1. `analyzeCreativeQa` → `normalizeCreativeQaResult`
2. `analyzeDerivationCreative` → `normalizeCreativeScoreResult`
3. `classifyCreativeQualityGate({ checklist, contract, scoreIssues })`
4. `applyScoreCeilings` + `computeQualityGateFromAnalysis`
5. `deriveQualityVerdict` + `assertDerivationApprovable`

**Fidelity failure codes** (must be zero across validation set for QA-20):

- `invented_factual_entity` — `INVENTED_ENTITY_PATTERN` on briefMatch/creativeRisk notes [VERIFIED: creative-quality-gate.ts:199-205, 260-265]
- `campaign_identity_drift` — `hasCampaignIdentityDrift` for format_adaptation [VERIFIED: creative-quality-gate.ts:133-141]
- `style_reference_contamination` — restyling factual leak [VERIFIED: corpus-fixtures restyling archetype]
- `replaced_source_subject`, `wrong_brand`, `unauthorized_brand_or_ip`, `unsupported_offer`

**Supplementary CI test (deterministic):** Feed `CORPUS_ARCHETYPE_FIXTURES` synthetic QA through gate and assert validation-matrix denylist codes never appear on after-capture fixture JSON (regression guard).

**allowedEntities cross-check:** `resolveAllowedEntitiesForCampaign` + QA prompt already instructs model to compare visible entities [VERIFIED: creative-qa.ts:131-136]. Gate remains source of truth for pass/fail.

### Pattern 5: Seed and reproducibility (QA-18)

**What:** OpenAI `images.edit` does not expose a user-facing seed in the current ADScale integration [ASSUMED: no seed param in `derivation.ts` / `generate-all-outputs.ts`; OpenAI image API historically non-deterministic].

**Reproducibility contract when seed unsupported:**

- Fixed `CanonicalCampaignSlug` + `CreativeContract` from `creative-validation-matrix.ts`
- Fixed base asset file committed under `app/tests/fixtures/creative-corpus/base-assets/`
- Fixed `creativeLevel` per matrix row
- Record `promptProvenanceHash` = `git hash-object` of prompt-builder.ts or hash of built prompt string
- Record `openaiImageModel` from `env.OPENAI_IMAGE_MODEL` [VERIFIED: env.ts default `gpt-image-2-2026-04-21`]

Document in evidence: `"seedSupported": false` — satisfies ROADMAP "quando suportado".

### Anti-Patterns to Avoid

- **Live generation in GitHub Actions:** Flaky, costly, secret-dependent — Phase 122 explicit out-of-scope.
- **Reusing `generate-all-outputs.ts` paths:** Hardcoded `/Users/jhonatan/Desktop/...` — not CI-safe [VERIFIED: generate-all-outputs.ts:11-13].
- **Threshold on uncapped vision scores:** Ceilings from Phase 121 must apply before ≥75 check.
- **Rescoring before corpus as "after":** After set must be **post-fix regeneration**, not old PNGs.
- **Customer production assets in repo:** Use canonical campaigns + committed sanitized base assets only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vision QA prompts | Custom rubric text | `buildCreativeQaPrompt` + `buildObservableQaRubricSection` | Phase 119 parity; gate patterns depend on note shape |
| Entity hallucination regex | New pattern set | `INVENTED_ENTITY_PATTERN`, `classifyBriefMatchFailed` | Phase 117–120 tuned patterns |
| Campaign drift detection | Image similarity / CLIP | `hasCampaignIdentityDrift` + format_adaptation classifiers | Audit failures were narrative drift, not pixel distance |
| Score aggregation | Ad-hoc averages | `computeQualityGateFromAnalysis` + `applyScoreCeilings` | Single source for DB persistence |
| Release orchestration | One-off shell | `run-release-gate.mjs` pattern | Proven in v12.2 Phase 114 |

## Common Pitfalls

### Pitfall 1: Evidence stale after prompt change

**What goes wrong:** CI passes committed evidence while production prompts drifted.

**Why it happens:** Evidence records `promptProvenanceHash` at capture time but CI does not re-check against current prompt-builder.

**How to avoid:** In `check-creative-validation-evidence.mjs --stage final`, assert `evidence.pipeline.promptHash === git hash-object app/src/server/ai/prompt-builder.ts` OR mark `stale: true` with explicit operator refresh requirement.

**Warning signs:** Phase 116–121 commits after evidence timestamp.

### Pitfall 2: Vision score non-determinism fails threshold

**What goes wrong:** Operator re-run scores 74 vs 76 on identical PNG.

**Why it happens:** Documented in `60-LIMITATIONS.md` — vision JSON varies run-to-run.

**How to avoid:** Run scoring once per release; commit evidence; use gate hard failures (deterministic) for QA-20; allow small buffer only if product accepts (default: no buffer).

**Warning signs:** `scoreStatus: "failed"` or empty breakdown in evidence.

### Pitfall 3: Untracked corpus PNGs break CI hash check

**What goes wrong:** `app/exports/render-creatives/*.png` are gitignored locally; CI missing before artifacts.

**Why it happens:** Git status shows `??` on exports — large binaries not committed.

**How to avoid:** Commit **validation matrix subset** only (8–10 PNGs) under `validation-after/` + manifest entries; before refs use `public_url` fetch in operator script with cached sha256 in evidence.

### Pitfall 4: Confusing audit corpus fail with post-fix fail

**What goes wrong:** Before captures include Cantona-class failures; operator compares wrong sets.

**How to avoid:** Before = historical audit IDs documented in evidence; after = fresh regeneration only; thresholds apply **only to afterCaptures**.

## Code Examples

### Validation matrix entry (recommended)

```typescript
// app/scripts/creative-validation-matrix.ts
export const CREATIVE_VALIDATION_MATRIX = [
  {
    key: "teste-3-nr1:art_variation:1:1",
    canonicalSlug: "teste-3-nr1",
    mode: "art_variation",
    format: "1:1",
    beforeCorpusRefId: "6fc63100", // optional archetype anchor
    creativeLevel: "balanced",
    baseAsset: "nr1-1x1-base.png",
  },
  {
    key: "teste-3-nr1:format_adaptation:9:16",
    canonicalSlug: "teste-3-nr1",
    mode: "format_adaptation",
    format: "9:16",
    beforeCorpusRefId: "27069645", // invented_entity audit ref
    baseAsset: "nr1-1x1-base.png",
  },
  {
    key: "teste-3-nr1:format_adaptation:4:5",
    canonicalSlug: "teste-3-nr1",
    mode: "format_adaptation",
    format: "4:5",
    beforeCorpusRefId: "c2c12774", // faithful positive
    baseAsset: "nr1-1x1-base.png",
  },
  {
    key: "nova-campanha:restyling:1:1",
    canonicalSlug: "nova-campanha",
    mode: "restyling",
    format: "1:1",
    beforeCorpusRefId: "d7d9d323",
    baseAsset: "educacao-base.png",
    styleAsset: "educacao-style-ref.png",
  },
  {
    key: "teste-campanha-nr1:art_variation:1:1",
    canonicalSlug: "teste-campanha-nr1",
    mode: "art_variation",
    format: "1:1",
    beforeCorpusRefId: "8a2bebf9", // overload archetype
    baseAsset: "master-nr1-base.png",
  },
  {
    key: "smoke:art_variation:1:1",
    canonicalSlug: "smoke",
    mode: "art_variation",
    format: "1:1",
    beforeCorpusRefId: "8907bce5", // known good final
    baseAsset: "smoke-base.png",
  },
] as const;
```

[VERIFIED: corpus-fixtures corpusRefIds; CANONICAL_CAMPAIGNS typicalModes/formats]

### Scoring loop (operator script)

```typescript
// Source: pattern from app/scripts/test-creatives.ts + creative-quality-gate.ts
import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { analyzeDerivationCreative } from "@/server/ai/creative-score";
import { computeQualityGateFromAnalysis } from "@/server/ai/creative-quality-gate";

const qa = await analyzeCreativeQa({ imageBuffer, mimeType, locale: "pt-BR", campaign, derivation, contract });
const score = await analyzeDerivationCreative({ imageBuffer, mimeType, locale: "pt-BR", campaign, derivation, contract });
const gated = computeQualityGateFromAnalysis({
  checklist: qa.checklist,
  contract,
  scoreIssues: score.scoreIssues,
  qualityScore: score.qualityScore,
  scoreBreakdown: score.scoreBreakdown,
});
```

### Evidence check (CI)

```javascript
// Adapted from app/scripts/check-visual-evidence.mjs --stage final
if (evidence.aggregate.meanQualityScore < 75) {
  errors.push(`meanQualityScore ${evidence.aggregate.meanQualityScore} < 75`);
}
if (evidence.aggregate.factualFidelityRate < 0.95) {
  errors.push(`factualFidelityRate ${evidence.aggregate.factualFidelityRate} < 0.95`);
}
for (const capture of evidence.afterCaptures) {
  for (const failure of capture.hardFailures ?? []) {
    if (FIDELITY_CODES.has(failure.code)) {
      errors.push(`${capture.key} fidelity hard failure: ${failure.code}`);
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tests pass without visual proof | Corpus fixtures + gate matrix (115–122) | 2026-06-15 | Synthetic regression only until Phase 123 |
| `BASELINE_GAP_COUNT = 4` | `BASELINE_GAP_COUNT = 0` | Phase 120 | Gate expects corpus archetypes invalid |
| `generate-all-outputs.ts` ad-hoc desktop paths | Matrix-driven repo-relative script | Phase 123 | CI-safe operator workflow |
| UI visual evidence (109) | Creative pipeline evidence (123) | v12.3 | Same JSON/check-script pattern, different domain |

**Deprecated/outdated:**

- Using audit corpus mean 58.5 as pass/fail — baseline documents failure; after set must meet ≥75.
- QA export-softening — removed Phase 119; validation must use honest QA notes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenAI image edit API has no seed param in ADScale integration | Pattern 5 | Operator cannot guarantee pixel-identical regen; document provenance hash instead |
| A2 | "12 critérios" = 6 QA checklist + 7 score dimensions − 1 shared briefMatch | Pattern 3 | Threshold math wrong — confirm with product owner |
| A3 | Factual fidelity ≥95% = % pieces with zero fidelity-class hard failures | Pattern 3 | **RESOLVED** — gate-based rate primary; dimension means documented for transparency only |
| A4 | Committed validation-after PNG subset is acceptable vs full 34 corpus | Pitfall 3 | Matrix may miss edge campaigns |
| A5 | Vision score variance ± few points on re-run | Pitfall 2 | Operator may need multiple attempts without committed evidence policy |

## Open Questions (RESOLVED)

1. **Commit corpus PNGs or R2-only?** — **RESOLVED:** Commit matrix subset (`validation-after/` outputs + base assets) and `123-EVIDENCE.before-fixture.json` for CI. Operator script fetches before PNGs from manifest `public_url` when local `app/exports/render-creatives/` file missing; evidence stores sha256 either way.

2. **Exact factual fidelity formula (QA-19)** — **RESOLVED:** Primary pass/fail = gate-based rate: % of after captures with zero fidelity-class hard failures ≥ 95%. Mean capped `qualityScore` ≥ 75 on after set. Document per-capture dimension means (`informationPreservation`, `briefMatch`, etc.) in evidence/BASELINE for transparency only — not alternate pass criteria.

3. **Restyling matrix scope** — **RESOLVED:** Minimum one restyling cell required: `nova-campanha:restyling:1:1` (already in 6-cell matrix). Additional NR1 restyling row deferred unless operator budget allows post-milestone.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Scripts + npm test | ✓ | (project standard) | — |
| `OPENAI_API_KEY` | Operator regeneration + vision | Operator only | — | Cannot run QA-18 live; CI uses committed evidence only |
| Corpus PNGs / R2 URLs | Before captures | ✓ local / CDN | — | Fetch from manifest `public_url` |
| vitest | QA-21 | ✓ | 4.1.9 | — |
| sharp | Image normalize | ✓ | 0.35.1 | — |
| Postgres / Inngest | Phase 123 gate | Not required | — | Script path bypasses full derivation job |

**Missing dependencies with no fallback:**

- `OPENAI_API_KEY` on operator machine blocks **fresh** evidence generation (CI can still validate last committed evidence).

**Missing dependencies with fallback:**

- Local corpus files missing → fetch via `public_url` in manifest.json [VERIFIED: manifest.json entries].

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9 |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/ai/creative-validation-thresholds.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QA-18 | Matrix keys paired before/after; sha256 artifacts | integration (script) | `node app/scripts/check-creative-validation-evidence.mjs --stage final` | ❌ Wave 0 |
| QA-18 | Matrix definition covers all modes | unit | `cd app && npm test -- tests/unit/ai/creative-validation-matrix.test.ts` | ❌ Wave 0 |
| QA-19 | meanQualityScore ≥ 75 enforced | unit | `cd app && npm test -- tests/unit/ai/creative-validation-thresholds.test.ts` | ❌ Wave 0 |
| QA-19 | factualFidelityRate ≥ 0.95 enforced | unit | same | ❌ Wave 0 |
| QA-20 | No fidelity hard failures on after set | script + unit | check script + gate fixture test | partial (gate tests exist) |
| QA-21 | Full regression green | integration | `cd app && npm test && npm run lint && npm run build` | ✅ |

### Sampling Rate

- **Per task commit:** `npm test -- tests/unit/ai/creative-validation-thresholds.test.ts`
- **Per wave merge:** `cd app && npm test && npm run lint`
- **Phase gate:** `node app/scripts/run-creative-release-gate.mjs` (includes evidence final check)

### Wave 0 Gaps

- [ ] `app/scripts/creative-validation-matrix.ts` — canonical matrix (QA-18)
- [ ] `app/scripts/run-creative-validation.ts` — operator generate + score
- [ ] `app/scripts/check-creative-validation-evidence.mjs` — CI validator (adapt `check-visual-evidence.mjs`)
- [ ] `app/scripts/run-creative-release-gate.mjs` — orchestrator
- [ ] `app/tests/unit/ai/creative-validation-thresholds.test.ts` — pure threshold math
- [ ] `.planning/phases/123-visual-validation-gate/123-EVIDENCE.json` — operator capture
- [ ] `app/package.json` scripts: `validate:creative`, `validate:creative:live`, `creative-release-gate`
- [ ] Base assets under `app/tests/fixtures/creative-corpus/base-assets/` (sanitized, committed)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes | Matrix keys + contract builders; no user-supplied paths in check script |
| V6 Cryptography | Yes | SHA256 for artifact integrity (not for secrets) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `OPENAI_API_KEY` in CI logs | Information disclosure | Operator-only script; never log key |
| Path traversal in evidence paths | Tampering | Resolve paths under repo root; reject `..` |
| Uncommitted customer creatives | Information disclosure | Canonical fixtures only; no production workspace exports |

## Project Constraints (from .cursor/rules/)

- Use Context7 for external library docs when touching OpenAI SDK APIs [context7.mdc]
- Render ephemeral filesystem — validation PNGs for deploy proof live in git/evidence, not on Render disk [render-platform.mdc]
- Run tests after code changes; verify build before commit [AGENTS.md / workspace rules]
- No commits unless requested — evidence PNG commit is a deliberate release act

## Sources

### Primary (HIGH confidence)

- `app/scripts/check-visual-evidence.mjs` — before/after/final evidence pattern (Phase 109)
- `app/scripts/run-release-gate.mjs`, `check-release-gate.mjs` — release gate orchestration (Phase 114)
- `app/src/server/ai/creative-qa.ts`, `creative-score.ts`, `creative-quality-gate.ts` — production scoring path
- `app/src/server/ai/creative-quality-taxonomy.ts` — 12-criterion decomposition, regex patterns
- `app/src/server/ai/corpus-fixtures.ts`, `creative-corpus.ts` — matrix anchors, allowedEntities
- `app/exports/render-creatives/manifest.json` — 34-piece audit corpus
- `.planning/phases/122-regression-test-suite/122-RESEARCH.md` — live generation out of CI
- `.planning/phases/115-corpus-fixtures-and-audit-baseline/115-RESEARCH.md` — corpus archetypes
- `.planning/research/FEATURES.md` — corpus eval, fidelity rate definition
- npm registry — vitest 4.1.9, sharp 0.35.1, openai 6.42.0

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` — Phase E visual validation script
- `.planning/milestones/v11.5-phases/60-quality-fixtures-and-verification/60-LIMITATIONS.md` — vision variability
- `app/scripts/test-creatives.ts`, `generate-all-outputs.ts` — operator script anti-patterns

### Tertiary (LOW confidence)

- OpenAI image API seed support — not found in codebase [ASSUMED: unsupported]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — brownfield modules, proven release-gate pattern
- Architecture: HIGH — CI/operator split explicit in Phases 108, 114, 122
- Pitfalls: MEDIUM — vision non-determinism and gitignored corpus need operator policy

**Research date:** 2026-06-15
**Valid until:** 2026-06-22 (vision gate); 2026-07-15 (stable architecture)

## RESEARCH COMPLETE

**Phase:** 123 - Visual Validation Gate
**Confidence:** HIGH

### Key Findings

- Phase 123 should **not** run live OpenAI generation in CI — mirror Phase 109/114: operator produces `123-EVIDENCE.json`, CI validates structure, hashes, and thresholds.
- Production scoring path (`analyzeCreativeQa` + `analyzeDerivationCreative` + `computeQualityGateFromAnalysis`) is complete; phase adds orchestration + evidence, not new gate rules.
- Recommended validation matrix: 6 cells covering all three modes (`teste-3-nr1`, `nova-campanha`, `teste-campanha-nr1`, `smoke`) with before corpus refs tied to audit archetypes.
- QA-19: mean capped `qualityScore` ≥ 75 on after captures; factual fidelity ≥ 95% = share of after captures with zero fidelity-class hard failures.
- QA-20: enforce via existing gate codes — never hand-roll entity detection.
- `generate-all-outputs.ts` is unsuitable (hardcoded desktop paths); build repo-relative `run-creative-validation.ts`.

### File Created

`.planning/phases/123-visual-validation-gate/123-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new deps; modules traced in codebase |
| Architecture | HIGH | Phase 114/109 pattern directly applicable |
| Pitfalls | MEDIUM | Vision variance + untracked PNGs need release policy |

### Open Questions

All resolved — see **Open Questions (RESOLVED)** section above.

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
