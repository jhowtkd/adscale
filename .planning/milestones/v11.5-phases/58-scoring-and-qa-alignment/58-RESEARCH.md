# Phase 58: Scoring and QA Alignment - Research

**Researched:** 2026-06-05
**Phase:** 58 - Scoring and QA Alignment
**Question:** What must change in score, QA, gate, and UI so taxonomy, normalization, hard failures, verdicts, and copy all agree?

## Summary

Phase 58 is an alignment pass on existing primitives from prior milestones — not a pipeline redesign. The highest-impact bugs are:

1. **`creative-score.ts` defaults missing JSON fields to 70** (`?? 70` on every breakdown dimension and `qualityScore`), which contradicts AIQ-02 and can produce high-confidence-looking scores before gate classifies `invalid`.
2. **`classifyCtaOfferFailed` only hard-fails when `ctaSemantics.kind === "explicit"`** — inherited CTA contracts skip `cta_drift` even when `ctaOffer` checklist is `failed` (AIQ-03 gap).
3. **`classifyCreativeQualityGate` routes all `scoreIssues` to polish only** (lines 237–239) — contract-violation score issues never promote to hard failures (AIQ-04 gap).
4. **UI shows raw `failure.message` only** — no localized per-code titles; EN/PT section labels exist but hard-failure codes lack dedicated i18n keys (AIQ-05 gap).

A shared `creative-quality-taxonomy.ts` module is the integration anchor for score aliases, QA criterion IDs, display order, and shared regex pattern exports for gate promotion.

## Current Implementation Findings

### creative-score.ts

- `ScoreResult` with `scoreStatus: "heuristic" | "analyzed" | "failed"`.
- `analyzeDerivationCreative` parses JSON inline with `clamp(parsed.scoreBreakdown?.ctaClarity ?? 70)` for all seven breakdown keys and `qualityScore ?? 70`.
- Prompt uses score-side names (`ctaClarity`, `textLegibility`, `visualQuality`) not QA taxonomy names.
- `buildRegenerationSuggestion` / `buildHardFailureRegenerationSuggestion` already contract-aware from Phase 57.
- Heuristic path (`scoreDerivationHeuristic`) is intentionally optimistic — must remain distinguishable via `scoreStatus: "heuristic"`.

### creative-qa.ts

- `CreativeQaCriterion` union duplicated locally (7 values including `styleFidelity`).
- `normalizeCreativeQaResult`: per-criterion fallback note `"Needs a quick manual review."`; `hasFallback` forces top-level `status: "warning"`.
- `styleFidelity` only included when model returns it (correct for non-restyling).
- Unknown checklist keys are silently ignored today (only `CRITERIA` + optional `styleFidelity` read).
- Gap: when model returns `status: "ready"` but all core criteria used fallback notes, normalization already downgrades to `warning` via `hasFallback` — verify and add explicit rejection of `ready` in that case per CONTEXT.

### creative-quality-gate.ts

- Seven `CreativeHardFailureCode` values (locked — no new codes).
- `classifyCtaOfferFailed`: `unsupported_offer` precedence, then `cta_drift` only for explicit CTA.
- `deriveQualityVerdict`: hard failures → `invalid`; else score < 70 or checklist warning → `improvable`; else `acceptable`.
- `computeQualityGateFromAnalysis` and `runCompletedDerivationQualityGate` share classification path.
- Pattern constants: `WRONG_BRAND_PATTERN`, `UNSUPPORTED_OFFER_PATTERN` — candidate for shared export with score-issue promotion.
- Tests (`creative-quality-gate.test.ts`) cover explicit CTA, brand/offer, format_adaptation, restyling styleFidelity, creativeRisk subjective vs factual — **no inherited CTA test**, **no score-issue promotion test**.

### Integration paths

| Path | Score normalization | Gate |
|------|---------------------|------|
| `derivation.ts` job | `analyzeDerivationCreative` → `updateDerivationScore` | `runCompletedDerivationQualityGate` after score |
| `/api/derivations/[id]/qa` | Uses stored `scoreIssues` + `qualityScore` | `computeQualityGateFromAnalysis` |

Both must consume normalized score/QA outputs after Phase 58 (normalization inside `analyze*` functions).

### UI / i18n

