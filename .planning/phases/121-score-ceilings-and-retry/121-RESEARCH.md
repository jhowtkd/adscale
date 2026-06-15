# Phase 121: Score Ceilings and Retry - Research

**Researched:** 2026-06-15
**Domain:** Post-generation score enforcement + derivation auto-retry (restyling factual-source integrity)
**Confidence:** HIGH

## Summary

Phase 121 closes the **score–verdict gap** deliberately deferred from Phases 119–120. Phase 120 hardened the quality gate: nine GATE-01 hard-failure codes promote to `invalid`, and `deriveQualityVerdict` already returns `invalid` when `hardFailures.length > 0` regardless of `qualityScore` [VERIFIED: `creative-quality-gate.ts:646-648`]. However, the **persisted** `qualityScore` can still be 85–92 alongside active hard failures [VERIFIED: `creative-quality-gate.test.ts:459-472`, `runCompletedDerivationQualityGate` L740-741 persists `row.qualityScore` unchanged]. SCR-02/SCR-03 require deterministic numeric ceilings so high scores cannot mask factual or hierarchy failures in the DB, UI, or API consumers that read score before verdict.

Score prompt rubric (Phase 119) adds `SCORE VISUAL QUALITY CAPS` for `visualQuality` dimension guidance only [VERIFIED: `observable-rubric.ts:35-38`] — there is **no** server-side `applyScoreCeilings()` today. `normalizeCreativeScoreResult` clamps 0–100 but never applies failure-category caps [VERIFIED: `creative-score.ts:64-66,85-140`]. SCR-01 is partially met via seven breakdown keys mapped to taxonomy criteria [VERIFIED: `creative-quality-taxonomy.ts:39-47`], but the score prompt labels do not explicitly document the six SCR-01 concern buckets (factual integrity, hierarchy, legibility, art direction, originality, format fit).

Retry is narrowly scoped and restyling is **explicitly excluded**. `RETRYABLE_FAILURE_CODES` = `{ cta_drift, unreadable_required_text }` only [VERIFIED: `derivation-auto-retry-policy.ts:3-6`]. The derivation job skips auto-retry when `effectiveGenerationMode === "restyling"` [VERIFIED: `derivation.ts:924-928`]. `runDerivationAutoRetry` uses a **single** reference image via `images.edit` [VERIFIED: `derivation-auto-retry.ts:69-80`], while restyling initial generation uses **two** images (base + style) [VERIFIED: `derivation.ts:621-628`]. Auto-retry `referenceKey` resolves to `asset?.key` (first campaign asset) or contaminated `generated.outputKey` for format_adaptation edge cases [VERIFIED: `derivation.ts:940-944`] — neither guarantees factual base for restyling.

**Primary recommendation:** Add `creative-score-ceilings.ts` (or functions in `creative-score.ts`) with a `SCORE_CEILING_BY_FAILURE` table matching SCR-02, invoked from `computeQualityGateFromAnalysis` / `runCompletedDerivationQualityGate` after classification and persisted via `updateDerivationScore`. Extend score prompt with explicit SCR-01 dimension mapping. Remove restyling retry skip; add mode-aware `shouldAutoRetryDerivation(contract, hardFailures)` with restyling codes (`style_reference_contamination`, `cta_drift`, `unreadable_required_text`); extend `runDerivationAutoRetry` for two-image restyling using **original** `baseAsset` + `styleAsset` keys from `resolvedContract`, never `outputKey`. Add failure-code-specific correction lines in `regeneration-correction-brief.ts` (SCR-05) and inject `RESTYLING FACTUAL-SOURCE RULE` on restyling retry prompts.

<user_constraints>
## User Constraints (from STATE.md — no phase CONTEXT.md)

