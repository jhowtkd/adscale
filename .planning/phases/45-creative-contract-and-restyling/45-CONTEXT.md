# Phase 45: Creative Contract and Restyling - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase introduces a **single effective creative contract** that every pipeline stage — generation, scoring, QA, and regeneration — resolves and consumes from the same source.

The phase delivers:
- A typed `CreativeContract` object resolved once before prompt building, capturing: generation mode, target format, CTA semantics (explicit/inherited/absent), base asset ID, style asset ID, client/brand, product, offer, and constraints.
- User-selected style reference asset carried from derivation creation through the Inngest event payload into the restyling job, replacing the current silent `assets[1]` fallback.
- Mode-aware CTA semantics so `null` CTA in art variation means "inherit from base" rather than "no CTA", while scoring does not penalize inherited CTAs as if they were absent.
- Restyling prompt, QA, and scoring rules that explicitly distinguish base-image factual content from style-reference visual language.
- Tests covering CTA contract semantics in art variation, format adaptation, and restyling, and restyling style-reference selection.

This phase does **not** introduce hard-failure blocking or UI surfacing of failures — that is Phase 46 and Phase 47. Phase 45 makes the contract consistent; Phase 46 makes contract violations actionable.

</domain>

<decisions>
## Implementation Decisions

### Creative Contract Type (CNTR-01)

Introduce a `CreativeContract` interface in `app/src/server/ai/creative-contract.ts` (or co-located with the prompt builder). The contract is resolved once inside the derivation job's `generate-and-store-output` step and then passed as a single argument to `buildDerivationPrompt`, `scoreCompletedDerivation`, `analyzeDerivationCreative`, `analyzeCreativeQa`, and `buildRegenerationSuggestion`.

Minimum fields:
```ts
interface CreativeContract {
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  targetFormat: string;                    // "1:1" | "4:5" | "9:16" | ...
  ctaSemantics: CtaSemantics;              // see below
  baseAssetId: string | null;
  styleAssetId: string | null;             // restyling only; null for other modes
  client: string | null;
  product: string | null;
  offer: string | null;
  constraints: string | null;
}
```

All pipeline stages receive `contract` rather than scattered fields. This is the entire change boundary for CNTR-01.

### CTA Semantics (CNTR-03)

Introduce a `CtaSemantics` type:
```ts
type CtaSemantics =
  | { kind: "explicit"; text: string }          // user set a CTA for this piece
  | { kind: "inherited" }                        // mode uses base CTA; text not overridden
  | { kind: "absent" }                           // no CTA expected (rare; requires explicit flag)
```

Resolution rules:
- If `ctaText` is a non-empty string → `{ kind: "explicit", text: ctaText }`.
- If `ctaText` is null/undefined AND mode is `art_variation` → `{ kind: "inherited" }`.
- If `ctaText` is null/undefined AND mode is `format_adaptation` → `{ kind: "inherited" }` (source CTA is preserved).
- If `ctaText` is null/undefined AND mode is `restyling` → `{ kind: "inherited" }` (base image CTA is factual content that must survive).
- `absent` is reserved for future explicit opt-out of CTA; not surfaced in v11.1.

Scoring must treat `inherited` as "CTA is present and required" and must not penalize for missing explicit text when kind is `inherited`.

### Style Reference Selection (REST-01)

The restyling job currently ignores user-selected style references. Fix:
1. Add `styleAssetId?: string | null` to the `derivation.generate` Inngest event payload.
2. When creating a restyling derivation (in `app/src/app/api/campaigns/[id]/derivations/route.ts` or equivalent), persist the user-selected `styleAssetId` on the derivation record or pass it in the event.
3. In the restyling branch of `derivation.ts`, resolve the style asset by `styleAssetId` first; fall back to the first `role === "style_reference"` asset only if no explicit ID was provided; throw an error if neither is found.
4. The `CreativeContract.styleAssetId` captures whichever asset was actually used so scoring and QA know which style reference was active.

### Restyling Factual-Source Separation (REST-02, REST-03, REST-04)

Current restyling prompt rules are already textually correct but are not reflected in scoring or QA prompts. Align:

**Prompt** (already in `buildDerivationPrompt`): base image = factual source; style reference = visual language only. No action on prompt text beyond ensuring the contract's `styleAssetId` is referenced in the log/stored prompt.

**Scoring** (`analyzeDerivationCreative`): add a `restyling` branch to the evaluation prompt when `contract.generationMode === "restyling"`:
- Penalize if the output contains factual claims (price, brand name, unrelated offer, unrelated CTA, course name, product name) that visually match the style reference rather than the base image.
- The `informationPreservation` dimension must check against **base image facts**, not style reference facts.

**QA** (`buildCreativeQaPrompt`): add a `styleFidelity` criterion when mode is `restyling`:
- `status: "failed"` if output contains a copied factual claim from the style reference.
- `status: "warning"` if it is ambiguous whether a claim came from the style reference.
- Already-existing `creativeRisk` criterion is insufficient; `styleFidelity` is a distinct check.

### Contract Passed to Regeneration (CNTR-04)

`buildRegenerationSuggestion` must include `baseAssetId` and `styleAssetId` in the returned string when mode is restyling, so the regeneration API can reconstruct the same contract. Currently it only preserves CTA text, format, and mode.

Update `BuildSuggestionInput` and `buildRegenerationSuggestion` to accept and embed contract fields in the suggestion string.

### Scoring CTA Correction (CNTR-02)

`analyzeDerivationCreative` currently receives `ctaText` as a plain string (defaulting to `"none"` when null). Replace with `ctaSemantics`:
- When `kind === "explicit"`: current behavior (check exact CTA text is present).
- When `kind === "inherited"`: instruct scorer to check that the creative preserves a CTA element from the base image (content unknown; verify visually).
- Scoring must not count a missing *explicit* string as a CTA failure when kind is `inherited`.

### Test Coverage (CNTR-03, REST-01)

Tests must be added or updated in `app/src/server/ai/prompt-builder.test.ts` (or its app/tests counterpart) to cover:
1. CTA semantics for art variation with no ctaText → `inherited` semantics, prompt contains "use the original CTA" instruction.
2. CTA semantics for art variation with explicit ctaText → `explicit` semantics, prompt contains literal CTA.
3. CTA semantics for format adaptation with no ctaText → `inherited`, prompt preserves CTA.
4. CTA semantics for restyling with no ctaText → `inherited`, prompt does not say "no CTA required".
5. Restyling prompt includes a reference to the resolved `styleAssetId` (or style asset key).
6. Scoring prompt includes restyling-specific factual-source instruction when mode is `restyling`.

### Claude's Discretion

- Whether `CreativeContract` lives in `creative-contract.ts` or is co-located in `prompt-builder.ts`.
- Whether `ctaSemantics` replaces the existing `ctaText` parameter throughout the pipeline in one pass or is added alongside `ctaText` with the pipeline stages consuming whichever is present.
- Whether `styleFidelity` is added to `CreativeQaCriterion` union type or treated as a conditional key appended only for restyling.
- Exact wording of scoring and QA prompts for restyling fact-contamination detection.
- Whether `styleAssetId` is stored as a new column on `derivations` or only passed via the event payload (either is acceptable if the contract is fully reconstructable from stored data for retrospective display).

</decisions>

<code_context>
## Existing Code Insights

### Restyling Asset Selection Bug (REST-01)

In `app/src/server/jobs/derivation.ts` lines 421-428, the restyling branch independently re-fetches all campaign assets and picks:
```ts
const baseAsset = assets.find((a) => a.role === "base") ?? assets[0];
const styleAsset = assets.find((a) => a.role === "style_reference") ?? assets[1];
```
There is no `styleAssetId` in the Inngest event payload (`derivation.generate`). The user-selected style reference from the config modal is silently discarded; the job always picks whichever asset has `role === "style_reference"` first (or `assets[1]` as a fallback). This is the exact bug described in REST-01.

### CTA Null Semantics Gap (CNTR-03)

In `creative-score.ts` line 84: `const ctaText = input.derivation.ctaText ?? "none"`. When ctaText is null, the scorer receives `"none"` and evaluates the output as if no CTA was intended, even for art variation where the inherited base CTA must still appear.

