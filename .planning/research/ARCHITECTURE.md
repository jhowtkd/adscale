# Architecture Patterns: v12.3 Integridade Criativa

**Domain:** Creative derivation pipeline — factual integrity, visual hierarchy, and quality enforcement  
**Milestone:** v12.3 Integridade Criativa  
**Researched:** 2026-06-15  
**Confidence:** HIGH (grounded in live code paths; gate/QA behavior verified in `app/src/server/ai/` and `app/src/server/jobs/derivation.ts`)

## Objective

Integrate **factual integrity** and **visual hierarchy** rules into the existing derivation pipeline so that:

1. Rules are declared once, applied consistently at prompt → score → QA → gate.
2. Observed audit failures (invented entities, restyling contamination, format drift, generic AI layouts) become **detectable hard failures**, not polish suggestions.
3. Regression tests fail when rules exist in code but never reach the model prompt.

**Audit baseline:** `app/exports/render-creatives/` — 34 pieces, mean score 58.5/100; critical failures include invented celebrities/teams, restyling fact bleed, and format adaptations that become a different campaign.

---

## Current Pipeline Architecture

```text
Campaign workspace (upload, briefing, diagnosis API, preflight API)
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│ derivationJob (Inngest) — app/src/server/jobs/derivation.ts       │
├───────────────────────────────────────────────────────────────────┤
│ 1. fetch-context (campaign, plan, asset, parent, brand kit, …)    │
│ 2. resolve CreativeContract + PromptProvenance                    │
│ 3. buildDerivationPrompt (prompt-builder.ts)                      │
│ 4. OpenAI image edit/generate + normalizeGeneratedImage           │
│ 5. mark-completed + persist contract/provenance                   │
│ 6. scoreCompletedDerivation                                       │
│      └─ scoreDerivationHeuristic → analyzeDerivationCreative      │
│ 7. runCompletedDerivationQualityGate                              │
│      └─ analyzeCreativeQa → classifyCreativeQualityGate           │
│         → deriveQualityVerdict → persist hardFailures             │
│ 8. runDerivationAutoRetry (cta_drift | unreadable_required_text)  │
└───────────────────────────────────────────────────────────────────┘
```

### Upstream analysis (pre-generation)

| Module | When | Stored on | Consumed by |
|--------|------|-----------|-------------|
| `creative-diagnosis.ts` | User/API triggers diagnosis on base asset | `campaigns.creativeDiagnosis` | `buildDerivationPrompt`, `analyzeCreativeQa`, `analyzeDerivationCreative` |
| `preflight-analysis.ts` | User/API triggers preflight on asset | `assets.metadata.preflightResult` | `buildPreflightPromptSection` inside `buildDerivationPrompt` |
| `creative-readiness.ts` | Derived from preflight | API response only | Workspace gating (`canGenerate`); **not** re-run in derivation job |

### Contract spine (per derivation)

`creative-contract.ts` is the **authoritative machine contract** persisted on each derivation:

- `generationMode`, `targetFormat`, `ctaSemantics`
- `baseAssetId`, `styleAssetId`, `sourcePackage`
- `FACTUAL_SOURCE_RULES` (campaign asset vs approved parent vs restyling base/style split)

The job builds `resolvedContract` in `derivation.ts` (~L441–476) and passes it through prompt building, scoring, QA, gate, and auto-retry.

### Quality enforcement stack (post-generation)

```text
analyzeDerivationCreative (creative-score.ts)
  → scoreBreakdown + scoreIssues + regenerationSuggestion
        │
        ▼
analyzeCreativeQa (creative-qa.ts)
  → checklist (legibility, ctaOffer, informationPreservation, briefMatch, formatFit, creativeRisk [, styleFidelity])
        │
        ▼
classifyCreativeQualityGate (creative-quality-gate.ts)
  → hardFailures[] + polishSuggestions[]
        │
        ▼
deriveQualityVerdict → "invalid" | "improvable" | "acceptable"
```

**Taxonomy hub:** `creative-quality-taxonomy.ts` maps score breakdown keys → canonical criterion IDs and supplies regex patterns (`WRONG_BRAND_PATTERN`, `UNSUPPORTED_OFFER_PATTERN`, `CTA_DRIFT_NOTE_PATTERN`, etc.) used by the gate to promote QA/score notes into `CreativeHardFailureCode`.