### Locked Decisions
- art_variation and format_adaptation MODE blocks use tier-aware preservation governed by RULE PRECEDENCE (CONT-03)
- [Phase 117]: invented_factual_entity in CONTAMINATION_FAILURE_CODES and promoted at quality gate (SEP-04)
- [Phase 117]: INPUT SOURCE CLASSIFICATION injected after integrity block, before MODE-specific rules
- [Phase 117]: RESTYLING FACTUAL-SOURCE RULE injects unconditionally; visualTokenBrief blocked for restyling
- [Phase 117]: VISUAL REFERENCE TRANSFER RULE injected after classification with SEP-02 allowlist/denylist
- [Phase 117]: invented_factual_entity promoted to hard failure via INVENTED_ENTITY_PATTERN on briefMatch/creativeRisk
- [Phase 117]: ALLOWED ENTITIES block injected from CANONICAL_CAMPAIGNS when campaign slug matches
- [Phase 117]: assertParentFactualLineage blocks format_adaptation parent download when qualityVerdict invalid or hardFailures include contamination codes (SEP-03)
- [Phase 119]: Observable rubric maps defects to existing criteria (creativeRisk, legibility, briefMatch) — no new checklist keys
- [Phase 119]: Score rubric extends QA core lines with SCORE VISUAL QUALITY CAPS block
- [Phase 119]: QA prompt injects observable rubric after styleFidelity/allowedEntities; export-softening removed
- [Phase 119]: Score prompt uses buildObservableScoreRubricSection + allowedEntities block matching QA pattern
- [Phase 119]: Corpus archetype integration tests verify rubric parity without gate promotion; BASELINE_GAP_COUNT remains 4 until Phase 120
- [Phase 120]: GATE-01 taxonomy patterns and extended CreativeHardFailureCode union established without classifier promotion (Plan 02)
- [Phase 120]: normalizeHardFailureCode maps copied_style_reference_facts, format_campaign_drift, restyling_factual_contamination to canonical GATE-01 codes
- [Phase 120]: hasCampaignIdentityDrift: 'not a faithful' overrides safe-pattern false negative on formatFit drift notes
- [Phase 120]: Gate classifiers emit style_reference_contamination; decorative_only_variation gated to art_variation
- [Phase 120]: CORPUS_POSITIVE_FIXTURES holds faithful c2c12774; CORPUS_ARCHETYPE_FIXTURES stays five negatives with BASELINE_GAP_COUNT=0
- [Phase 120]: Format drift corpus expects campaign_identity_drift only (not dual wrong_brand)
- [Phase 120]: Faithful NR1 4:5 adaptation improvable with creativeRisk warning; assertDerivationApprovable ok

### Claude's Discretion
- Module placement: `creative-score-ceilings.ts` vs functions colocated in `creative-score.ts`
- Whether ceilings apply from hard failures only vs. also from promoted score-issue precursors before gate runs
- Restyling retry: two-image edit (base+style, mirroring first pass) vs. single base-image edit with stronger prompt — prefer two-image from **original** assets per SCR-04
- Plan wave count (2–3 plans): ceilings + prompt mapping vs. retry policy + job wiring vs. correction brief specificity
- Whether `generic_template_aesthetic` / `visual_overload` get SCR-02-style ceilings (≤55/≤60) when hard failure already blocks — recommend yes for SCR-03 score persistence consistency

### Deferred Ideas (OUT OF SCOPE)
- Full prompt injection regression suite (Phase 122 TEST-01–04)
- Live corpus re-score ≥75/≥95 (Phase 123 QA-18–21)
- New QA checklist keys (`visualHierarchy`, etc.)
- Expanding auto-retry beyond one attempt per derivation (`autoRetryAttempted` guard stays)
- Vision pre-pass on style reference (PITFALLS.md future flag)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCR-01 | Score separates factual integrity, hierarchy, legibility, art direction, originality, format fit | Document explicit mapping in `buildCreativeScorePrompt`; align breakdown keys to SCR buckets (see Architecture Patterns) |
| SCR-02 | Ceilings: invented fact ≤20, campaign replaced ≤15, CTA missing ≤50, severe overload ≤55, decorative variation ≤60 | New `applyScoreCeilings()` with `SCORE_CEILING_BY_FAILURE` table; unit tests per ceiling |
| SCR-03 | High score cannot coexist with active hard failures | Apply ceilings when `hardFailures.length > 0`; persist capped `qualityScore` in gate path; test score 85 + hard failure → capped ≤ ceiling |
| SCR-04 | Restyling retry enabled; uses original factual source, never contaminated output | Remove `derivation.ts` restyling skip; mode-aware retry policy; resolve reference from `contract.baseAssetId` / base asset key; extend two-image retry |
| SCR-05 | Retry correction specific: remove invented entity, restore person/brand, reduce modules, restore concept/CTA | Extend `buildRegenerationCorrectionBrief` with per-code correction directives; restyling contamination + factual-source rule in retry prompt |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Score ceiling table + apply function | API / Backend (`creative-score.ts` or `creative-score-ceilings.ts`) | `creative-quality-gate.ts` (invoke after classify) | Ceilings are numeric enforcement on score artifact; gate owns orchestration timing |
| SCR-01 dimension mapping in score prompt | API / Backend (`creative-score.ts`) | `creative-quality-taxonomy.ts` (criterion IDs) | Prompt instructs model; mapping table is documentation for reviewers |
| Hard-failure → ceiling resolution | API / Backend (`creative-quality-gate.ts`) | taxonomy codes | Uses classified `hardFailures` from Phase 120 |
| Persist capped score | API / Backend (`creative-quality-gate.ts` → `updateDerivationScore`) | derivation repository | Today gate updates suggestion but not score when hard failures exist |
| Mode-aware retry policy | API / Backend (`derivation-auto-retry-policy.ts`) | — | Single source of truth for retryable codes per mode |
| Restyling retry image inputs | API / Backend (`derivation-auto-retry.ts`) | `derivation.ts` (asset key resolution) | Two-image edit must use original base+style, not `outputKey` |
| Job orchestration (enable restyling retry) | API / Backend (`derivation.ts`) | Inngest step | Remove blanket skip; pass base/style keys into retry |
| Failure-specific correction brief | API / Backend (`regeneration-correction-brief.ts`) | `creative-score.ts` (`buildHardFailureRegenerationSuggestion`) | SCR-05 targets correction text, not gate taxonomy |
| Factual-source rule on retry prompt | API / Backend (`prompt-builder.ts` / `factual-visual-separation.ts`) | auto-retry prompt assembly | Reuse Phase 117 `RESTYLING FACTUAL-SOURCE RULE` export |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Ceiling + retry logic | Brownfield; no new deps |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit + integration tests | Phases 115–120 pattern |
| `creative-score.ts` | — | Score normalize + analyze + prompt | Score artifact owner |
| `creative-quality-gate.ts` | — | Classify + verdict + persist | Invokes ceilings after `classifyCreativeQualityGate` |
| `creative-quality-taxonomy.ts` | — | `CreativeHardFailureCode` union | Ceiling lookup keyed on canonical codes |
| `derivation-auto-retry-policy.ts` | — | Retry eligibility | Extend, don't duplicate in job |
| `derivation-auto-retry.ts` | — | OpenAI `images.edit` retry | Extend for restyling two-image path |
| `regeneration-correction-brief.ts` | — | Correction prompt assembly | SCR-05 specificity |
| `factual-visual-separation.ts` | — | `RESTYLING FACTUAL-SOURCE RULE` | Retry must repeat factual-source constraint |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `observable-rubric.ts` | — | `SCORE_VISUAL_QUALITY_CAPS` (prompt-only today) | Align prompt caps with code ceilings; avoid contradicting SCR-02 numbers |
| `derivation.ts` | — | Job auto-retry step | Remove restyling skip; wire asset keys |
| `corpus-fixtures.ts` | — | Archetype fixtures | Optional ceiling assertions on synthetic scores |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Code-side `applyScoreCeilings` | Prompt-only caps (Phase 119) | Model ignores instructions; audit showed high scores on failures |
| Ceilings in `normalizeCreativeScoreResult` | Ceilings in gate after hard-failure classify | Gate has failure codes; score normalizer runs before gate — wrong layer |
| Single-image restyling retry | Two-image retry from original assets | Single base loses style transfer; two original images match first-pass API |
| Generic correction brief | Per-code directive map | SCR-05 requires specific fixes; generic lists already exist |
| New score breakdown dimension `hierarchy` | Map hierarchy to `visualQuality`/`creativeRisk` | Phase 119 locked: no new checklist keys; SCR-01 is semantic mapping |