In `prompt-builder.ts` `buildHardRulesSection`: art variation already has an "inherited" rule (`"use the original CTA from the reference"`), but this is not distinguishable from `ctaText === null` for format adaptation or restyling. The three modes need an explicit CTA semantics contract so the prompt and scorer agree on the intent.

### Scoring Does Not Know About Style Reference (CNTR-02)

`scoreCompletedDerivation` signature receives only campaign fields and a `derivation` object with `ctaText`, `format`, `generationMode`, `feedback`, `parentId`. It does not receive which assets were used, so `analyzeDerivationCreative` cannot tell the scorer "the style reference was asset X; do not credit factual claims from it".

### QA Does Not Have Style Fidelity Check (REST-03)

`buildCreativeQaPrompt` evaluates `informationPreservation` and `creativeRisk` but has no criterion specifically for "style-reference factual contamination". The existing `creativeRisk` criterion is vague; a dedicated `styleFidelity` criterion is needed for restyling outputs.

### Contract Is Currently Scattered

The effective contract is assembled ad hoc in `derivation.ts`:
```ts
const effectiveGenerationMode = generationMode ?? derivation.generationMode ?? "art_variation";
const targetFormat = format ?? derivation.format ?? "1:1";
const effectiveCtaText = ctaText ?? derivation.ctaText ?? undefined;
```
These three variables are passed individually to `buildDerivationPrompt`, and a subset is passed to `scoreCompletedDerivation`. There is no single typed contract object verified before the pipeline executes.

### Integration Points

- `app/src/server/jobs/derivation.ts`: main orchestration; resolve contract here before `generate-and-store-output`.
- `app/src/server/ai/prompt-builder.ts`: `buildDerivationPrompt` and `DerivationPromptConfig`; add contract param.
- `app/src/server/ai/creative-score.ts`: `analyzeDerivationCreative` and `buildRegenerationSuggestion`; add contract param and mode-aware scoring.
- `app/src/server/ai/creative-qa.ts`: `buildCreativeQaPrompt`; add `styleFidelity` criterion for restyling.
- `app/src/app/api/campaigns/[id]/derivations/route.ts`: derivation creation; pass `styleAssetId` from request body into event payload.
- `app/src/server/db/schema.ts`: potentially add `styleAssetId` column to `derivations` table.
- Tests: `app/src/server/ai/prompt-builder.test.ts`, `app/src/server/ai/creative-qa.test.ts`, `app/src/server/jobs/derivation.test.ts`.

</code_context>

<specifics>
## Specific Observations

- The restyling asset selection bug is the highest-priority fix: without it, restyling always uses the first available style asset regardless of user intent. This is a single-line fix in the Inngest event payload + restyling branch of `derivation.ts`.
- The CTA semantics gap causes scoring to treat inherited CTAs as absent, which artificially depresses `ctaClarity` scores for art variation outputs where the base creative CTA was preserved correctly.
- Introducing `CreativeContract` as a typed object is the architectural anchor for all five requirements: once the contract is assembled before prompt building, every downstream consumer (scoring, QA, regeneration) can use the same resolved values.
- The `styleFidelity` QA criterion is the only new criterion being added; all other criteria already exist in `CreativeQaCriterion`.
- No database schema changes are strictly required if `styleAssetId` is passed through the event payload and stored in `derivations.inputPrompt` context; however, a dedicated column makes the contract inspectable from the UI (needed by Phase 47). The planner should include this as a migration if Phase 47 requires it — or add it preemptively here since the column is trivial.

</specifics>

<deferred>
## Deferred Ideas

- Hard-failure blocking (output cannot be approved/exported when contract-invalid) → Phase 46.
- UI display of hard-failure reasons on derivation cards → Phase 47.
- Per-output display of effective CTA, base asset, and style reference in the review surface → Phase 47.
- Multi-turn image repair loops → future image-repair scope.
- Per-platform safe-area overlays → future review UX.
- Extending `CreativeContract` with competitor or brand-memory context fields → future contract enrichment.

</deferred>

---

*Phase: 45-creative-contract-and-restyling*
*Context gathered: 2026-06-01*