**Fixture harness:** `quality-fixtures.ts` + `prompt-builder.test-fixtures.ts` exercise gate classification without live vision calls.

---

## Critical Gap (Root Cause)

`prompt-builder.ts` defines two rule blocks that are **never appended** to `buildDerivationPrompt` output:

- `VISUAL_HIERARCHY_CONTRACT` (dominant idea, three text tiers, factual preservation without equal weight, anti-dashboard layout, anti-AI-trope list)
- `ANTI_HALLUCINATION_RULES` (no invented people/products/claims)

Meanwhile, mode-specific preservation rules are verbose and partially overlapping (art_variation MANDATORY PRESERVATION vs hierarchy “may omit secondary facts”). The model receives contradictory signals: “preserve every module” vs “consolidate secondary facts” — but only the preservation-heavy lines are actually sent.

**Implication for v12.3:** integrity work is not a new parallel pipeline; it is **wiring + harmonizing** existing contracts across prompt, diagnosis, preflight, score, QA, and gate — with tests that prove injection.

---

## Recommended Integration Model

### Principle: single canonical integrity contract, three enforcement surfaces

```text
┌─────────────────────────────────────┐
│ CreativeIntegrityContract (extend)  │  ← NEW shared module OR extend creative-contract.ts
│ - factualSourceRules (existing)     │
│ - hierarchyRules (dominant idea, 3    │
│   tiers, de-emphasis not deletion)  │
│ - antiHallucinationRules            │
│ - modeOverrides (art / format /     │
│   restyling)                        │
└──────────────┬──────────────────────┘
               │
     ┌─────────┼─────────┬─────────────┐
     ▼         ▼         ▼             ▼
 prompt-   creative-  preflight-   creative-
 builder   diagnosis  analysis     qa + score
     │         │         │             │
     └─────────┴─────────┴─────────────┘
                       │
                       ▼
              creative-quality-gate
              (+ taxonomy patterns)
```

**Do not** fork separate hierarchy text in five files. Export:

- `buildIntegrityPromptSection(contract, mode, diagnosis?)` — used by `prompt-builder.ts`
- `buildIntegrityQaInstructions(contract)` — used by `creative-qa.ts` and `creative-score.ts`
- `INTEGRITY_HARD_FAILURE_PATTERNS` — used by `creative-quality-taxonomy.ts` / gate

### Data flow additions

| Stage | Input | Output / side effect |
|-------|--------|----------------------|
| Diagnosis | Base image + brief | `elementsToPreserve` with **verbatim quotes**; new `factualInventory[]` (optional structured field); `dominantIdea` string |
| Preflight | Base image + brief | Existing breakdown + **factual density flag** (crowded modules) feeding readiness and prompt suggestions |
| Prompt build | Contract + diagnosis + preflight | Injected `VISUAL_HIERARCHY` + `ANTI_HALLUCINATION` + mode-specific integrity block **after HARD RULES, before MODE** |
| Score | Output image + contract + diagnosis | Score **caps** when integrity violated; `scoreIssues` must cite contract clause |
| QA | Output image + contract + diagnosis | Checklist failures for invented entities, generic template, hierarchy overload |
| Gate | QA + scoreIssues + contract | Promote new codes to `hardFailures`; generic layout → `invalid` not `improvable` |
| Auto-retry | hardFailures | Extend retryable codes only after gate stable (e.g. `unsupported_offer`, `copied_style_reference_facts`) |

`derivation.ts` changes stay **thin**: pass enriched diagnosis/contract; no new orchestration steps unless a dedicated integrity pre-check is added later.

---

## Integration Points (File-Level)

### 1. `creative-contract.ts` — **MODIFY** (contract spine)

**Role:** Extend `CreativeContract` (or adjacent exported types) with integrity fields consumed by prompt, QA, score, and gate.

**Additions (suggested):**

