# Phase 120: Quality Gate Hardening - Research

**Researched:** 2026-06-15
**Domain:** Creative quality gate — hard-failure promotion from QA/score notes to export-blocking `invalid` verdict
**Confidence:** HIGH

## Summary

Phase 120 closes the **enforcement gap** left intentionally open by Phases 117–119. Generation and evaluation prompts now describe overload, generic templates, campaign drift, and style-reference contamination observably; the gate still routes most aesthetic failures to `polishSuggestions` via `classifyCreativeRiskFailed`’s final `pushUnique(polishSuggestions, note)` fallback [VERIFIED: `creative-quality-gate.ts:155-184`]. Corpus baseline tests document the gap: `BASELINE_GAP_COUNT = 4`, four archetypes use `it.fails`, only `invented_factual_entity` is green after Phase 117 [VERIFIED: `corpus-baseline.test.ts:14,41-42,80-82`].

**Primary recommendation:** Extend `CreativeHardFailureCode` with the nine GATE-01 categories (migrating `copied_style_reference_facts` → `style_reference_contamination` and corpus `format_campaign_drift` → `campaign_identity_drift`), add regex classifiers in `creative-quality-taxonomy.ts` reusing `observable-rubric.ts` note markers, refactor `classifyCreativeRiskFailed` / `classifyBriefMatchFailed` / `classifyScoreIssue` to promote before polish fallback, update `CONTAMINATION_FAILURE_CODES` and i18n, add a **faithful** `c2c12774` positive fixture for GATE-05, then flip all corpus baseline reds and set `BASELINE_GAP_COUNT = 0`. **Defer numeric score ceilings** to Phase 121 (SCR-02) — GATE-03 is satisfied by hard-failure promotion, not score caps.

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

### Claude's Discretion
- Code naming: `campaign_identity_drift` vs corpus `format_campaign_drift`; `style_reference_contamination` vs `copied_style_reference_facts` / `restyling_factual_contamination` — align to GATE-01 canonical names with backward-compat alias for persisted `hardFailures` JSON
- Whether mild `creativeRisk` warnings (e.g. simplify badge row) remain polish-only while `failed` promotes — recommend: **only `failed` checklist rows promote**; `warning` stays polish (preserves GATE-05 improvable path)
- Plan wave count (2–4 plans) and whether i18n ships in same plan as taxonomy