- `DerivationReviewModal.tsx`: shows `failure.message` under `hardFailuresTitle`; no code-based title.
- `DerivationCard.tsx`: same — raw message in list items.
- Existing keys: `review.hardFailuresTitle`, `review.polishSuggestionsTitle`, `derivation.invalidOutputBadge`, `derivation.improvableOutputBadge`, `review.approveBlockedInvalid`, `errors.derivationHardFailures`.
- Missing: `review.hardFailureCodes.*` for seven codes, optional `review.blockingFailureHint` / `review.polishSuggestionHint`.

### Established patterns to follow

- Zod schemas at AI boundaries (`campaign-deduction.ts`, `creative-diagnosis.ts`, `brand-kit-extractor.ts`).
- `normalizeCreativeDiagnosis` as parallel for fail-safe parsing.
- Unit tests colocated: `app/src/server/ai/creative-qa.test.ts` and `app/tests/unit/ai/*.test.ts`.
- Phase 57 `CreativeContract` + persisted JSONB — gate/score should prefer stored contract (already wired in job).

## Standard Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Schema validation | Zod | Project convention at AI boundaries |
| Taxonomy module | `app/src/server/ai/creative-quality-taxonomy.ts` | New canonical module |
| Tests | Vitest | Extend existing gate/score/qa suites |
| i18n | next-intl `en.json` / `pt-BR.json` | Structural UI only |

## Architecture Patterns

### Recommended module layout

```
creative-quality-taxonomy.ts   # dimension IDs, aliases, display order, CTA drift note patterns
creative-score.ts              # normalizeCreativeScoreResult, taxonomy-aligned prompt
creative-qa.ts                 # import criterion types/order from taxonomy
creative-quality-gate.ts       # inherited CTA + promoteScoreIssuesToHardFailures
```

### Score normalization contract (AIQ-02)

- Malformed top-level JSON → `scoreStatus: "failed"`, empty issues, conservative score (0 or min of valid dims).
- Missing `qualityScore` → failed unless at least one valid breakdown dimension exists.
- Never default missing fields to 70.
- Cap `scoreIssues` at 3 items (match QA).

### Score-issue promotion (AIQ-04)

After checklist classification, scan `scoreIssues` with same pattern families as `classifyBriefMatchFailed` / `classifyCtaOfferFailed` / legibility/crop keywords:

- CTA drift keywords + contract → `cta_drift`
- Brand patterns → `wrong_brand`
- Unsupported offer patterns → `unsupported_offer`
- Crop/legibility keywords → `cropped_critical_content` / `unreadable_required_text`
- Format layout (format_adaptation only) → `invalid_format_layout`

Unmapped issues remain polish.

### Inherited CTA (AIQ-03)

When `contract.ctaSemantics.kind === "inherited"` and `ctaOffer.status === "failed"`, promote `cta_drift` if note indicates missing/dropped/replaced/invented CTA (regex on note, e.g. `missing cta|dropped cta|replaced cta|invented cta|no cta`).

## Don't Hand-Roll

- New hard-failure code enum values — locked to existing seven.
- DB columns for taxonomy — use existing JSONB fields.
- Re-localizing stored model notes — server i18n for structural labels only.

## Common Pitfalls

1. Changing `CreativeScoreBreakdown` to all-optional without updating display consumers.
2. Breaking `scoreStatus: "heuristic"` UI distinction when gate runs.
3. Promoting subjective score issues (e.g. "improve color harmony") to hard failures.
4. Adding `styleFidelity` fallback for non-restyling QA responses.

## Architectural Responsibility Map

| Component | Tier | Responsibility |
|-----------|------|----------------|
| `creative-quality-taxonomy.ts` | Domain | Canonical dimension IDs, aliases, shared patterns |
| `creative-score.ts` | Application | Vision scoring + normalization |
| `creative-qa.ts` | Application | QA analysis + normalization |
| `creative-quality-gate.ts` | Domain | Hard failure classification + verdict |
| `DerivationReviewModal.tsx` | UI | Blocking vs polish presentation |
| `en.json` / `pt-BR.json` | UI | Localized code titles |

## Sources

- Codebase: `app/src/server/ai/creative-score.ts`, `creative-qa.ts`, `creative-quality-gate.ts`
- Phase context: `58-CONTEXT.md`
- Phase 57: persisted `CreativeContract` shapes