```typescript
export type HierarchySemantics = {
  dominantIdeaRequired: true;
  maxTextTiers: 3;
  secondaryFactsPolicy: "de_emphasize_not_delete";
};

export type CreativeIntegrityRules = {
  hierarchy: HierarchySemantics;
  antiHallucination: true;
  factualSource: FactualSourceRules; // existing
};
```

Keep `resolveCtaSemantics` and `FACTUAL_SOURCE_RULES` as-is; add `DEFAULT_INTEGRITY_RULES` constant.

**Consumers:** prompt-builder, creative-qa, creative-score, creative-quality-gate, quality-fixtures.

---

### 2. `prompt-builder.ts` — **MODIFY** (primary prevention)

**Role:** Single assembly point for model-facing rules.

**Changes:**

| Area | Action |
|------|--------|
| `VISUAL_HIERARCHY_CONTRACT` / `ANTI_HALLUCINATION_RULES` | Wire into `buildDerivationPrompt` via shared `buildIntegrityPromptSection()` |
| `buildHardRulesSection` | Keep CTA/format/logo literals; reference integrity contract by reference |
| Mode blocks (`art_variation`, `format_adaptation`, `restyling`) | Reconcile preservation language with hierarchy policy (preserve **meaning**, not every module at equal size) |
| `buildDerivationPrompt` | Insert integrity section after HARD RULES, before MODE; include diagnosis `factualInventory` when present |
| Extract helpers | Add `extractPromptIntegritySection()` for snapshot tests (mirror `extractPromptHardRulesSection`) |

**Already wired (keep):** `buildPreflightPromptSection`, diagnosis block, restyling factual-source rule, creativity templates with INVIOLABLE TEXT for bold/extreme.

---

### 3. `creative-diagnosis.ts` — **MODIFY** (upstream fact extraction)

**Role:** Produce the preservation checklist the whole pipeline trusts.

**Changes:**

- Extend prompt/schema: `factualInventory` (verbatim strings), `dominantIdea`, `crowdingRisk` boolean
- Strengthen `elementsToPreserve` rules (already requires verbatim quotes — enforce in normalization)
- Export `buildDiagnosisIntegritySection(diagnosis)` for prompt injection
- **No job orchestration change** — diagnosis remains campaign API; derivation reads `campaign.creativeDiagnosis`

---

### 4. `preflight-analysis.ts` — **MODIFY** (upstream asset quality)

**Role:** Assess base asset before generation; inform prompt soft guidance.

**Changes:**

- Extend vision prompt: factual density, hierarchy clarity, generic-template risk on **source** asset
- Map `visualHierarchy` + new signals into `buildPreflightPromptSection` as explicit “integrity hints”
- Optional: feed `creative-readiness.ts` blocking/warning dimensions (align with READY-10 warning-only pattern for non-blocking dims)

**Boundary:** Preflight evaluates the **reference**, not the derivation output. Output integrity is score/QA/gate.

---

### 5. `creative-qa.ts` — **MODIFY** (output checklist)

**Role:** Vision checklist that feeds gate classification.

**Changes:**

- Import shared `buildIntegrityQaInstructions(contract, diagnosis)`
- Add explicit checks: invented person/brand/team, generic AI trope stack, hierarchy overload (competing equal-weight modules)
- Map failures to notes matching new taxonomy patterns (gate promotion depends on regex alignment)
- `normalizeCreativeQaResult` unchanged structurally — still `CreativeQaChecklist`

**Optional criterion:** Prefer strengthening existing criteria (`briefMatch`, `creativeRisk`, `informationPreservation`) over adding a new checklist key unless UI needs a dedicated column.

---

### 6. `creative-score.ts` — **MODIFY** (scored enforcement + caps)

**Role:** Numeric score with `scoreIssues` that gate promotes to hard failures.

**Changes:**

- Import shared integrity instructions (same vocabulary as QA)
- Add **score caps** e.g. `qualityScore = min(qualityScore, 45)` when invented-entity or unsupported-factual issue detected
- Ensure `informationPreservation` penalizes “everything at equal size” not just cropping
- `buildHardFailureRegenerationSuggestion` / `buildRegenerationSuggestion` — include integrity clause references

---

### 7. `creative-quality-gate.ts` — **MODIFY** (verdict authority)