**Installation:** None.

## Architecture Patterns

### System Architecture Diagram

```
OpenAI vision score JSON
         │
         ▼
┌─────────────────────────────┐
│ normalizeCreativeScoreResult│  (clamp 0–100 only today)
└─────────────┬───────────────┘
              │ persist raw score
              ▼
┌─────────────────────────────┐
│ analyzeCreativeQa + classify│  Phase 120 hard failures
│ CreativeQualityGate         │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐     NEW Phase 121
│ applyScoreCeilings          │◄── hardFailures + scoreBreakdown
│  min(qualityScore, ceiling) │
│  clamp breakdown dims       │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ deriveQualityVerdict        │  hardFailures → invalid (unchanged)
│ persist qualityScore      │  capped score (SCR-03 fix)
└─────────────┬───────────────┘
              │
              ▼ (if retryable per mode)
┌─────────────────────────────┐
│ runDerivationAutoRetry      │
│  restyling: base+style keys │  never outputKey
│  + failure-specific brief   │
└─────────────┬───────────────┘
              │
              ▼
        re-score + re-gate (existing after-retry steps)
```

### SCR-01: Score Dimension Mapping (no new breakdown keys)

| SCR-01 concern | Score breakdown key(s) | Taxonomy criterion | Notes |
|----------------|------------------------|-------------------|-------|
| Factual integrity | `briefMatch`, `informationPreservation` | briefMatch, informationPreservation | Entity invention, offer/brand fidelity |
| Hierarchy | `visualQuality` | creativeRisk | Overload, missing dominant idea (observable rubric) |
| Legibility | `textLegibility` | legibility | Thumbnail hook readability |
| Art direction | `visualQuality` | creativeRisk | Generic template vs. brand-justified aesthetic |
| Originality | `variationLevelFit` | variationLevelFit | Decorative-only vs. mechanism change (art_variation) |
| Format fit | `formatFit` | formatFit | Layout + campaign identity (format_adaptation) |

**Prompt action:** Add `SCORE DIMENSION MAP` block to `buildCreativeScorePrompt` listing the six concerns and which breakdown keys measure them [ASSUMED: prompt documentation satisfies SCR-01 without schema migration].

### Recommended Project Structure

