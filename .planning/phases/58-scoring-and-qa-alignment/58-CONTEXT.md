# Phase 58: Scoring and QA Alignment - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto (recommended defaults from PROJECT.md, Phase 57 decisions, and existing score/QA/gate code)

<domain>
## Phase Boundary

Make score, QA, hard failures, and user-facing explanations agree.

This phase delivers:
- One shared quality taxonomy consumed by `creative-score`, `creative-qa`, and `creative-quality-gate`.
- Schema validation and normalization for score and QA model outputs so missing or malformed fields cannot silently read as high-confidence "good" results.
- Hard-failure classification limited to contract-breaking categories, with inherited-CTA and score/QA alignment gaps closed.
- Verdict rules that force `invalid` when any hard failure exists, regardless of visual polish score.
- PT-BR/EN user-facing copy that clearly separates blocking failures from advisory polish.

This phase does **not** deliver regeneration correction-brief merging (Phase 59), known-failure fixture suite (Phase 60), new debug dashboards, provider/model changes, or approval/export policy redesign beyond existing `assertDerivationApprovable` behavior.

</domain>

<decisions>
## Implementation Decisions

### Phase cut
- Locked: alignment pass on existing modules — extend and normalize, do not replace the quality pipeline.
- Build on Phase 57 persisted `CreativeContract` and `promptProvenance`; scoring/QA/gate should prefer stored contract over re-deriving from loose derivation fields when available.
- No new user-facing debug surfaces; improve labels and grouping in existing review/gallery UI only where copy or presentation is ambiguous today.

### Shared quality taxonomy (AIQ-01)
- Locked: introduce a single shared module (e.g. `app/src/server/ai/creative-quality-taxonomy.ts`) as the canonical source for quality dimension IDs, display order, and score↔QA aliases.
- Canonical dimensions (from REQUIREMENTS): `legibility`, `ctaOffer`, `informationPreservation`, `briefMatch`, `formatFit`, `creativeRisk`, `styleFidelity` (restyling only), `variationLevelFit` (score-only).
- QA checklist keys remain the canonical names above; `creative-qa.ts` should import them from the shared module instead of duplicating string unions.
- Score breakdown keys map to taxonomy via explicit aliases:
  - `textLegibility` → `legibility`
  - `ctaClarity` → `ctaOffer`
  - `informationPreservation` → `informationPreservation`
  - `briefMatch` → `briefMatch`
  - `formatFit` → `formatFit`
  - `visualQuality` → `creativeRisk` (polish/advisory; not a hard-failure source by itself)
  - `variationLevelFit` → `variationLevelFit` (advisory; never a hard failure on its own)
  - `styleFidelity` exists only in QA for restyling; no separate score dimension required in this phase.
- Scoring and QA prompts should reference the same dimension names and preservation language where they evaluate the same concern (CTA/offer, crop/legibility, format layout, style contamination).
- Do not add new DB columns for taxonomy; keep using existing `scoreBreakdown`, `qaChecklist`, `hardFailures`, `polishSuggestions`, and `qualityVerdict`.