**Role:** Sole classifier of `invalid` vs `improvable`; drives auto-retry and approval blocking.

**Changes:**

| Area | Action |
|------|--------|
| `CreativeHardFailureCode` | Add codes e.g. `invented_factual_entity`, `generic_template_layout`, `hierarchy_overload` (names TBD in requirements) |
| `classifyCreativeQualityGate` | Promote `creativeRisk` / `briefMatch` failures when notes match new patterns |
| `deriveQualityVerdict` | Treat new hard failures as `invalid` (existing path) |
| `classifyScoreIssue` | Map new `scoreIssues` phrases to hard failures |
| Polish demotion | Stop routing generic AI / invented entity notes to `polishSuggestions` only |

`runCompletedDerivationQualityGate` orchestration stays the same.

---

### 8. `creative-quality-taxonomy.ts` — **MODIFY** (shared patterns)

**Role:** Canonical IDs + regex bridge between model prose and gate codes.

**Add patterns (examples):**

- `INVENTED_ENTITY_PATTERN` — celebrity/team/uniform not in brief
- `GENERIC_AI_TROPES_PATTERN` — glassmorphism, neon stack, holographic grid
- `HIERARCHY_OVERLOAD_PATTERN` — equal-weight cards/badges/icon rows

Keep `SCORE_BREAKDOWN_TO_CRITERION` stable unless UI requires new breakdown dimension (defer `hierarchyFit` unless necessary).

---

### 9. `derivation.ts` — **MINIMAL MODIFY** (orchestrator)

**Role:** Job wiring only.

**Changes:**

- Pass enriched `creativeDiagnosis` (already passed)
- Ensure `resolvedContract` includes `integrityRules: DEFAULT_INTEGRITY_RULES`
- After gate hardening: optionally extend `derivation-auto-retry-policy.ts` retryable codes
- **No new steps** in the Inngest graph for v12.3 unless requirements demand pre-generation integrity block

Scoring and gate remain **non-blocking steps** (failures logged; job still completes) — integrity affects `qualityVerdict`, approval, and auto-retry, not generation success.

---

### 10. `quality-fixtures.ts` + tests — **NEW/MODIFY** (regression harness)

**Role:** Prove end-to-end contract → gate without flaky vision.

**Add fixtures from audit corpus:**

| Fixture ID | Failure mode | Expected hard failure |
|------------|--------------|----------------------|
| `fixture-invented-entity` | Cantona / wrong team | `invented_factual_entity` |
| `fixture-hierarchy-overload` | All modules equal weight | `hierarchy_overload` or `improvable` with cap |
| `fixture-generic-ai-template` | Neon/glass stack | `generic_template_layout` |
| Existing | CTA, crop, style contamination, format | Keep |

**Prompt tests (`prompt-builder.test.ts`):** snapshot integrity section presence per mode; fail if `VISUAL_HIERARCHY` / `ANTI_HALLUCINATION` not in prompt.

---

## New vs Modified Summary

| Component | Status | v12.3 responsibility |
|-----------|--------|----------------------|
| `creative-integrity-rules.ts` (or extend `creative-contract.ts`) | **NEW** (recommended) | Canonical integrity text + types + pattern exports |
| `quality-fixtures.ts` | **MODIFY + expand** | Audit corpus failure modes |
| `creative-contract.ts` | **MODIFY** | Attach `integrityRules` to contract |
| `prompt-builder.ts` | **MODIFY** | Inject integrity; reconcile mode copy |
| `creative-diagnosis.ts` | **MODIFY** | Richer factual inventory |
| `preflight-analysis.ts` | **MODIFY** | Source-asset hierarchy/density signals |
| `creative-qa.ts` | **MODIFY** | Aligned integrity checks |
| `creative-score.ts` | **MODIFY** | Caps + aligned issues |
| `creative-quality-gate.ts` | **MODIFY** | New hard failure codes |
| `creative-quality-taxonomy.ts` | **MODIFY** | New regex patterns |
| `derivation-auto-retry-policy.ts` | **MODIFY** (late) | Optional broader retry |
| `derivation.ts` | **MINIMAL** | Pass contract fields |
| `creative-readiness.ts` | **OPTIONAL** | Surface preflight integrity warnings |
| UI / API routes | **OUT OF SCOPE** unless requirements demand surfacing new verdict codes |