```
app/src/server/ai/
├── creative-score.ts              # MODIFY: SCR-01 prompt map; optional export applyScoreCeilings
├── creative-score-ceilings.ts       # NEW (recommended): SCORE_CEILING_BY_FAILURE, applyScoreCeilings
├── creative-quality-gate.ts       # MODIFY: invoke ceilings; persist capped score
├── derivation-auto-retry-policy.ts # MODIFY: mode-aware RETRYABLE_FAILURE_CODES
├── derivation-auto-retry.ts       # MODIFY: restyling two-image path; styleReferenceKey input
├── regeneration-correction-brief.ts # MODIFY: per-code correction directives (SCR-05)
├── observable-rubric.ts           # MODIFY (optional): align SCORE_VISUAL_QUALITY_CAPS with SCR-02 numbers
└── factual-visual-separation.ts   # READ: RESTYLING FACTUAL-SOURCE RULE for retry injection

app/src/server/jobs/
└── derivation.ts                  # MODIFY: remove restyling skip; resolve base/style keys for retry

app/tests/unit/ai/
├── creative-score-ceilings.test.ts # NEW: SCR-02/03 matrix
├── derivation-auto-retry-policy.test.ts # EXTEND: restyling codes, mode guards
├── regeneration-correction-brief.test.ts # EXTEND: SCR-05 specificity
└── creative-quality-gate.test.ts  # EXTEND: persisted capped score expectations
```

### Pattern 1: Deterministic Score Ceilings (SCR-02/03)

**What:** After `classifyCreativeQualityGate`, compute `effectiveCeiling = min(SCORE_CEILING_BY_FAILURE[code])` across active hard failures; set `qualityScore = min(qualityScore, effectiveCeiling)`; optionally clamp relevant breakdown dimensions.

**When to use:** Every `computeQualityGateFromAnalysis` and `runCompletedDerivationQualityGate` path; also after-retry gate.

**Ceiling table (SCR-02):**

| Failure category | `CreativeHardFailureCode`(s) | Ceiling |
|------------------|------------------------------|---------|
| Invented fact | `invented_factual_entity`, `unsupported_offer` (when note matches invented/fabricated) | 20 |
| Campaign replaced | `campaign_identity_drift`, `replaced_source_subject` | 15 |
| Missing CTA | `cta_drift` | 50 |
| Severe overload | `visual_overload`, `missing_dominant_idea` | 55 |
| Decorative variation | `decorative_only_variation` | 60 |

**Additional ceilings (discretion — align overload/template with SCR-02 spirit):**

| Code | Suggested ceiling | Rationale |
|------|-------------------|-----------|
| `generic_template_aesthetic` | 55 | PITFALLS.md score-cap example ~65; SCR-02 overload ≤55 — use 55 for severe aesthetic failure |
| `style_reference_contamination` | 20 | Factual integrity class (restyling) |
| `wrong_brand`, `unauthorized_brand_or_ip` | 15 | Campaign/brand replacement class |
| Any hard failure (fallback) | 60 | SCR-03: no "high" score with active hard failure |

**Example:**

```typescript
// Source: derived from SCR-02 + creative-quality-gate.ts deriveQualityVerdict [VERIFIED pattern]
const SCORE_CEILING_BY_FAILURE: Partial<Record<CreativeHardFailureCode, number>> = {
  invented_factual_entity: 20,
  unsupported_offer: 20,
  campaign_identity_drift: 15,
  replaced_source_subject: 15,
  wrong_brand: 15,
  unauthorized_brand_or_ip: 15,
  cta_drift: 50,
  visual_overload: 55,
  missing_dominant_idea: 55,
  generic_template_aesthetic: 55,
  decorative_only_variation: 60,
  style_reference_contamination: 20,
};

export function applyScoreCeilings(
  score: Pick<ScoreResult, "qualityScore" | "scoreBreakdown">,
  hardFailures: CreativeHardFailure[]
): Pick<ScoreResult, "qualityScore" | "scoreBreakdown"> {
  if (hardFailures.length === 0) return score;
  const ceiling = Math.min(
    60, // SCR-03 fallback: no high score with any hard failure
    ...hardFailures.map((f) => SCORE_CEILING_BY_FAILURE[f.code] ?? 60)
  );
  return {
    qualityScore: Math.min(score.qualityScore, ceiling),
    scoreBreakdown: /* optionally clamp dims */ score.scoreBreakdown,
  };
}
```

### Pattern 2: Mode-Aware Retry Policy (SCR-04)

**What:** Replace flat `RETRYABLE_FAILURE_CODES` with mode-specific sets; remove job-level restyling blanket skip.

**Retryable codes by mode:**

| Mode | Codes | Rationale |
|------|-------|-----------|
| `art_variation` | `cta_drift`, `unreadable_required_text`, `decorative_only_variation`, `visual_overload` | Text + hierarchy recoverable in one edit pass |
| `format_adaptation` | `cta_drift`, `unreadable_required_text`, `invalid_format_layout`, `cropped_critical_content` | Layout/text fixes |
| `restyling` | `style_reference_contamination`, `cta_drift`, `unreadable_required_text`, `copied_style_reference_facts` (legacy alias) | PITFALLS #4/#7; factual contamination is retry-safe from **base** source |