### Deferred Ideas (OUT OF SCOPE)
- Numeric score ceilings and retry-specific corrections (Phase 121 SCR-01–05)
- Full gate matrix / prompt injection regression suite (Phase 122 TEST-01–04)
- Live vision re-generation / CI visual validation (Phase 123 QA-18–21)
- New QA checklist keys (`visualHierarchy`, etc.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Nine blocking categories active | Extend `CreativeHardFailureCode` union + taxonomy patterns + classifier wiring (mapping table below) |
| GATE-02 | Factual failure → `invalid` regardless of aesthetic score | Already true when `hardFailures.length > 0` [VERIFIED: `deriveQualityVerdict` L438-439, test L345-366]; extend factual codes + ensure promotion paths cover briefMatch/creativeRisk/styleFidelity |
| GATE-03 | Severe generic aesthetic blocks export, not polish only | Promote `creativeRisk`/`scoreIssues` matching `GENERIC_TEMPLATE_NOTE_MARKERS` + `OVERLOAD_NOTE_MARKERS`; update `creative-quality-gate.test.ts` generic→hard test L136-148 |
| GATE-04 | Corpus pieces 27069645, a753e357, 538246da, a5f65b85, f420bcb2, d7d9d323 blocked | Covered by existing 5 archetype fixtures + gate promotion; add `f420bcb2` to restyling fixture `corpusRefIds` if missing |
| GATE-05 | Faithful c2c12774 remains approvable | New positive fixture + false-positive guard tests; mode/criterion guards on drift/decorative classifiers |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hard-failure code union + regex taxonomy | API / Backend (`creative-quality-taxonomy.ts`) | `observable-rubric.ts` (note markers) | Single classifier source; rubric already exports markers for promotion |
| Note → hard-failure classification | API / Backend (`creative-quality-gate.ts`) | taxonomy patterns | Gate owns export verdict; prompts only supply notes |
| Factual lineage / parent block | API / Backend (`factual-visual-separation.ts`) | jobs `derivation.ts` | `CONTAMINATION_FAILURE_CODES` must include new factual codes |
| Export / approve blocking | API routes (`delivery-package`, `review`, `save-reference`) | `assertDerivationApprovable` | Already blocks on `hardFailures` — no route changes if gate emits codes |
| User-facing failure labels | Frontend i18n (`messages/en.json`, `pt-BR.json`) | — | New codes need `hardFailureCodes.*` entries (invented_factual_entity also missing today) |
| Corpus baseline flip | Vitest (`corpus-baseline.test.ts`) | `corpus-fixtures.ts` | `BASELINE_GAP_COUNT → 0`, `it.fails` → `it`, update `baselineVerdict` |
| Faithful-piece guard (GATE-05) | Vitest (`creative-quality-gate.test.ts` or `corpus-fixtures.ts`) | — | Positive fixture prevents classifier regression |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Gate + taxonomy changes | Brownfield; no new deps |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Baseline flip + gate matrix | Established Phases 115–119 |
| `creative-quality-gate.ts` | — | Classifiers + `deriveQualityVerdict` | Export gate owner |
| `creative-quality-taxonomy.ts` | — | Regex patterns | Shared by gate + score promotion |
| `observable-rubric.ts` | — | `OVERLOAD_NOTE_MARKERS`, `GENERIC_TEMPLATE_NOTE_MARKERS`, `MISSING_DOMINANT_IDEA_MARKERS` | Phase 119 forward-reference — import into taxonomy |
| `corpus-fixtures.ts` | — | Archetype QA JSON + expected codes | GATE-04 contract |
| `factual-visual-separation.ts` | — | `CONTAMINATION_FAILURE_CODES` | Parent lineage for format_adaptation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `per-mode-prompt-rules.ts` | — | `DECORATIVE_ONLY_REJECTION` prose | Source vocabulary for `decorative_only_variation` pattern |
| `quality-fixture-pipeline.test.ts` | — | Synthetic failure matrix | Extend if new codes need non-corpus coverage |
| `messages/en.json` / `pt-BR.json` | — | `hardFailureCodes` | Every new code |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex promotion from QA notes | New checklist dimension `visualHierarchy` | Breaks normalizers/UI; rejected in Phase 119 |
| Score-based blocking for generic (SCR caps) | Hard failure only in 120 | SCR-02 is Phase 121; GATE-03 needs gate-level block now |
| Keep `copied_style_reference_facts` | Rename to `style_reference_contamination` | GATE-01 canonical name; keep read-alias for DB JSON |
| Separate `restyling_factual_contamination` code | Map to `style_reference_contamination` | One canonical code per GATE-01; corpus fixture updates expected codes |

**Installation:** None.

## Architecture Patterns

### System Architecture Diagram

```
OpenAI vision QA JSON (checklist + notes from Phase 119 rubric)
         │
         ▼
┌─────────────────────────────┐
│ normalizeCreativeQaResult   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐     scoreIssues from DB
│ classifyCreativeQualityGate │◄────────────────────────
│  ├ classifyBriefMatchFailed │  briefMatch → factual/drift codes
│  ├ classifyCreativeRiskFailed│ creativeRisk → aesthetic + factual codes
│  ├ styleFidelity failed path │  restyling → style_reference_contamination
│  └ promoteScoreIssues       │  scoreIssues → same patterns
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ deriveQualityVerdict        │  hardFailures.length > 0 → invalid (GATE-02)
│  (score 85 ignored if hard) │
└─────────────┬───────────────┘
              │
              ▼
 assertDerivationApprovable → delivery-package / review / save-reference
```

### Recommended Project Structure

```
app/src/server/ai/
├── creative-quality-gate.ts       # MODIFY: classifiers, extended CreativeHardFailureCode
├── creative-quality-taxonomy.ts   # MODIFY: new patterns; re-export or import rubric markers
├── observable-rubric.ts           # READ: OVERLOAD/GENERIC/MISSING_DOMINANT_IDEA markers
├── factual-visual-separation.ts   # MODIFY: CONTAMINATION_FAILURE_CODES
├── corpus-fixtures.ts             # MODIFY: expected codes, baselineVerdict, faithful fixture, f420bcb2 ref
└── per-mode-prompt-rules.ts       # READ: DECORATIVE_ONLY_REJECTION vocabulary

app/tests/unit/ai/
├── corpus-baseline.test.ts        # MODIFY: BASELINE_GAP_COUNT=0, it.fails→it
├── creative-quality-gate.test.ts  # MODIFY: generic/overload hard; GATE-05 guard
└── quality-fixture-pipeline.test.ts  # OPTIONAL: new code coverage

app/messages/en.json, pt-BR.json   # MODIFY: hardFailureCodes for all GATE-01 codes
```

### Pattern 1: Promote-Before-Polish Classifier

**What:** In `classifyCreativeRiskFailed`, match taxonomy patterns in priority order; only unmatched notes go to `polishSuggestions`.

**When to use:** All `creativeRisk` `failed` rows and relevant `scoreIssues`.

**Example:**

```typescript
// Source: Phase 119 markers [VERIFIED: observable-rubric.ts:121-128] + gate structure
import {
  OVERLOAD_NOTE_MARKERS,
  GENERIC_TEMPLATE_NOTE_MARKERS,
  MISSING_DOMINANT_IDEA_MARKERS,
} from "./observable-rubric";
import {
  INVENTED_ENTITY_PATTERN,
  STYLE_REFERENCE_CONTAMINATION_PATTERN,
  DECORATIVE_ONLY_PATTERN, // NEW in taxonomy
} from "./creative-quality-taxonomy";

function classifyCreativeRiskFailed(
  hardFailures: CreativeHardFailure[],
  polishSuggestions: string[],
  contract: CreativeContract,
  note: string
): void {
  // ... existing unsupported_offer, invented_factual_entity, style_reference ...
  if (noteMatches(OVERLOAD_NOTE_MARKERS, note)) {
    pushHardFailure(hardFailures, { code: "visual_overload", message: note, criterion: "creativeRisk" });
    return;
  }
  if (noteMatches(GENERIC_TEMPLATE_NOTE_MARKERS, note)) {
    pushHardFailure(hardFailures, { code: "generic_template_aesthetic", message: note, criterion: "creativeRisk" });
    return;
  }
  if (noteMatches(MISSING_DOMINANT_IDEA_MARKERS, note)) {
    pushHardFailure(hardFailures, { code: "missing_dominant_idea", message: note, criterion: "creativeRisk" });
    return;
  }
  if (contract.generationMode === "art_variation" && noteMatches(DECORATIVE_ONLY_PATTERN, note)) {
    pushHardFailure(hardFailures, { code: "decorative_only_variation", message: note, criterion: "creativeRisk" });
    return;
  }
  pushUnique(polishSuggestions, note);
}
```

### Pattern 2: Mode-Scoped Campaign Identity Drift

**What:** `campaign_identity_drift` promotes from `briefMatch` and/or `formatFit` when `generationMode === "format_adaptation"` and note describes narrative/product/hero identity swap — not layout-only failures.

**When to use:** Corpus `format_campaign_drift` / GATE-04 pieces `538246da`, `27069645`.

**Example pattern (taxonomy):**

```typescript
// Source: corpus-fixtures briefMatch note [VERIFIED: corpus-fixtures.ts:189-196]
export const CAMPAIGN_IDENTITY_DRIFT_PATTERN =
  /different campaign (?:identity|narrative)|(?:instead of|replaced with).*(?:narrative|story|enrollment)|education\/professor|not a faithful.*adaptation/i;

// Guard: do NOT match faithful positives
export const CAMPAIGN_IDENTITY_SAFE_PATTERN =
  /faithful|same campaign|preserved.*narrative|identical people/i;
```

### Pattern 3: Style Reference Contamination (rename + broaden)

**What:** Replace emit of `copied_style_reference_facts` with `style_reference_contamination`; match people/uniforms/factual leak notes from restyling corpus.

**When to use:** `styleFidelity` failed (restyling) and `creativeRisk` notes matching `STYLE_REFERENCE_CONTAMINATION_PATTERN`.

**Backward compat:** `normalizeHardFailureCode(code)` maps `copied_style_reference_facts` → `style_reference_contamination` when reading persisted derivations; `CONTAMINATION_FAILURE_CODES` includes new code (and optionally legacy alias).

### Pattern 4: GATE-05 Faithful Positive Fixture

**What:** Add `corpus-faithful-format-adaptation` to `CORPUS_ARCHETYPE_FIXTURES` (or parallel `CORPUS_POSITIVE_FIXTURES` array) mirroring `c2c12774` — NR1 4:5 format adaptation with passed briefMatch/formatFit and optional `warning` on creativeRisk.

**When to use:** Regression guard whenever drift/generic/overload patterns are tightened.

### Anti-Patterns to Avoid

- **Promoting `warning` checklist rows:** Would block GATE-05 improvable/acceptable faithful pieces with simplification hints.
- **Bare "generic" regex:** `"Visual feels generic"` must stay polish-only [VERIFIED: `creative-quality-gate.test.ts:136-148`]; require severe template markers.
- **Gate work in Phase 121:** Score ceilings complement but do not replace GATE-03 hard failures.
- **Duplicating rubric markers:** Import from `observable-rubric.ts`, do not copy regex literals.

## GATE-01: Code → Pattern → Criterion Mapping

| `CreativeHardFailureCode` (GATE-01) | Taxonomy pattern | Primary criterion | Mode / guard | Corpus / note exemplar |
|-------------------------------------|------------------|-------------------|--------------|------------------------|
| `invented_factual_entity` | `INVENTED_ENTITY_PATTERN` [exists] | briefMatch, creativeRisk | all | "Eric Cantona", "Manchester United", "Hallucinated celebrity athlete" |
| `replaced_source_subject` | `REPLACED_SOURCE_SUBJECT_PATTERN` **NEW** | briefMatch, informationPreservation | art_variation, format_adaptation | "replaced hero photo", "different subject than base" |
| `unauthorized_brand_or_ip` | `UNAUTHORIZED_BRAND_PATTERN` [exists L87-88] | briefMatch | all | "unauthorized brand", "unlisted brand" |
| `campaign_identity_drift` | `CAMPAIGN_IDENTITY_DRIFT_PATTERN` **NEW** | briefMatch, formatFit | **format_adaptation only** | "education/professor enrollment narrative instead of CENBRAP NR1" |
| `style_reference_contamination` | `STYLE_REFERENCE_CONTAMINATION_PATTERN` + people/uniforms **NEW** | styleFidelity, creativeRisk | restyling | "athlete portraits and team uniforms from style reference" |
| `generic_template_aesthetic` | `GENERIC_TEMPLATE_NOTE_MARKERS` [observable-rubric] | creativeRisk | all | "generic premium-tech neon template aesthetic" |
| `visual_overload` | `OVERLOAD_NOTE_MARKERS` [observable-rubric] | creativeRisk | all | "more than three competing information zones" |
| `missing_dominant_idea` | `MISSING_DOMINANT_IDEA_MARKERS` [observable-rubric] | creativeRisk, briefMatch | all | "no NR1 audit-specific visual idea" |
| `decorative_only_variation` | `DECORATIVE_ONLY_PATTERN` **NEW** (from `DECORATIVE_ONLY_REJECTION`) | creativeRisk | **art_variation only** | "background-only recolor", "without mechanism change" |

**Legacy / corpus alias migration:**

| Legacy code / corpus name | GATE-01 canonical | Action |
|---------------------------|-------------------|--------|
| `copied_style_reference_facts` | `style_reference_contamination` | Emit canonical; read-alias persisted JSON |
| `format_campaign_drift` (corpus archetype) | `campaign_identity_drift` | Update `expectedHardFailureCodes` in `corpus-fixtures.ts` |
| `restyling_factual_contamination` (corpus archetype) | `style_reference_contamination` | Update `expectedHardFailureCodes`; drop duplicate code |

## How to Flip `BASELINE_GAP_COUNT` to 0

**Current state** [VERIFIED: `corpus-baseline.test.ts` run 2026-06-15 — 9 passed, 4 expected fail]:

| Archetype | `it` vs `it.fails` | Current verdict | Expected codes | Gap |
|-----------|-------------------|-----------------|----------------|-----|
| `invented_factual_entity` | `it` (green) | invalid | `invented_factual_entity` | None |
| `visual_overload` | `it.fails` | acceptable | `visual_overload` | No promotion |
| `generic_template_aesthetic` | `it.fails` | acceptable | `generic_template_aesthetic` | No promotion |
| `format_campaign_drift` | `it.fails` | invalid | `format_campaign_drift`, `wrong_brand` | Wrong/missing codes (`invalid_format_layout` only today from formatFit failed) |
| `restyling_factual_contamination` | `it.fails` | invalid | `restyling_factual_contamination`, `copied_style_reference_facts` | Partial — `copied_style_reference_facts` only |

**Flip checklist (all required):**

1. **Implement classifiers** so each archetype’s `rawQaModelOutput` notes produce the canonical expected codes.
2. **Update `corpus-fixtures.ts`:**
   - `baselineVerdict`: `"acceptable"` → `"invalid"` for `visual_overload`, `generic_template_aesthetic`.
   - `expectedHardFailureCodes`: align to GATE-01 names (`campaign_identity_drift`, `style_reference_contamination`).
   - Add `f420bcb2` to restyling `corpusRefIds` (GATE-04 explicit ID, currently only `d7d9d323`, `a5f65b85`).
3. **Update `corpus-baseline.test.ts`:**
   ```typescript
   export const BASELINE_GAP_COUNT = 0;
   const runBaselineRejectionTest = it; // remove invented_factual_entity ternary
   ```
4. **Update snapshot test** `baseline-snapshot` — all fixtures `expect(verdict).toBe(fixture.baselineVerdict)` with updated baselines.
5. **Update `creative-quality-gate.test.ts`** — change "keeps subjective creativeRisk failed as polish only" to distinguish mild generic vs severe template notes.
6. **Run:** `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/creative-quality-gate.test.ts`

## GATE-05: False-Positive Guard for `c2c12774`

**Corpus fact:** `c2c12774` is `teste-3` NR1 **format_adaptation** `4:5` **final** — faithful cross-format piece per ROADMAP success criteria [VERIFIED: `manifest-index.json`].

**No negative fixture exists today** — add positive fixture:

```typescript
// corpus-fixtures.ts — suggested addition
{
  id: "corpus-faithful-format-adaptation",
  archetype: "format_campaign_drift", // or new archetype "faithful_format_adaptation"
  label: "Faithful NR1 4:5 adaptation (c2c12774)",
  corpusRefIds: ["c2c12774"],
  canonicalSlug: "teste-3-nr1",
  renderTier: "final",
  contract: nr1FormatAdaptationContract({ targetFormat: "4:5" }),
  rawQaModelOutput: qaModelOutput({
    briefMatch: {
      status: "passed",
      note: "CENBRAP NR1 checklist narrative preserved; same campaign identity as 1:1 source.",
    },
    formatFit: {
      status: "passed",
      note: "Faithful NR1 format adaptation in native 4:5 layout.",
    },
    creativeRisk: {
      status: "warning",
      note: "Optional: badge row could be simplified; hook and CTA remain dominant.",
    },
  }),
  expectedHardFailureCodes: [],
  expectedVerdict: "acceptable", // or "improvable" if warnings force improvable — must NOT be "invalid"
  baselineVerdict: "acceptable",
}
```

**Guard tests** (`creative-quality-gate.test.ts`):

| Scenario | Input | Must NOT produce |
|----------|-------|------------------|
| Faithful fixture pipeline | fixture above, `qualityScore: 85` | any hard failure code |
| Approvable export | `assertDerivationApprovable({ qualityVerdict: "acceptable", hardFailures: [] })` | `ok: false` |
| Mild generic warning | `creativeRisk: warning`, "could be bolder" | `generic_template_aesthetic` |
| Faithful format note | `formatFit: passed`, "faithful NR1 format adaptation" | `campaign_identity_drift` |
| Simplification suggestion | `creativeRisk: warning`, "badge row could be simplified" | `visual_overload` |

**Classifier rules protecting GATE-05:**

- Apply `CAMPAIGN_IDENTITY_SAFE_PATTERN` negation before promoting drift.
- Require `checklist.*.status === "failed"` for promotion (warnings → polish only).
- `decorative_only_variation` gated on `generationMode === "art_variation"`.
- `visual_overload` requires zone-count / competing-module language from `OVERLOAD_NOTE_MARKERS`, not "could be simplified".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Aesthetic defect regex | Duplicate rubric prose | `observable-rubric.ts` markers | Phase 119 single source |
| Note pattern tests | Ad-hoc strings in gate tests | `corpus-fixtures.ts` rawQaModelOutput | GATE-04 traceability |
| Export block in routes | New approval logic | `assertDerivationApprovable` | Already centralized |
| Score ceiling for generic | SCR-02 in Phase 120 | Hard failure in gate | Requirement split across phases |
| Vision re-run for corpus PNGs | Image pipeline in 120 | Synthetic QA JSON fixtures | FIXT-04 pattern from Phase 115 |

## Common Pitfalls

### Pitfall 1: `formatFit failed` → `invalid_format_layout` masks drift

**What goes wrong:** `format_campaign_drift` fixture gets `invalid_format_layout` from unconditional formatFit failed path [VERIFIED: `creative-quality-gate.ts:327-333`] but test expects `campaign_identity_drift`.

**How to avoid:** In `classifyBriefMatchFailed` / formatFit branch, check `CAMPAIGN_IDENTITY_DRIFT_PATTERN` **before** default `invalid_format_layout`; emit `campaign_identity_drift` when narrative identity fails even if layout note is generic.

### Pitfall 2: Over-broad "generic" promotion

**What goes wrong:** Faithful pieces with mild creativeRisk warnings become `invalid`.

**How to avoid:** Severe markers only; `warning` status never promotes; keep unit test for mild generic polish path.

### Pitfall 3: Breaking persisted `hardFailures` JSON

**What goes wrong:** Renaming `copied_style_reference_facts` breaks UI labels and parent lineage checks on old rows.

**How to avoid:** `normalizeHardFailureCode()` at read boundaries; extend `CONTAMINATION_FAILURE_CODES` with both codes during transition; update i18n keys.

### Pitfall 4: Missing i18n for new codes

**What goes wrong:** UI shows raw code strings; `invented_factual_entity` already missing from `hardFailureCodes` [VERIFIED: `messages/en.json:1401-1408`].

**How to avoid:** Add all GATE-01 codes to `en.json` and `pt-BR.json` in same plan wave as taxonomy.

### Pitfall 5: `BASELINE_GAP_COUNT` flipped before classifiers complete

**What goes wrong:** CI fails with 4 red tests blocking merge.

**How to avoid:** Implement classifiers first; flip test harness last (final task / plan).

## Code Examples

### GATE-02 — factual invalid regardless of score (existing)

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

### Corpus baseline pipeline (test harness)

```typescript
// Source: corpus-baseline.test.ts [VERIFIED]
function runCorpusGatePipeline(fixture: CorpusArchetypeFixture) {
  const qa = normalizeCreativeQaResult(fixture.rawQaModelOutput);
  const gate = classifyCreativeQualityGate({
    contract: fixture.contract,
    checklist: qa.checklist,
  });
  const verdict = deriveQualityVerdict({
    hardFailures: gate.hardFailures,
    qualityScore: 85, // GATE-02: high score must not override hard failures
    checklist: qa.checklist,
  });
  return { qa, gate, verdict };
}
```

### Import rubric markers into taxonomy

```typescript
// Source: observable-rubric.ts [VERIFIED:121-128]
export {
  OVERLOAD_NOTE_MARKERS,
  GENERIC_TEMPLATE_NOTE_MARKERS,
  MISSING_DOMINANT_IDEA_MARKERS,
} from "./observable-rubric";
// taxonomy.ts adds factual/drift/decorative/replaced-subject patterns not in rubric
```

## Plan Decomposition Recommendation

| Plan | Scope | Key files | Verification |
|------|-------|-----------|--------------|
| **120-01** | Taxonomy + type union + `normalizeHardFailureCode` + i18n | `creative-quality-taxonomy.ts`, `creative-quality-gate.ts` (types only), `messages/*.json` | Unit tests for pattern match matrix |
| **120-02** | Classifier refactor (briefMatch, creativeRisk, styleFidelity, scoreIssues) + `CONTAMINATION_FAILURE_CODES` | `creative-quality-gate.ts`, `factual-visual-separation.ts` | `creative-quality-gate.test.ts` overload/generic/drift/restyling |
| **120-03** | Corpus fixture alignment + faithful `c2c12774` fixture + baseline flip | `corpus-fixtures.ts`, `corpus-baseline.test.ts` | `BASELINE_GAP_COUNT === 0`, all baseline-red green |
| **120-04** (optional) | `quality-fixtures` / regeneration brief snippets for new codes | `quality-fixtures.ts`, `creative-score.test.ts` | Pipeline tests pass |

**Dependency order:** 120-01 → 120-02 → 120-03 (120-04 parallel after 120-02).

## State of the Art

| Old Approach | Current (pre-120) | Phase 120 Target |
|--------------|-------------------|------------------|
| Generic/overload → polish | `classifyCreativeRiskFailed` fallback | Hard failure codes |
| `copied_style_reference_facts` | Restyling styleFidelity | `style_reference_contamination` |
| formatFit failed → always `invalid_format_layout` | format_adaptation | Drift pattern → `campaign_identity_drift` |
| 4 corpus `it.fails` | Documented gap | All green, `BASELINE_GAP_COUNT = 0` |
| No faithful corpus test | GATE-05 manual only | `c2c12774` positive fixture |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GATE-03 satisfied by hard-failure promotion without SCR score caps | Summary | Product may want both; Phase 121 adds ceilings |
| A2 | `warning` checklist rows stay non-blocking | User Constraints | GATE-05 may need `acceptable` vs `improvable` choice |
| A3 | `invalid_format_layout` still applies when layout note matches blur/poster patterns even in drift cases | Pitfall 1 | Dual codes on one fixture may be acceptable |
| A4 | `f420bcb2` shares restyling contamination archetype with `a5f65b85` | GATE-04 | May need separate note if audit differs |
| A5 | UI uses `hardFailureCodes.{code}` with fallback to raw code | i18n | Missing keys show English code string |

## Open Questions (RESOLVED)

1. **Dual hard failures on format drift fixture (`campaign_identity_drift` + `wrong_brand`)?** — **RESOLVED:** Narrow corpus `expectedHardFailureCodes` to `["campaign_identity_drift"]` only. The `format_campaign_drift` briefMatch note ("education/professor enrollment narrative instead of CENBRAP NR1") matches `CAMPAIGN_IDENTITY_DRIFT_PATTERN`, not `WRONG_BRAND_PATTERN`; dual codes are redundant.

2. **`acceptable` vs `improvable` for faithful fixture with creativeRisk warning?** — **RESOLVED:** Use `improvable` with `expectedHardFailureCodes: []`. `deriveQualityVerdict` returns `improvable` when checklist warnings exist without hard failures [VERIFIED: L442-444]; `assertDerivationApprovable` remains `ok: true` — satisfies GATE-05 "aprovável".

3. **Emit one or two codes for restyling contamination?** — **RESOLVED:** Single canonical `style_reference_contamination` on emit (not dual with `copied_style_reference_facts`). Corpus `expectedHardFailureCodes` updates to `["style_reference_contamination"]`; `normalizeHardFailureCode` handles persisted legacy rows.

## Environment Availability

Step 2.6: **SKIPPED** — code-only phase; no new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | vitest | ✓ | project pin | — |
| Vitest | unit tests | ✓ | ^4.1.5 | — |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/corpus-baseline.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | Each new code promotes from representative note | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts` | ✅ extend |
| GATE-02 | hardFailures + qualityScore 85 → invalid | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "high qualityScore"` | ✅ L345-382 |
| GATE-03 | Severe generic note → hard failure not polish | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "generic"` | ✅ update L136-148 |
| GATE-04 | All 5 negative archetypes invalid + expected codes | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts` | ✅ flip `it.fails` |
| GATE-04 | Primary audit IDs linked | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "primary audit"` | ✅ |
| GATE-05 | c2c12774 faithful fixture approvable | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "faithful"` | ❌ Wave 0 |
| GATE-05 | Mild generic warning stays polish | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "polish only"` | ✅ keep |
| Regression | `BASELINE_GAP_COUNT === 0` | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "baseline gap"` | ✅ update assertion |
| Regression | Parent lineage includes new contamination codes | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "CONTAMINATION"` | ✅ extend |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts tests/unit/ai/corpus-baseline.test.ts`
- **Per wave merge:** `cd app && npm test -- tests/unit/ai/`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `DECORATIVE_ONLY_PATTERN`, `REPLACED_SOURCE_SUBJECT_PATTERN`, `CAMPAIGN_IDENTITY_DRIFT_PATTERN` in taxonomy
- [ ] `CreativeHardFailureCode` union extended; `normalizeHardFailureCode` for legacy alias
- [ ] Classifier refactor in `classifyCreativeRiskFailed` / `classifyBriefMatchFailed`
- [ ] `corpus-faithful-format-adaptation` fixture (`c2c12774`)
- [ ] `corpus-fixtures.ts` expected code renames + `f420bcb2` ref + `baselineVerdict` updates
- [ ] `corpus-baseline.test.ts` `BASELINE_GAP_COUNT = 0`, remove `it.fails`
- [ ] i18n `hardFailureCodes` for all GATE-01 codes including `invented_factual_entity`
- [ ] Update `creative-quality-gate.test.ts` severe vs mild generic cases

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `assertDerivationApprovable` on export routes — gate must not regress false negatives |
| V5 Input Validation | yes | Classifiers consume model-produced notes; patterns are server-side only |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Contaminated creative exported | Tampering | Hard failures block `delivery-package` / `review` |
| False negative on overload/generic | Tampering | Corpus baseline + GATE-05 positive guard |
| Parent contamination in format_adaptation | Tampering | `CONTAMINATION_FAILURE_CODES` + `assertParentFactualLineage` |

## Sources

### Primary (HIGH confidence)

- `app/src/server/ai/creative-quality-gate.ts` — classifiers, verdict [read 2026-06-15]
- `app/src/server/ai/creative-quality-taxonomy.ts` — patterns [read 2026-06-15]
- `app/src/server/ai/observable-rubric.ts` — note markers [read 2026-06-15]
- `app/src/server/ai/corpus-fixtures.ts` — archetypes + expected codes [read 2026-06-15]
- `app/tests/unit/ai/corpus-baseline.test.ts` — BASELINE_GAP_COUNT, it.fails [read + run 2026-06-15]
- `app/tests/unit/ai/creative-quality-gate.test.ts` — polish-only generic test [read 2026-06-15]
- `app/src/server/ai/factual-visual-separation.ts` — CONTAMINATION_FAILURE_CODES [read 2026-06-15]
- `.planning/phases/119-observable-rubric/119-RESEARCH.md` — Phase 120 boundary [read 2026-06-15]
- `.planning/phases/119-observable-rubric/119-04-SUMMARY.md` — baseline deferral [read 2026-06-15]
- `.planning/REQUIREMENTS.md` GATE-01–05 [read 2026-06-15]

### Secondary (MEDIUM confidence)

- `.planning/phases/117-factual-vs-visual-separation/117-RESEARCH.md` — style_reference alias decision
- `.planning/research/PITFALLS.md` — campaign_identity_drift guidance

### Tertiary (LOW confidence)

- None asserted without codebase verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield, verified paths and vitest run
- Architecture: HIGH — gate pipeline traced end-to-end
- Pitfalls: HIGH — corpus baseline run confirms 4 gaps

**Research date:** 2026-06-15
**Valid until:** 2026-07-15

## RESEARCH COMPLETE

**Phase:** 120 - Quality Gate Hardening
**Confidence:** HIGH

### Key Findings

- Four corpus archetypes remain red (`BASELINE_GAP_COUNT = 4`); only `invented_factual_entity` is green after Phase 117.
- `classifyCreativeRiskFailed` sends unmatched `creativeRisk` failures to `polishSuggestions` — root cause for overload/generic gaps.
- Phase 119 already exported `OVERLOAD_NOTE_MARKERS`, `GENERIC_TEMPLATE_NOTE_MARKERS`, `MISSING_DOMINANT_IDEA_MARKERS` for gate import.
- GATE-02 is already implemented in `deriveQualityVerdict`; Phase 120 work is expanding what becomes a hard failure.
- GATE-05 requires a new positive `c2c12774` fixture plus classifier safe-guards — no faithful fixture exists today.
- `copied_style_reference_facts` / corpus naming must align to GATE-01 `style_reference_contamination` and `campaign_identity_drift`.

### File Created

`.planning/phases/120-quality-gate-hardening/120-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new deps; patterns traced |
| Architecture | HIGH | Gate + corpus + rubric markers verified |
| Pitfalls | HIGH | Baseline test run + line-level classifier audit |

### Open Questions (RESOLVED)

- Format drift fixture: `["campaign_identity_drift"]` only (not dual with `wrong_brand`)
- Faithful c2c12774 fixture: `improvable` + empty `hardFailures` (`assertDerivationApprovable` ok)
- Restyling contamination: single `style_reference_contamination` on emit

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