---

## Suggested Build Order

Dependencies flow **fixtures → contract → gate → validation**. Do not inject prompt text before gate knows how failures classify (avoids untestable prompt churn).

### Phase A — Fixtures first (failures defined before fixes)

1. Add audit-derived entries to `quality-fixtures.ts` with expected `hardFailureCodes` and `qualityVerdict: "invalid"`.
2. Add **prompt absence tests** that currently fail: assert `buildDerivationPrompt` output includes integrity markers (documents the bug).
3. Extend `prompt-builder.test-fixtures.ts` with Cantona/overload/generic contracts.

**Exit:** Tests red for the right reasons; fixture catalog documents audit failures.

### Phase B — Contract (single source of truth)

4. Introduce `CreativeIntegrityRules` + `DEFAULT_INTEGRITY_RULES` (+ `buildIntegrityPromptSection`, `buildIntegrityQaInstructions`).
5. Extend `CreativeContract` and derivation `resolvedContract` assembly.
6. Align `creative-diagnosis` schema/prompt with `factualInventory` / `dominantIdea`.

**Exit:** Types compile; contract serializes on derivation; no behavioral change yet.

### Phase C — Gate (enforce before prompt tuning)

7. Add `CreativeHardFailureCode` values + taxonomy regex patterns.
8. Update `classifyCreativeQualityGate` / `classifyScoreIssue` / `deriveQualityVerdict` to honor new fixtures.
9. Run `quality-fixtures` tests green for gate-only (synthetic QA/score JSON).

**Exit:** Gate correctly marks audit failure modes as `invalid` when checklist/issues match.

### Phase D — Validation surfaces (prompt + vision alignment)

10. Wire `prompt-builder.ts` integrity injection; reconcile mode-specific preservation copy.
11. Update `creative-qa.ts` + `creative-score.ts` prompts with shared integrity instructions + score caps.
12. Update `preflight-analysis.ts` prompt section builder for upstream hints.
13. Prompt snapshot tests green; full `npm test` for server AI modules.

**Exit:** Prompt contains integrity rules; QA/score vocabulary matches gate patterns.

### Phase E — Orchestration polish (optional)

14. Extend `derivation-auto-retry-policy.ts` if new failures are retry-safe.
15. Controlled visual validation script against `app/exports/render-creatives/manifest.json` (mean ≥75, fidelity ≥95 per PROJECT.md).

---

## Component Boundaries

| Component | Responsibility | Communicates with |
|-----------|---------------|-------------------|
| `creative-contract` (+ integrity) | Machine-readable obligations per derivation | prompt-builder, derivation job, QA, score, gate, fixtures |
| `creative-diagnosis` | Reference image fact inventory at campaign level | Campaign API, prompt-builder, QA, score |
| `preflight-analysis` | Reference asset quality + layout signals | Asset API, prompt-builder, creative-readiness |
| `prompt-builder` | Model instruction assembly | OpenAI image API via derivation job |
| `creative-score` | Post-hoc numeric evaluation | derivation repo, gate (via scoreIssues) |
| `creative-qa` | Post-hoc checklist evaluation | gate |
| `creative-quality-gate` | Verdict + hard failures + polish | derivation repo, auto-retry, approval APIs |
| `derivation.ts` | Async orchestration, no business rule duplication | All above via imports |
| `quality-fixtures` | Deterministic regression | gate tests, prompt tests |

---

## Patterns to Follow

### Pattern 1: Contract-first prompt sections

**What:** Build prompt fragments from `CreativeContract` + integrity rules, not ad-hoc string duplication.  
**When:** Any new rule that also appears in QA or gate.  
**Example:**

```typescript
// creative-integrity-rules.ts
export function buildIntegrityPromptSection(
  contract: CreativeContract,
  mode: GenerationMode,
  diagnosis?: CreativeDiagnosis | null,
): string {
  const lines = [VISUAL_HIERARCHY_CONTRACT, ANTI_HALLUCINATION_RULES];
  if (mode === "restyling") lines.push(RESTYLING_FACTUAL_BOUNDARY);
  if (diagnosis?.dominantIdea) lines.push(`Dominant idea to preserve: ${diagnosis.dominantIdea}`);
  return lines.join("\n");
}
```