**Do NOT retry:** `invented_factual_entity`, `campaign_identity_drift`, `wrong_brand` — likely needs human review or full regen [ASSUMED: product accepts one auto-retry for contamination only on restyling].

### Pattern 3: Restyling Retry Image Source (SCR-04)

**What:** Resolve `referenceKey` from campaign base asset (`contract.baseAssetId` → asset.key), `styleReferenceKey` from `contract.styleAssetId`. Never `generated.outputKey` or failed derivation output.

**Job change sketch:**

```typescript
// derivation.ts auto-retry step — replace referenceKey logic for restyling
const isRestyling = generated.effectiveGenerationMode === "restyling";
const assets = isRestyling
  ? await getAssetsByCampaign(campaignId, workspaceId)
  : null;
const baseAsset = isRestyling
  ? assets?.find((a) => a.id === generated.resolvedContract.baseAssetId)
  : null;
const styleAsset = isRestyling
  ? assets?.find((a) => a.id === generated.resolvedContract.styleAssetId)
  : null;

// REMOVE: generated.effectiveGenerationMode === "restyling" early return

const referenceKey = isRestyling
  ? baseAsset!.key
  : asset?.key ?? parentDerivation?.outputKey ?? generated.outputKey;
```

**`runDerivationAutoRetry` extension:** When `generationMode === "restyling"` and `styleReferenceKey` provided, call `images.edit({ image: [baseFile, styleFile], ... })` matching initial generation [VERIFIED: `derivation.ts:621-628`].

### Pattern 4: Failure-Specific Correction Brief (SCR-05)

**What:** Map each `CreativeHardFailureCode` to a compact imperative correction line prepended before generic hard-failure list.

| Code | Correction directive |
|------|---------------------|
| `invented_factual_entity` | Remove any person, brand, team, or claim not in the allowed-entity registry; depict only contract-approved entities. |
| `replaced_source_subject` | Restore the original hero person/photo from the factual base; do not substitute a different subject. |
| `wrong_brand` / `unauthorized_brand_or_ip` | Restore the correct campaign brand/logo; remove unauthorized marks. |
| `campaign_identity_drift` | Restore the original campaign concept, offer narrative, and CTA; this is the same campaign in a new format, not a new ad. |
| `style_reference_contamination` | Copy visual style only (palette, typography, mood) from the style reference; all facts, people, offers, and CTA text must come from the base image only. |
| `visual_overload` | Reduce to at most three information zones; establish one dominant hook; demote or remove competing modules. |
| `missing_dominant_idea` | Restore the campaign's dominant visual idea as the clear focal point. |
| `decorative_only_variation` | Introduce a new visual mechanism or layout idea — not background/glow/color-only change. |
| `cta_drift` | Restore the contract CTA exactly (or inherited CTA from base for restyling/format). |
| `generic_template_aesthetic` | Remove generic neon/glass/template stacks unless required by brand; simplify to campaign-specific design. |

Inject `buildRestylingFactualSourceRule()` from `factual-visual-separation.ts` when `contract.generationMode === "restyling"` in auto-retry prompt footer.

### Anti-Patterns to Avoid

- **Ceiling only in prompt:** Phase 119 caps are instructional; SCR-02 requires code enforcement.
- **Retry from contaminated `outputKey`:** Violates SCR-04; reinforces style-reference facts in restyling.
- **Keeping restyling skip:** Directly blocks SCR-04.
- **Single-image restyling retry when style transfer needed:** Output may lose intended style; use original base+style assets.
- **Retry on invented entity / campaign drift:** Wastes API cost; unlikely fixed in one edit [ASSUMED].
- **New checklist keys for hierarchy:** Breaks Phase 119 locked decision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Failure code union | Duplicate codes | `CreativeHardFailureCode` + `normalizeHardFailureCode` | Phase 120 canonical names |
| Restyling factual rule prose | New paragraph | `factual-visual-separation.ts` exports | Phase 117 locked injection |
| OpenAI edit timeout/race | New wrapper | `withTimeout` in `derivation-auto-retry.ts` | Already exists |
| Correction preservation tail | Duplicate CTA logic | `buildRegenerationSuggestion` | Contract-aware CTA semantics |
| Retry eligibility in job | Inline code checks | `shouldAutoRetryDerivation(mode, failures, attempted)` | PITFALLS #7 single source |

## Common Pitfalls

### Pitfall 1: Score capped in verdict but not in DB (SCR-03 gap today)

**What goes wrong:** UI/API shows `qualityScore: 88` with `qualityVerdict: invalid`; operators trust the number.

**Why it happens:** `runCompletedDerivationQualityGate` persists `row.qualityScore` unchanged when hard failures exist [VERIFIED: L733-747].

**How to avoid:** Call `applyScoreCeilings` before `updateDerivationScore` in gate path (including after-retry).

**Warning signs:** Tests assert verdict invalid with score 85 but never assert persisted score ≤ ceiling.