### Schema validation and normalization (AIQ-02)
- Locked: add `normalizeCreativeScoreResult` parallel to existing `normalizeCreativeQaResult` in `creative-qa.ts`.
- Prefer Zod schemas (consistent with project boundary validation) for score and QA JSON shapes; normalization functions wrap parse + safe fallbacks.
- **Score normalization rules:**
  - Missing or non-numeric `qualityScore` → set `scoreStatus: "failed"` (or keep `"analyzed"` only when at least one valid breakdown dimension exists) and use conservative score/breakdown defaults — **never default missing fields to 70**.
  - Missing `scoreBreakdown` dimensions → mark dimension as unknown/low-confidence (e.g. `null` or explicit sentinel) rather than inflating to 70.
  - Empty or non-array `scoreIssues` → `[]`; cap list length (match QA's 3-item cap).
  - Malformed top-level JSON → `scoreStatus: "failed"`, empty issues, no regeneration suggestion that implies success.
- **QA normalization rules (tighten existing behavior):**
  - Keep current per-criterion fallback notes, but when **all** core criteria used fallback notes, force `status: "warning"` (already partially done via `hasFallback`) and do not allow model `status: "ready"`.
  - Reject/absent `styleFidelity` for non-restyling remains correct; do not inject warning fallbacks for it.
  - Normalize unknown checklist keys by ignoring them, not merging into canonical criteria.
- Heuristic scoring (`scoreDerivationHeuristic`) stays as a pre-analysis placeholder but should not be mistaken for analyzed confidence in UI when gate runs later.

### Hard failure scope (AIQ-03)
- Locked: keep the existing seven `CreativeHardFailureCode` values in `creative-quality-gate.ts` — do not add new codes in this phase:
  - `cta_drift`, `wrong_brand`, `unsupported_offer`, `copied_style_reference_facts`, `cropped_critical_content`, `unreadable_required_text`, `invalid_format_layout`
- Hard failures are **only** contract-breaking issues per REQUIREMENTS:
  - Wrong/missing CTA, missing offer/product/brand cues, severe illegibility, invalid format layout (format adaptation), unsafe crop, style-reference factual contamination.
- **CTA rules (close current gap):**
  - `ctaOffer` checklist `failed` + explicit CTA contract → `cta_drift` (existing).
  - `ctaOffer` checklist `failed` + inherited CTA contract → also `cta_drift` when note indicates missing, dropped, replaced, or invented CTA (extend `classifyCtaOfferFailed`; inherited is not an excuse to skip hard failure).
  - `ctaOffer` failed with unsupported-claim patterns → `unsupported_offer` (existing precedence over `cta_drift`).
- **Brand/product/offer:** continue pattern-based mapping on `briefMatch` and `ctaOffer` notes (`wrong_brand`, `unsupported_offer`); subjective tone/audience mismatches stay polish only.
- **Format:** `formatFit` `failed` → `invalid_format_layout` only when `contract.generationMode === "format_adaptation"`; other modes route to polish (existing).
- **Crop/legibility:** `informationPreservation` failed → `cropped_critical_content`; `legibility` failed → `unreadable_required_text`.
- **Restyling:** `styleFidelity` failed → `copied_style_reference_facts` when restyling + style reference present.
- **creativeRisk:** only hard-fail when note matches unsupported factual/offer patterns; subjective "feels generic/risky" stays polish (existing tests lock this).
- **variationLevelFit** and high `visualQuality` alone never produce hard failures.

### Verdict override rules (AIQ-04)
- Locked: `deriveQualityVerdict` precedence stays:
  1. Any hard failure → `invalid` (even if `qualityScore` ≥ 70 or checklist otherwise clean).
  2. Else score &lt; 70 or any checklist `warning` → `improvable`.
  3. Else → `acceptable`.
- `assertDerivationApprovable` continues blocking approval/delivery when `qualityVerdict === "invalid"` or `hardFailures.length > 0`.
- `scoreCappedForDisplay` in `derivation-quality.ts` continues capping displayed score to 59 when verdict is `invalid`.
- **Score↔gate alignment (close current gap):** add a bridge step in gate classification that promotes **contract-violation** `scoreIssues` to hard failures when QA checklist did not already catch them — reuse the same regex/pattern families as `briefMatch`/`ctaOffer` classification (CTA drift, brand mismatch, unsupported offer, crop/legibility keywords). Unmapped score issues remain polish only.
- Regeneration suggestion refresh on hard failures (`buildHardFailureRegenerationSuggestion`) stays in gate orchestration; Phase 58 may adjust wording for taxonomy alignment but does not own correction-brief merging (Phase 59).

### PT-BR/EN user-facing copy (AIQ-05)
- Locked: distinguish blocking vs advisory in UI using existing sections — hard failures vs polish suggestions — with consistent labels in both locales.
- Add i18n keys under `review` (and reuse in `derivation` where cards show the same concepts):
  - Per-code short titles: `review.hardFailureCodes.cta_drift`, `.wrong_brand`, `.unsupported_offer`, `.copied_style_reference_facts`, `.cropped_critical_content`, `.unreadable_required_text`, `.invalid_format_layout` in `en.json` and `pt-BR.json`.
  - Optional shared description key for blocking vs polish helper text if needed (`review.blockingFailureHint`, `review.polishSuggestionHint`).
- UI presentation rule: show localized code title as primary label; model-generated `failure.message` / checklist `note` as secondary detail (truncate if long). Do not replace model notes entirely — bilingual users still benefit from vision-model locale output in QA prompts.
- Align existing keys so EN/PT-BR pairs are semantically equivalent:
  - `derivation.invalidOutputBadge` / `improvableOutputBadge`
  - `review.hardFailuresTitle` / `polishSuggestionsTitle`
  - `errors.derivationHardFailures` (approval block toast)
  - `review.approveBlockedInvalid` / `derivation.approveBlockedInvalid`
- QA prompt continues `Locale for user-facing notes: ${locale}`; server-side i18n covers structural UI, not re-localization of stored model notes retroactively.

### Scope guardrails
- Phase 58 may update score/QA prompts for taxonomy alignment; it should not rewrite Phase 57 contract persistence or prompt-builder invariants except shared wording imports.
- Phase 58 should extend unit tests in `creative-quality-gate.test.ts`, `creative-qa.test.ts`, and `creative-score.test.ts`; comprehensive fixture images belong to Phase 60.
- Manual QA route (`/api/derivations/[id]/qa`) and job orchestration (`runCompletedDerivationQualityGate`) must use the same normalization + classification path.

### Claude's Discretion
- Exact filename for shared taxonomy module and whether Zod schemas live beside it or in `app/src/server/validation/`.
- Whether score normalization uses `scoreStatus: "failed"` vs a new `"normalized"` value — must not break existing consumers; prefer extending the union if needed.
- Exact regex sharing strategy between score-issue promotion and checklist note classifiers (shared helper vs duplicated patterns).
- Whether review modal shows code title only, or title + note stacked — as long as blocking vs polish distinction is obvious in both locales.

</decisions>

<specifics>
## Specific Ideas

- Auto mode selected recommended defaults: extend existing primitives rather than redesign the pipeline.
- The highest-impact bug today is score parsing defaulting missing fields to **70**, which contradicts AIQ-02 and can disagree with a later `invalid` verdict.
- Second gap: inherited CTA `ctaOffer` failures may not become hard failures, and contract-violation `scoreIssues` currently flow only to polish — both undermine AIQ-03/AIQ-04 alignment.
- Taxonomy module is the integration point Phase 59 regeneration briefs and Phase 60 fixtures should import later.
- User mental model: **blocking** = cannot approve/export until fixed; **polish** = optional improvement/regeneration hint.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/ai/creative-score.ts` — vision scoring, `ScoreResult`, heuristic fallback, `buildRegenerationSuggestion`, `buildHardFailureRegenerationSuggestion`; parses JSON with permissive `?? 70` defaults (needs normalization).
- `app/src/server/ai/creative-qa.ts` — `CreativeQaCriterion` union, `normalizeCreativeQaResult`, `buildCreativeQaPrompt`, `analyzeCreativeQa`.
- `app/src/server/ai/creative-quality-gate.ts` — `CreativeHardFailureCode`, `classifyCreativeQualityGate`, `deriveQualityVerdict`, `computeQualityGateFromAnalysis`, `runCompletedDerivationQualityGate`, `assertDerivationApprovable`.
- `app/src/server/ai/creative-contract.ts` — `CreativeContract`, `CtaSemantics`, `FACTUAL_SOURCE_RULES` (Phase 57); gate/score already consume contract.
- `app/src/lib/derivation-quality.ts` — `scoreCappedForDisplay` for invalid verdict UI cap.
- `app/tests/unit/ai/creative-quality-gate.test.ts` — extensive hard-failure mapping tests; extend for inherited CTA and score-issue promotion.
- `app/src/components/workspace/DerivationReviewModal.tsx` and `DerivationCard.tsx` — show `hardFailures` vs `polishSuggestions` with i18n section titles.

### Established Patterns
- QA normalization degrades missing criteria to warning with fallback note `"Needs a quick manual review."` — score should adopt analogous fail-safe behavior, not optimistic 70s.
- Hard failure classification uses criterion status `failed` plus regex note patterns for brand/offer disambiguation.
- Quality gate runs after scoring in derivation job; manual QA route calls `computeQualityGateFromAnalysis` with stored score issues.
- i18n via `next-intl` keys in `app/messages/en.json` and `app/messages/pt-BR.json`; API errors use localized codes.

### Integration Points
- `app/src/server/ai/creative-score.ts` — add normalization; align prompt dimension names with taxonomy.
- `app/src/server/ai/creative-qa.ts` — import taxonomy; tighten normalization edge cases.
- `app/src/server/ai/creative-quality-gate.ts` — inherited CTA hard failure + score-issue promotion bridge.
- `app/src/server/jobs/derivation.ts` — ensure analyzed score path uses normalized result before gate (if not already ordered).
- `app/src/app/api/derivations/[id]/qa/route.ts` — same gate path as job orchestration.
- `app/messages/en.json`, `app/messages/pt-BR.json` — hard failure code labels and blocking/polish helper copy.
- `app/src/components/workspace/DerivationReviewModal.tsx` (and card if needed) — render localized code titles alongside model notes.

</code_context>

<deferred>
## Deferred Ideas

- Regeneration correction-brief builder merging feedback categories (Phase 59).
- Synthetic/sanitized image fixtures and full manual verification guide (Phase 60).
- Owner debug dashboard for raw score/QA JSON.
- New hard-failure codes (e.g. separate `missing_product`) or ML-based classifiers beyond regex + checklist status.
- Changing OpenAI models/providers or multi-pass scoring ensembles.

</deferred>

---

*Phase: 58-scoring-and-qa-alignment*
*Context gathered: 2026-06-05*