### Pattern 2: Gate promotion via taxonomy regex

**What:** QA/score emit natural-language notes; gate maps them to typed `CreativeHardFailureCode` via shared patterns in `creative-quality-taxonomy.ts`.  
**When:** Adding a new failure class — add pattern first, then QA/score phrasing guidance.

### Pattern 3: Fixture-driven development

**What:** `quality-fixtures.ts` holds synthetic model JSON → expected verdict.  
**When:** Any gate or contract change — add fixture before implementation.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Rules declared but not injected

**What:** Constants in `prompt-builder.ts` never reach `parts.push`.  
**Why bad:** Tests pass; production keeps failing (current state).  
**Instead:** `extractPromptIntegritySection` snapshot test in CI.

### Anti-Pattern 2: Divergent vocabulary across QA and gate

**What:** QA prompt says “invented athlete”; gate regex expects “unsupported factual”.  
**Why bad:** Failures stay `improvable`.  
**Instead:** Shared `buildIntegrityQaInstructions` + centralized patterns.

### Anti-Pattern 3: Blocking generation on output gate

**What:** Moving quality gate before `mark-completed`.  
**Why bad:** Breaks delivery UX, credits, notifications; gate is intentionally post-complete.  
**Instead:** Keep gate post-score; use `qualityVerdict` + approval guard (`assertDerivationApprovable`).

### Anti-Pattern 4: Per-mode integrity forks in derivation.ts

**What:** Switch/case integrity logic in the job.  
**Why bad:** Orchestrator becomes rule owner; hard to test.  
**Instead:** Mode overrides live in integrity module; job passes `contract.generationMode`.

---

## Scalability Considerations

| Concern | Current (per derivation) | v12.3 impact |
|---------|--------------------------|--------------|
| Vision API calls | 2 post-gen (score + QA) + optional diagnosis/preflight | Same count; slightly longer prompts |
| Prompt tokens | Large mode blocks already | +~200–400 tokens for integrity section (acceptable) |
| Gate CPU | Regex classification only | Negligible |
| Test runtime | Fixture-based gate tests | Add ~5–10 fixtures; keep vision mocked |

---

## Research Flags for Roadmap Phases

| Phase topic | Likely needs deeper research | Reason |
|-------------|------------------------------|--------|
| Prompt injection order | Low | Order documented: HARD RULES → integrity → MODE |
| New hard failure codes vs score caps | Medium | Product must decide which failures block approval vs cap score |
| Auto-retry expansion | Medium | Retry cost/latency for `unsupported_offer` / style contamination |
| Visual validation harness | High | Script design, manifest scoring, CI placement |
| UI surfacing new verdict codes | Medium | Workspace review panel copy |

---

## Sources

- `app/src/server/jobs/derivation.ts` — orchestration, contract resolution, score/gate steps
- `app/src/server/ai/prompt-builder.ts` — prompt assembly; unused `VISUAL_HIERARCHY_CONTRACT` / `ANTI_HALLUCINATION_RULES`
- `app/src/server/ai/creative-contract.ts` — `CreativeContract`, `FACTUAL_SOURCE_RULES`
- `app/src/server/ai/creative-diagnosis.ts` — upstream preservation checklist
- `app/src/server/ai/preflight-analysis.ts` — upstream asset analysis
- `app/src/server/ai/creative-score.ts` — `analyzeDerivationCreative`, score caps opportunity
- `app/src/server/ai/creative-qa.ts` — `analyzeCreativeQa`, checklist
- `app/src/server/ai/creative-quality-gate.ts` — `classifyCreativeQualityGate`, `runCompletedDerivationQualityGate`
- `app/src/server/ai/creative-quality-taxonomy.ts` — criterion IDs and regex patterns
- `app/src/server/ai/quality-fixtures.ts` — regression harness
- `.planning/PROJECT.md` — v12.3 milestone goals and audit baseline
- `.planning/STATE.md` — root cause notes (rules not injected; gate treats generic as polish)