### Pitfall 2: Restyling retry uses wrong reference asset

**What goes wrong:** Retry edits contaminated output or style reference as sole image; contamination persists.

**Why it happens:** `asset = assets[0]` may not be base role; `referenceKey` fallback includes `generated.outputKey` [VERIFIED: `derivation.ts:317,940-944`].

**How to avoid:** Resolve by `contract.baseAssetId`; assert key !== derivation `outputKey` in tests.

### Pitfall 3: `runDerivationAutoRetry` single-image limitation

**What goes wrong:** Restyling retry degrades to base-only edit; style lost or API behavior differs from first pass.

**How to avoid:** Extend auto-retry input with `styleReferenceKey` + two-file edit path.

### Pitfall 4: Retry policy too broad

**What goes wrong:** Auto-retry on `invented_factual_entity` burns credits without fix.

**How to avoid:** Mode-specific allowlist; keep `autoRetryAttempted` single-shot guard.

### Pitfall 5: SCR-01 confused with new dimensions

**What goes wrong:** Engineer adds `hierarchy` breakdown key; normalizers/UI break.

**How to avoid:** Prompt mapping only; reuse `visualQuality` → creativeRisk for hierarchy.

### Pitfall 6: Ceiling / prompt contradiction

**What goes wrong:** `SCORE VISUAL QUALITY CAPS` says "below 50" but SCR-02 overload ceiling is 55.

**How to avoid:** Update `observable-rubric.ts` caps to reference overall ceiling application or align dimension guidance.

## Code Examples

### Existing — verdict ignores high score with hard failures (SCR-03 partial)

```typescript
// Source: creative-quality-gate.ts [VERIFIED]
export function deriveQualityVerdict(input: {
  hardFailures: CreativeHardFailure[];
  qualityScore: number;
  checklist: CreativeQaChecklistWithStyle;
}): CreativeQualityVerdict {
  if (input.hardFailures.length > 0) {
    return "invalid";
  }
  // ...
}
```

### Existing — restyling retry blocked

```typescript
// Source: derivation.ts [VERIFIED:924-928]
if (
  generated.effectiveGenerationMode === "restyling" ||
  !shouldAutoRetryDerivation(hardFailures, log.autoRetryAttempted)
) {
  return null;
}
```

### Existing — narrow retry codes

```typescript
// Source: derivation-auto-retry-policy.ts [VERIFIED]
const RETRYABLE_FAILURE_CODES = new Set<CreativeHardFailure["code"]>([
  "cta_drift",
  "unreadable_required_text",
]);
```

### Target — gate persists capped score

```typescript
// Source: pattern for Phase 121 planner
const { hardFailures, polishSuggestions } = classifyCreativeQualityGate({ ... });
const capped = applyScoreCeilings(
  { qualityScore: rawScore, scoreBreakdown },
  hardFailures
);
const qualityVerdict = deriveQualityVerdict({
  hardFailures,
  qualityScore: capped.qualityScore,
  checklist,
});
await updateDerivationScore(derivationId, workspaceId, {
  qualityScore: capped.qualityScore,
  scoreBreakdown: capped.scoreBreakdown,
  scoreIssues,
  regenerationSuggestion,
});
```

## State of the Art

| Old Approach | Current (post-120) | Phase 121 Target |
|--------------|-------------------|------------------|
| Score caps deferred | Prompt-only `SCORE VISUAL QUALITY CAPS` | Code `applyScoreCeilings` per SCR-02 |
| High score + invalid verdict | Verdict invalid; score uncapped in DB | Persist capped score (SCR-03) |
| Restyling never auto-retries | Job skip at L925 | Mode-aware retry from base+style |
| Retry codes: CTA + legibility only | 2 codes | Restyling + contamination codes |
| Generic correction brief | Lists codes/messages | Per-code directives (SCR-05) |

**Deprecated/outdated:**
- PITFALLS.md phase mapping putting score caps in Phase 118 — superseded by roadmap Phase 121 SCR-02 [VERIFIED: `.planning/ROADMAP.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SCR-01 satisfied by prompt dimension map without new breakdown keys | SCR-01 mapping | Stakeholders may want separate hierarchy score field |
| A2 | `unsupported_offer` shares invented-fact ceiling 20 | Ceiling table | May need distinct ceiling if product disagrees |
| A3 | `generic_template_aesthetic` ceiling 55 (not in SCR-02 literal list) | Ceiling table | SCR-02 lists only five categories; gate already hard-fails generic |
| A4 | Restyling retry uses two original images (base+style) | Pattern 3 | SCR-04 only mandates factual source — single base might suffice for contamination fix |
| A5 | Do not auto-retry `invented_factual_entity` / `campaign_identity_drift` | Pattern 2 | Product may want one retry attempt for all hard failures |
| A6 | Fallback ceiling 60 for any unmatched hard failure code | Pattern 1 | May cap too high for severe factual codes without explicit mapping |

## Open Questions

1. **Should ceilings apply to breakdown dimensions or only `qualityScore`?**
   - What we know: SCR-02 lists overall ceilings by failure category; breakdown is stored separately.
   - What's unclear: Whether `visualQuality` must also be ≤55 when overload fires.
   - Recommendation: Cap `qualityScore` always; clamp `visualQuality`/`briefMatch` when related hard failure present (planner discretion).

2. **Restyling retry: two-image vs. base-only edit?**
   - What we know: First pass uses two images; SCR-04 forbids contaminated output as source.
   - Recommendation: Two-image from original assets (base first) — preserves style transfer while fixing facts.

3. **Align `SCORE VISUAL QUALITY CAPS` prompt numbers with SCR-02?**
   - What we know: Prompt says visualQuality below 50 for severe generic; SCR-02 overload ≤55 overall.
   - Recommendation: Update rubric to state overall score ceilings are enforced server-side after QA.

## Environment Availability

Step 2.6: **SKIPPED** — code-only phase; uses existing OpenAI + Inngest stack from prior phases.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | vitest, build | ✓ | project pin | — |
| Vitest | unit tests | ✓ | ^4.1.5 (4.1.9 registry) | — |
| OpenAI API | auto-retry image edit | ✓ (CI mocks) | `OPENAI_IMAGE_MODEL` | Mock in `derivation.test.ts` |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts tests/unit/ai/derivation-auto-retry-policy.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCR-01 | Score prompt documents six concern buckets | unit | `cd app && npm test -- tests/unit/ai/creative-score.test.ts -t "dimension"` | ❌ Wave 0 — extend `creative-score.test.ts` |
| SCR-02 | invented_factual_entity caps score ≤20 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts -t "invented"` | ❌ Wave 0 |
| SCR-02 | campaign_identity_drift caps ≤15 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts -t "campaign"` | ❌ Wave 0 |
| SCR-02 | cta_drift caps ≤50 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts -t "cta"` | ❌ Wave 0 |
| SCR-02 | visual_overload caps ≤55 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts -t "overload"` | ❌ Wave 0 |
| SCR-02 | decorative_only_variation caps ≤60 | unit | `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts -t "decorative"` | ❌ Wave 0 |
| SCR-03 | hard failure + raw 85 → capped score ≤ ceiling | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "capped score"` | ❌ Wave 0 |
| SCR-04 | restyling + style_reference_contamination → should retry | unit | `cd app && npm test -- tests/unit/ai/derivation-auto-retry-policy.test.ts -t "restyling"` | ❌ Wave 0 |
| SCR-04 | restyling retry reference is base asset not output | unit/integration | `cd app && npm test -- src/server/jobs/derivation.test.ts -t "restyling retry"` | ❌ Wave 0 |
| SCR-05 | correction brief contains remove-entity / restore-subject lines | unit | `cd app && npm test -- tests/unit/ai/regeneration-correction-brief.test.ts -t "specific"` | ❌ Wave 0 |
| SCR-05 | restyling contamination brief includes factual-source rule | unit | `cd app && npm test -- tests/unit/ai/regeneration-correction-brief.test.ts -t "restyling"` | ❌ Wave 0 |
| Regression | existing gate + corpus baseline stay green | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/creative-quality-gate.test.ts` | ✅ |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/ai/creative-score-ceilings.test.ts tests/unit/ai/derivation-auto-retry-policy.test.ts`
- **Per wave merge:** `cd app && npm test -- tests/unit/ai/`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `creative-score-ceilings.ts` + `applyScoreCeilings` + `SCORE_CEILING_BY_FAILURE`
- [ ] Wire ceilings in `computeQualityGateFromAnalysis` / `runCompletedDerivationQualityGate` persist path
- [ ] SCR-01 dimension map in `buildCreativeScorePrompt` + test
- [ ] Mode-aware `shouldAutoRetryDerivation(generationMode, hardFailures, attempted)`
- [ ] Remove restyling skip in `derivation.ts`; base/style key resolution
- [ ] `runDerivationAutoRetry` two-image restyling support
- [ ] `FAILURE_CORRECTION_DIRECTIVES` map in `regeneration-correction-brief.ts`
- [ ] `creative-score-ceilings.test.ts`
- [ ] Extend `derivation-auto-retry-policy.test.ts`, `regeneration-correction-brief.test.ts`
- [ ] Optional: `derivation.test.ts` mock asserting retry invoked for restyling contamination

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | Score/retry are server pipeline only |
| V5 Input Validation | yes | Existing Zod on score JSON (`rawScoreJsonSchema`); validate new ceiling inputs are typed `CreativeHardFailureCode` |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via `correctionFeedback` | Tampering | Brief built from structured hard failures + capped char limit (`MAX_PROMPT_FEEDBACK_CHARS` 1800) [VERIFIED: `regeneration-correction-brief.ts:8`] |
| Path traversal on `referenceKey` | Elevation | Use repository-resolved asset keys only; never user-supplied paths in retry |
| Unbounded retry cost | DoS | Keep `autoRetryAttempted` single-shot; mode allowlist |

## Project Constraints (from workspace rules)

- Use Context7 for library/API documentation when touching external packages [VERIFIED: context7.mdc]
- Render ephemeral filesystem — no new local persistence for score ceilings [VERIFIED: render-platform.mdc]
- Run tests after code changes; verify build before commit [VERIFIED: AGENTS.md]
- No new runtime npm dependencies unless justified (brownfield TypeScript)

## Plan Decomposition Recommendation

| Plan | Scope | Key files | Verification |
|------|-------|-----------|--------------|
| **121-01** | Score ceilings + SCR-01 prompt map + gate persist | `creative-score-ceilings.ts`, `creative-quality-gate.ts`, `creative-score.ts` | `creative-score-ceilings.test.ts`, gate capped-score test |
| **121-02** | Mode-aware retry policy + restyling job wiring + two-image auto-retry | `derivation-auto-retry-policy.ts`, `derivation-auto-retry.ts`, `derivation.ts` | policy tests + derivation mock test |
| **121-03** | SCR-05 correction directives + restyling factual rule on retry | `regeneration-correction-brief.ts`, `factual-visual-separation.ts` (read/export) | `regeneration-correction-brief.test.ts` |

**Dependency order:** 121-01 independent; 121-02 and 121-03 can parallel after 121-01 (retry uses brief from 121-03 — prefer 121-03 before 121-02 or combine 121-02+03).

## Sources

### Primary (HIGH confidence)

- `app/src/server/ai/creative-score.ts` — score prompt, normalize, no ceilings
- `app/src/server/ai/creative-quality-gate.ts` — `deriveQualityVerdict`, `computeQualityGateFromAnalysis`, persist path
- `app/src/server/ai/observable-rubric.ts` — `SCORE_VISUAL_QUALITY_CAPS` (prompt-only)
- `app/src/server/ai/creative-quality-taxonomy.ts` — breakdown mapping, failure codes
- `app/src/server/ai/derivation-auto-retry-policy.ts` — retry allowlist
- `app/src/server/ai/derivation-auto-retry.ts` — single-image edit retry
- `app/src/server/ai/regeneration-correction-brief.ts` — generic brief assembly
- `app/src/server/jobs/derivation.ts` — restyling skip L925; referenceKey L940-944; two-image restyling L621-628
- `.planning/phases/120-quality-gate-hardening/120-RESEARCH.md` — deferred ceilings to Phase 121
- `.planning/phases/119-observable-rubric/119-RESEARCH.md` — out-of-scope ceilings
- `.planning/REQUIREMENTS.md` — SCR-01–05
- `.planning/research/PITFALLS.md` — pitfalls #4, #7, #12 on retry/restyling/score
- `.planning/research/ARCHITECTURE.md` — score caps + retry extension
- `app/tests/unit/ai/creative-quality-gate.test.ts` — high score + hard failure verdict tests
- npm registry — vitest 4.1.9

### Secondary (MEDIUM confidence)

- `.planning/research/FEATURES.md` — score ceiling function recommendation
- `.planning/STATE.md` — locked Phase 117–120 decisions

### Tertiary (LOW confidence)

- PITFALLS.md score cap example "max 65 for generic" — superseded by SCR-02 literal ≤55 for overload [ASSUMED: use SCR-02 requirements as authority]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield modules verified in codebase
- Architecture: HIGH — gaps traced to specific lines; Phase 120 gate complete
- Pitfalls: HIGH — PITFALLS.md + code paths align
- Retry restyling two-image: MEDIUM — SCR-04 mandates factual source; two-image is recommended not locked in requirements

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable domain; 30 days)

## RESEARCH COMPLETE

**Phase:** 121 - Score Ceilings and Retry
**Confidence:** HIGH

### Key Findings

- Phase 120 blocks export via hard failures but **does not cap persisted `qualityScore`** — SCR-03 requires code-side `applyScoreCeilings` in the gate persist path.
- SCR-02 ceiling table maps directly to Phase 120 `CreativeHardFailureCode` values; no new dependencies.
- Restyling auto-retry is **disabled** in `derivation.ts` and policy allows only 2 codes; SCR-04 needs mode-aware policy + original base/style asset keys + likely two-image `images.edit`.
- SCR-05 needs per-code correction directives beyond today's generic hard-failure list; `regeneration-correction-brief.ts` is the extension point.
- SCR-01 is a **semantic mapping** of existing seven breakdown keys to six concerns — prompt documentation, not schema change.

### File Created

`.planning/phases/121-score-ceilings-and-retry/121-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All modules exist; verified line refs |
| Architecture | HIGH | Clear data flow gap score vs verdict |
| Pitfalls | HIGH | Documented in PITFALLS + code |

### Open Questions

- Breakdown dimension clamping vs. `qualityScore` only
- Two-image vs. base-only restyling retry
- Whether to auto-retry factual invention / campaign drift codes

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
