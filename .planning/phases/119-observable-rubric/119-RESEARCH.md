# Phase 119: Observable Rubric - Research

**Researched:** 2026-06-15
**Domain:** Creative QA/scoring rubric prompts — observable visual defects vs subjective polish
**Confidence:** HIGH

## Summary

Phase 119 closes the **evaluation gap** between generation prompts (Phases 116–118) and gate enforcement (Phase 120). The derivation pipeline already injects `VISUAL_HIERARCHY CONTRACT`, three-zone budgets, and anti-template tropes into **generation** prompts, but **QA and score prompts** still evaluate like a lenient export copilot: `buildCreativeQaPrompt` tells the model *"Export must remain allowed"* and `classifyCreativeRiskFailed` routes generic/subjective `creativeRisk` notes to `polishSuggestions` unless they match factual regex patterns [VERIFIED: `creative-qa.ts:140`, `creative-quality-gate.ts:155-184`, `creative-quality-gate.test.ts:136-148`]. Corpus archetypes `visual_overload` and `generic_template_aesthetic` already define the **desired QA notes** in `corpus-fixtures.ts`, but the gate does not promote them until Phase 120 — Phase 119 makes the **vision rubric** instruct the model to produce those observable failures consistently.

**Primary recommendation:** Add `observable-rubric.ts` (mirror `factual-visual-separation.ts` / `per-mode-prompt-rules.ts`) exporting shared rubric blocks; inject into `buildCreativeQaPrompt` and a newly extracted `buildCreativeScorePrompt`; remove export-softening bias; require defect notes that cite **visible elements** (zones, text snippets, colors, positions); add thumbnail/preview-scale hook legibility (RUBR-04) using `getTargetDimensions(format, true)` (~270×270 for 1:1 preview) [VERIFIED: `formats.ts:70-78`, FIXT-03]. **Do not** add gate hard-failure codes or flip `BASELINE_GAP_COUNT` — that is Phase 120.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUBR-01 | Reprova overload: sem ponto focal dominante, >3 zonas concorrentes, múltiplos CTAs competindo com hook | `VISUAL_OVERLOAD_RUBRIC` in `observable-rubric.ts`; map to `creativeRisk` + `briefMatch` failed with zone-count language; align note exemplars with `corpus-visual-overload` fixture [VERIFIED: `corpus-fixtures.ts:150-155`] |
| RUBR-02 | Reprova estética template genérica severa (neon/glow/cards premium sem justificativa) | `GENERIC_TEMPLATE_RUBRIC` reusing tropes from `VISUAL_HIERARCHY_CONTRACT` [VERIFIED: `prompt-builder.ts:147`]; campaign/brand justification clause; align with `corpus-generic-template-aesthetic` [VERIFIED: `corpus-fixtures.ts:169-174`] |
| RUBR-03 | Defeitos explicados por elementos visíveis — não "polished"/"professional" como aprovação isolada | `OBSERVABLE_DEFECT_NOTE_RULE` + `FORBIDDEN_APPROVAL_TERMS`; remove/narrow QA export-softening line; score prompt parity; exemplar good/bad notes in module |
| RUBR-04 | Hook compreensível em miniatura (preview scale) | `THUMBNAIL_HOOK_RUBRIC` with preview dimensions from contract format; primary criterion `legibility`; cross-ref generation `THUMBNAIL LEGIBILITY RULE` [VERIFIED: `per-mode-prompt-rules.ts:45`] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Observable rubric prose and constants | API / Backend (`observable-rubric.ts`) | — | Single source for QA + score prompts; Phase 120 imports note patterns |
| QA prompt assembly | API / Backend (`creative-qa.ts`) | `observable-rubric.ts` | `buildCreativeQaPrompt` wires rubric sections |
| Score prompt assembly | API / Backend (`creative-score.ts`) | `observable-rubric.ts` | Extract `buildCreativeScorePrompt` from inline string for testability |
| Gate hard-failure promotion | API / Backend (`creative-quality-gate.ts`) | — | **Deferred Phase 120** — Phase 119 changes rubric only |
| Taxonomy regex patterns | API / Backend (`creative-quality-taxonomy.ts`) | — | **Deferred Phase 120** — optional forward-reference constants in rubric module only |
| Thumbnail dimension math | API / Backend (`formats.ts`) | `observable-rubric.ts` | Reuse `getTargetDimensions(format, true)` — do not duplicate |
| Live vision compliance | External (OpenAI vision API) | Phases 122–123 | Prompt tests prove injection; pixel thumbnail test deferred to Phase 122 (TEST-04) |
| Corpus baseline gate flip | Vitest (`corpus-baseline.test.ts`) | — | **Unchanged in 119** — `BASELINE_GAP_COUNT = 4` until Phase 120 [VERIFIED: `corpus-baseline.test.ts:14,80-82`] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (existing) | project pin | Rubric module + prompt wiring | Brownfield; no new runtime deps |
| Vitest | ^4.1.9 [VERIFIED: npm registry 2026-06-15] | Rubric prompt regression | Established Phases 115–118 |
| `observable-rubric.ts` | — | **NEW** shared rubric constants + builders | Mirrors `factual-visual-separation.ts` pattern [VERIFIED: Phase 117–118 module layout] |
| `creative-qa.ts` | — | `buildCreativeQaPrompt` | Vision QA entry point |
| `creative-score.ts` | — | Score vision prompt (extract builder) | Parity with QA rubric |
| `creative-quality-taxonomy.ts` | — | Criterion IDs + existing patterns | Extend in Phase 120, not 119 |
| `corpus-fixtures.ts` | — | Archetype note exemplars | Rubric tests assert prompt enables corpus notes |
| `formats.ts` | — | Preview dimensions | RUBR-04 thumbnail scale |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `canonical-creative-contract.ts` | — | `dominantIdea`, hook, tiers | Inject into rubric when contract present |
| `creative-corpus.ts` | — | `allowedEntities`, `renderTier` | briefMatch + preview-tier hints |
| `per-mode-prompt-rules.ts` | — | Generation thumbnail rule | Cross-reference in rubric, do not duplicate prose |
| `creative-qa.test.ts` | — | QA prompt unit tests | Extend for rubric sections |
| `creative-score.test.ts` | — | Score prompt tests | Add after `buildCreativeScorePrompt` extraction |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `observable-rubric.ts` | Inline strings in `creative-qa.ts` only | Score prompt diverges; Phase 120 pattern import needs one module |
| New QA criteria (`visualHierarchy`) | Reuse `creativeRisk` + `legibility` | Taxonomy/gate schema change is Phase 120+ scope; rubric maps defects to existing criteria |
| Gate + rubric in same phase | Rubric-only in 119, gate in 120 | ROADMAP + 118-VERIFICATION deferral boundaries [VERIFIED: `118-RESEARCH.md` Phase Boundaries] |
| Pixel-downscale thumbnail test in 119 | Prompt-only thumbnail rubric | TEST-04 is Phase 122; 119 delivers rubric language only |

**Installation:** None — code-only phase.

**Version verification:** `npm view vitest version` → 4.1.9 (2026-06-15); `app/package.json` pins `^4.1.5`.

## Architecture Patterns

### System Architecture Diagram

```
Derivation image + contract + campaign context
         │
         ├──────────────────────────────┐
         ▼                              ▼
┌─────────────────────┐        ┌─────────────────────┐
│ buildCreativeQa     │        │ buildCreativeScore  │
│ Prompt (119)        │        │ Prompt (119)        │
│ + observable rubric │        │ + observable rubric │
└─────────┬───────────┘        └─────────┬───────────┘
          │                              │
          ▼                              ▼
   OpenAI vision QA JSON            OpenAI vision score JSON
          │                              │
          └──────────────┬───────────────┘
                         ▼
              ┌─────────────────────┐
              │ classifyCreative    │  Phase 120: promote overload/
              │ QualityGate         │  generic/missing_idea codes
              └─────────────────────┘
```

### Recommended Project Structure

```
app/src/server/ai/
├── observable-rubric.ts           # NEW: rubric constants, builders, extractors
├── creative-qa.ts                 # wire buildObservableQaRubricSection
├── creative-score.ts              # extract buildCreativeScorePrompt; wire rubric
├── creative-quality-taxonomy.ts   # unchanged in 119 (patterns in 120)
├── corpus-fixtures.ts             # note exemplars — reference, don't duplicate
└── formats.ts                     # getTargetDimensions for preview scale

app/src/server/ai/creative-qa.test.ts
app/tests/unit/ai/
├── quality-rubric-regression.test.ts  # NEW: rubric × corpus archetypes
├── corpus-baseline.test.ts            # unchanged gap count (4)
└── creative-quality-gate.test.ts      # unchanged generic→polish until 120
```

### Pattern 1: Dedicated Observable Rubric Module

**What:** Export rubric sections and `buildObservableQaRubricSection(options)` / `buildObservableScoreRubricSection(options)` returning `string[]` or joined blocks.

**When to use:** Always appended inside QA and score user prompts after campaign context, before locale line.

**Example:**

```typescript
// Source: Phase 119 design — follows per-mode-prompt-rules.ts [VERIFIED: 118-RESEARCH.md Pattern 1]
export const OBSERVABLE_DEFECT_NOTE_RULE = `OBSERVABLE DEFECT NOTES (required for every failed/warning criterion):
- Cite VISIBLE evidence: named zones (hook headline, offer card, CTA button), exact text snippets, colors, positions (top-left badge row), or counts (four equal-weight modules).
- Do NOT approve or excuse with vague praise alone: "polished", "professional", "premium feel", "high quality", "well designed" without citing what is wrong.
- A high-production look does NOT override hierarchy overload, missing dominant idea, or illegible hook at thumbnail scale.`;

export const VISUAL_OVERLOAD_RUBRIC = `VISUAL OVERLOAD (fail creativeRisk or briefMatch when ANY apply):
- No single dominant focal point — hook/headline does not clearly win attention.
- More than three information zones compete at similar visual weight (e.g. card grid + badge row + secondary CTA + icon strip).
- Multiple CTAs or button-like modules compete with the primary hook for attention.
- Mark failed and name the competing zones/modules observed.`;

export const GENERIC_TEMPLATE_RUBRIC = `GENERIC TEMPLATE AESTHETIC (fail creativeRisk when severe AND unjustified):
- Severe AI-template signals: neon glow stacks, holographic grids, glassmorphism cards, excessive lens flares, volumetric CTA pills, "premium tech" gradient stacks.
- Fail when these tropes dominate AND are not justified by the campaign brief, brand kit, or source creative.
- Pass only if tropes are faithful to an existing brand system — state which brand element justifies them.`;

export const THUMBNAIL_HOOK_RUBRIC = `THUMBNAIL / PREVIEW SCALE (fail legibility when hook unclear):
- Mentally evaluate at mobile feed thumbnail size (~25% scale; for this format preview ≈ {width}×{height}px).
- Primary hook/headline must remain identifiable (readable or unmistakably dominant visually) at that scale.
- Fail if hook merges into background, shrinks below readable size, or loses to decorative chrome at thumbnail scale.`;
```

### Pattern 2: Criterion Mapping (RUBR-01–04 → existing taxonomy)

**What:** Map new rubric failures onto existing `CreativeQaCriterion` keys — no schema migration in 119.

| Rubric concern | Primary criterion | Secondary | Checklist status when violated |
|----------------|-------------------|-----------|-------------------------------|
| Visual overload / missing dominant idea | `creativeRisk` | `briefMatch` (no dominant campaign idea) | `failed` |
| Generic template aesthetic (severe) | `creativeRisk` | — | `failed` |
| Hook illegible at thumbnail | `legibility` | `creativeRisk` if clutter causes illegibility | `failed` |
| Competing CTAs | `ctaOffer` or `creativeRisk` | — | `failed` |
| Observable note quality | all criteria | — | notes must cite visible elements (RUBR-03) |

**When to use:** Document in rubric module header; QA prompt lists mapping explicitly so model output stays gate-compatible.

### Pattern 3: Remove Export-Softening Bias (RUBR-03)

**What:** Replace `Export must remain allowed. Use warning or review to guide the user, not to block them.` with integrity-first language.

**When to use:** `buildCreativeQaPrompt` only (score prompt has no equivalent line today).

**Replacement guidance:**

```typescript
// Remove [VERIFIED: creative-qa.ts:140]:
// "Export must remain allowed..."

// Replace with:
`Evaluate honestly against the rubric below. Use status "failed" on checklist criteria when observable defects are present — especially visual overload, unjustified generic template aesthetics, or hook illegibility at thumbnail scale.
Overall QA status may be "review" when multiple warnings exist; do not mark "ready" if any criterion is "failed".`
```

**Note:** Gate blocking still happens in Phase 120 when classifiers promote rubric failures; 119 only fixes what the vision model is **asked** to report.

### Pattern 4: Score Prompt Parity

**What:** Extract `buildCreativeScorePrompt(input)` from `analyzeDerivationCreative`; inject same observable rubric blocks; tighten `visualQuality` dimension instructions.

**When to use:** Always — prevents QA/score divergence (root cause from FEATURES.md).

**Score-specific additions:**

```typescript
// Extend visualQuality (creativeRisk) scoring lines:
`- visualQuality: penalize below 50 for severe generic template aesthetic or visual overload regardless of polish.
- Do NOT score visualQuality above 70 when hook is illegible at thumbnail scale.
- scoreIssues must cite visible elements (same OBSERVABLE DEFECT NOTE RULE).`
```

### Anti-Patterns to Avoid

- **Gate promotion in 119:** Adding `visual_overload` / `generic_template_aesthetic` to `CreativeHardFailureCode` or changing `classifyCreativeRiskFailed` — Phase 120 [VERIFIED: ROADMAP Phase 120 GATE-01].
- **Flipping corpus baseline tests:** `corpus-baseline.test.ts` `it.fails` cases must stay red until Phase 120 greens them.
- **New checklist keys:** Adding `visualHierarchy` to `CREATIVE_QA_CORE_CRITERIA` breaks normalizers and UI — use existing criteria.
- **Subjective approval terms in rubric examples:** Don't use "polished" as pass exemplar in tests or module comments.
- **Duplicating tropes list:** Import or copy-once from `VISUAL_HIERARCHY_CONTRACT` line in `prompt-builder.ts` — single trope vocabulary.
- **Updating `creative-quality-gate.test.ts` generic→hard expectation:** That test documents **current** gate; update in Phase 120 only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preview dimension calculation | Custom 270×270 constants | `getTargetDimensions(formatId, true)` | FIXT-03 single source; scales per format [VERIFIED: `formats.ts:70-78`] |
| Corpus archetype QA JSON | New fixture file | `corpus-fixtures.ts` `rawQaModelOutput` | Already models desired notes |
| Gate regex for overload/generic | New classifier in 119 | Note exemplars + `OBSERVABLE_NOTE_MARKERS` export for 120 | Phase boundary |
| Separate QA taxonomy enum | New criterion types | Map to `creativeRisk` / `legibility` / `briefMatch` | Avoids normalizer/UI churn |
| Vision thumbnail simulation | Image resize pipeline in 119 | Rubric instructs mental thumbnail evaluation | TEST-04 / Phase 122 for automated thumbnail |
| Full prompt snapshots | Brittle full-string diffs | `extractObservableRubricSection(prompt)` bounded extractor | Pattern from Phase 118 `extractPromptPerModeRulesSection` |

**Key insight:** Phase 119 changes **what the vision model reports**; Phase 120 changes **what the gate blocks**. Corpus fixtures already encode the target notes — 119 aligns prompts to produce them.

## Common Pitfalls

### Pitfall 1: Rubric changes without removing export-softening

**What goes wrong:** Model still marks overload as `warning` because QA system prompt prioritizes export availability.

**Why it happens:** `buildCreativeQaPrompt` line 140 [VERIFIED: `creative-qa.ts:140`]; FEATURES.md anti-feature.

**How to avoid:** Remove/replace export line; require `failed` for rubric violations; add regression test `expect(prompt).not.toContain("Export must remain allowed")`.

**Warning signs:** `creative-qa.test.ts` still passes with old soft language.

### Pitfall 2: QA/score rubric drift

**What goes wrong:** QA flags generic template; score gives `visualQuality: 90`.

**Why it happens:** Score prompt lacks observable rubric; only QA updated.

**How to avoid:** Single `observable-rubric.ts` imported by both builders; shared regression test file.

**Warning signs:** `buildCreativeScorePrompt` missing `GENERIC_TEMPLATE_RUBRIC`.

### Pitfall 3: Vague defect notes persist

**What goes wrong:** Notes say "feels generic" without citing neon card stack — Phase 120 regex cannot promote.

**Why it happens:** No `OBSERVABLE_DEFECT_NOTE_RULE` with good/bad exemplars.

**How to avoid:** Rubric module includes BAD: `"Generic visual."` GOOD: `"Four equal-weight glass cards in center grid compete with headline; neon cyan glow on CTA pill."`; test asserts rule present.

**Warning signs:** Corpus fixture notes richer than live model output.

### Pitfall 4: Thumbnail rubric uses wrong scale

**What goes wrong:** Rubric says "320px" inconsistently or omits format-specific preview size.

**Why it happens:** PITFALLS.md mentions 320px [ASSUMED: approximate]; codebase uses `dimensions/4` [VERIFIED: `formats.ts`].

**How to avoid:** `buildThumbnailHookRubricLine(targetFormat)` calls `getTargetDimensions(targetFormat, true)`.

**Warning signs:** Hardcoded 270 in rubric without format parameter.

### Pitfall 5: Accidental gate work breaks baseline suite

**What goes wrong:** Developer promotes `creativeRisk` generic notes to hard failure in 119; `corpus-baseline` greens early; Phase 120 scope collapses.

**How to avoid:** Phase plan explicitly forbids edits to `classifyCreativeRiskFailed` overload/generic branches; keep `BASELINE_GAP_COUNT = 4`.

**Warning signs:** `creative-quality-gate.ts` diff in 119 PR.

## Code Examples

### Wire rubric into QA prompt

```typescript
// Source: Phase 119 planned wiring [VERIFIED: creative-qa.ts structure]
import {
  buildObservableQaRubricSection,
} from "./observable-rubric";

export function buildCreativeQaPrompt(input: Omit<AnalyzeCreativeQaInput, "imageBuffer" | "mimeType">) {
  // ... existing campaign/derivation/styleFidelity/allowedEntities blocks ...
  const rubric = buildObservableQaRubricSection({
    generationMode: input.contract?.generationMode ?? input.derivation.generationMode,
    targetFormat: input.derivation.format ?? input.contract?.targetFormat,
    dominantIdea: input.contract?.canonicalCreative?.dominantIdea,
    renderTier: input.contract?.renderTier, // if available on contract path
  });

  return `Review this final ad creative before export.
Return only JSON with status, checklist, issues, and suggestions.
...
${rubric}
Locale for user-facing notes: ${input.locale}.`;
}
```

### Extract score prompt for tests

```typescript
// Source: Phase 119 — mirror buildCreativeQaPrompt [VERIFIED: creative-score.ts:243-281 inline today]
export function buildCreativeScorePrompt(input: AnalyzeInput): string {
  const rubric = buildObservableScoreRubricSection({
    generationMode: input.contract?.generationMode ?? input.derivation.generationMode,
    targetFormat: input.derivation.format ?? input.contract?.targetFormat,
  });
  return `Evaluate the generated ad as a reviewer...
${rubric}`;
}

export async function analyzeDerivationCreative(input: AnalyzeInput): Promise<ScoreResult> {
  const prompt = buildCreativeScorePrompt(input);
  // ... existing OpenAI call using prompt ...
}
```

### Corpus-aligned rubric regression test

```typescript
// Source: corpus-fixtures + quality-prompt-regression pattern [VERIFIED: Phase 118 tests]
import { CORPUS_ARCHETYPE_FIXTURES } from "@/server/ai/corpus-fixtures";
import { buildCreativeQaPrompt } from "@/server/ai/creative-qa";
import { extractObservableRubricSection } from "@/server/ai/observable-rubric";

describe.each(CORPUS_ARCHETYPE_FIXTURES)("observable rubric — $archetype", (fixture) => {
  it("QA prompt includes overload/generic/thumbnail rules", () => {
    const prompt = buildCreativeQaPrompt({
      locale: "pt-BR",
      campaign: { name: "Test", client: fixture.contract.client, /* ... */ },
      derivation: {
        ctaText: "CTA",
        format: fixture.contract.targetFormat,
        generationMode: fixture.contract.generationMode,
      },
      contract: fixture.contract,
    });
    const rubric = extractObservableRubricSection(prompt);
    expect(rubric).toMatch(/OBSERVABLE DEFECT NOTES/i);
    expect(rubric).toMatch(/VISUAL OVERLOAD/i);
    expect(rubric).toMatch(/GENERIC TEMPLATE/i);
    expect(rubric).toMatch(/THUMBNAIL|PREVIEW SCALE/i);
    expect(prompt).not.toMatch(/Export must remain allowed/i);
  });
});
```

### Forward-reference note markers for Phase 120

```typescript
// Export from observable-rubric.ts — consumed by Phase 120 taxonomy patterns
export const OVERLOAD_NOTE_MARKERS =
  /competing (?:zones|modules)|more than three|fourth module|equal visual weight|card grid dominates|no (?:single )?dominant focal/i;

export const GENERIC_TEMPLATE_NOTE_MARKERS =
  /generic (?:premium|tech|template)|neon glow|glassmorphism|holographic|volumetric CTA|premium-tech gradient/i;

export const MISSING_DOMINANT_IDEA_MARKERS =
  /no (?:NR1|campaign-specific|dominant) (?:visual )?idea|no campaign-specific visual idea/i;
```

## State of the Art

| Old Approach | Current (post-118) | Phase 119 Adds | Impact |
|--------------|-------------------|----------------|--------|
| QA export copilot | "Export must remain allowed" | Integrity-first failed criteria | Model can report blocking defects |
| Generic → polish only | `classifyCreativeRiskFailed` pushes subjective notes to polish | Rubric requires `creativeRisk: failed` with observable notes | Phase 120 can promote via regex |
| Hierarchy only in generation prompt | `VISUAL_HIERARCHY CONTRACT` in derivation | Same vocabulary in QA/score rubric | Evaluator aligned with generator |
| Subjective score visualQuality | "polish cannot hide contract violations" (partial) | Observable rubric + visualQuality caps in prompt | Scores match QA honesty |
| Thumbnail rule generation-only | `THUMBNAIL LEGIBILITY RULE` in art_variation pack | QA/score thumbnail hook check | RUBR-04 closed in evaluation path |
| Inline score prompt | String inside `analyzeDerivationCreative` | `buildCreativeScorePrompt` + tests | Prevents drift |

**Deprecated/outdated for evaluation path:**
- `"Export must remain allowed"` in QA prompt [VERIFIED: `creative-qa.ts:140`]
- Using `"Generic visual."` as acceptable warning exemplar in tests without observable counterpart [VERIFIED: `creative-qa.test.ts:22`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existing criteria (`creativeRisk`, `legibility`, `briefMatch`) suffice — no new checklist keys | Pattern 2 | Product may want dedicated `visualHierarchy` criterion later |
| A2 | `canonicalCreative` on contract path is available for dominant-idea rubric injection | Pattern 1 | May need to resolve via `resolveCanonicalCreative()` at call site |
| A3 | Preview scale = `getTargetDimensions(format, true)` (÷4) satisfies RUBR-04 "miniatura" | Pattern 1 | Product may want fixed 270×270 wording only for 1:1 |
| A4 | Phase 119 does not change `normalizeCreativeQaResult` fallback behavior | Pitfall 1 | Failed criteria with empty notes still get FALLBACK_NOTE |
| A5 | `renderTier` may not be on `CreativeContract` today — rubric uses format-based preview dims | Code Examples | May need optional `renderTier` param from derivation job context |

## Open Questions

1. **Should overall QA `status` become `failed` when any checklist criterion fails?**
   - What we know: Today `CreativeQaStatus` is `ready|warning|review` — no `failed` top-level [VERIFIED: `creative-qa.ts:12`].
   - What's unclear: Whether UI expects top-level `failed`.
   - Recommendation: Keep top-level status enum; rely on checklist `failed` + gate Phase 120. Document in plan.

2. **Should `briefMatch` or `creativeRisk` own "missing dominant idea"?**
   - What we know: Corpus overload uses `creativeRisk`; format drift uses `briefMatch` [VERIFIED: `corpus-fixtures.ts`].
   - Recommendation: Primary `creativeRisk` for hierarchy; `briefMatch` when campaign idea/narrative absent — document both in rubric.

3. **Does score prompt need `allowedEntities` parity with QA?**
   - What we know: QA already injects allowed entities for `briefMatch` [VERIFIED: `creative-qa.ts:125-131`].
   - Recommendation: Add same block to score prompt in 119 for factual parity (small diff).

## Environment Availability

Step 2.6: **SKIPPED** — code-only phase; no new external dependencies. Existing toolchain: Node.js, `cd app && npm test`, Vitest ^4.1.9 [VERIFIED: `app/package.json`].

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.9 [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/quality-rubric-regression.test.ts tests/unit/ai/creative-score.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RUBR-01 | QA prompt includes visual overload rubric (dominant focal, ≤3 zones, competing CTAs) | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "visual overload"` | ❌ Wave 0 |
| RUBR-01 | Score prompt penalizes overload in visualQuality guidance | unit | `cd app && npm test -- tests/unit/ai/creative-score.test.ts -t "overload"` | ❌ Wave 0 |
| RUBR-02 | QA/score prompts include generic template rubric with trope list | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "generic template"` | ❌ Wave 0 |
| RUBR-03 | QA prompt removes "Export must remain allowed" | unit | `cd app && npm test -- src/server/ai/creative-qa.test.ts -t "export must remain"` | ❌ Wave 0 |
| RUBR-03 | Rubric forbids polished/professional-only approval | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "observable defect"` | ❌ Wave 0 |
| RUBR-04 | QA prompt includes thumbnail/preview scale with format-derived dimensions | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "thumbnail"` | ❌ Wave 0 |
| RUBR-04 | 1:1 preview rubric cites ~270×270 | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts -t "270"` | ❌ Wave 0 |
| All | Corpus archetype fixtures — rubric enables expected note vocabulary | unit | `cd app && npm test -- tests/unit/ai/quality-rubric-regression.test.ts` | ❌ Wave 0 |
| Regression | `BASELINE_GAP_COUNT` still 4 (no gate promotion) | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "baseline gap"` | ✅ exists |
| Regression | Generic creativeRisk still polish-only at gate | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "polish only"` | ✅ exists |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- src/server/ai/creative-qa.test.ts tests/unit/ai/quality-rubric-regression.test.ts tests/unit/ai/creative-score.test.ts`
- **Per wave merge:** `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts tests/unit/ai/creative-quality-gate.test.ts`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `app/src/server/ai/observable-rubric.ts` — constants, builders, `extractObservableRubricSection`, note markers for 120
- [ ] Wire `buildObservableQaRubricSection` in `creative-qa.ts`; remove export-softening line
- [ ] Extract `buildCreativeScorePrompt` in `creative-score.ts`; wire score rubric
- [ ] `app/tests/unit/ai/quality-rubric-regression.test.ts` — corpus archetype × rubric presence
- [ ] Extend `creative-qa.test.ts` — no export-softening; observable sections present
- [ ] Extend `creative-score.test.ts` — score prompt rubric parity
- [ ] Optional: `allowedEntities` block in score prompt (parity with QA)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Campaign/contract strings joined as plain text in prompts; no new user input surface |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| QA prompt injection via campaign fields | Tampering | Existing string interpolation; no elevation of untrusted text to system role |
| False negative on overload/generic → wrongful export | Tampering | Phase 120 gate promotion; 119 honest rubric reporting |
| Vision model bypass | Repudiation | Gate + regression fixtures; not solved by rubric alone |

## Recommended Plan Breakdown (Waves)

| Wave | Plan ID (suggested) | Scope | Requirements |
|------|---------------------|-------|--------------|
| 1 | 119-01-PLAN.md | Scaffold `observable-rubric.ts`; overload + generic + observable-note + thumbnail builders; extractors | RUBR-01, RUBR-02, RUBR-03, RUBR-04 |
| 2 | 119-02-PLAN.md | Wire QA prompt; remove export-softening; `creative-qa.test.ts` | RUBR-01–04 |
| 3 | 119-03-PLAN.md | Extract `buildCreativeScorePrompt`; wire score rubric; `creative-score.test.ts` | RUBR-01–04 |
| 4 | 119-04-PLAN.md | `quality-rubric-regression.test.ts` × corpus archetypes; verify baseline gap unchanged; phase verification | RUBR-01–04 integration |

**Dependency order:** 119-01 → 119-02 → 119-03 → 119-04 (sequential; tests green each wave).

## Phase Boundaries

### In scope (Phase 119)

- RUBR-01–04 observable rubric in QA + score vision prompts
- `observable-rubric.ts` module + extractors + forward-reference note markers
- Remove QA export-softening bias; forbid vague approval terms in rubric
- Thumbnail/preview-scale hook evaluation (prompt-level)
- Vitest rubric regression; corpus archetype vocabulary alignment
- Optional: `allowedEntities` in score prompt

### Out of scope — Phase 120 (Quality Gate Hardening)

- `visual_overload`, `generic_template_aesthetic`, `missing_dominant_idea`, `decorative_only_variation` hard-failure codes
- `classifyCreativeRiskFailed` / taxonomy regex promotion
- `BASELINE_GAP_COUNT` flip (4 → 0)
- GATE-04 corpus piece blocking
- Updating `creative-quality-gate.test.ts` generic→hard expectation

### Out of scope — Phase 121 (Score Ceilings)

- Numeric score caps (≤55 overload, etc.)
- `qualityScore` clamping in code

### Out of scope — Phase 122 (Regression Suite)

- TEST-04 automated pixel thumbnail downscale test
- Full prompt+QA+gate matrix expansion

### Out of scope — Phase 123 (Visual Validation)

- Live corpus re-score ≥75/≥95
- Controlled generation before/after

## Project Constraints (from .cursor/rules/)

- Use Context7 for library/API documentation when touching external packages [VERIFIED: context7.mdc — N/A; no new deps]
- Render ephemeral filesystem — no new local persistence for rubric [VERIFIED: render-platform.mdc]
- Run tests after code changes; verify build before commit [VERIFIED: AGENTS.md / workspace rules]

## Sources

### Primary (HIGH confidence)

- `app/src/server/ai/creative-qa.ts` — current QA prompt, export-softening, allowedEntities
- `app/src/server/ai/creative-score.ts` — score prompt, visualQuality/polish language
- `app/src/server/ai/creative-quality-gate.ts` — `classifyCreativeRiskFailed` polish routing
- `app/src/server/ai/creative-quality-taxonomy.ts` — criterion IDs, existing patterns
- `app/src/server/ai/corpus-fixtures.ts` — archetype QA note exemplars
- `app/src/server/ai/prompt-builder.ts` — `VISUAL_HIERARCHY_CONTRACT` tropes
- `app/src/server/ai/per-mode-prompt-rules.ts` — `THUMBNAIL LEGIBILITY RULE`
- `app/src/lib/formats.ts` — `getTargetDimensions(..., true)` preview math
- `.planning/REQUIREMENTS.md` — RUBR-01–04
- `.planning/phases/118-per-mode-prompt-rules/118-RESEARCH.md` — Phase 119 deferral boundary
- `.planning/phases/118-per-mode-prompt-rules/118-VERIFICATION.md` — gate deferred to 120
- `.planning/research/PITFALLS.md` — overload, generic polish, thumbnail detection
- `.planning/research/FEATURES.md` — observable rubric category map
- `app/tests/unit/ai/corpus-baseline.test.ts` — `BASELINE_GAP_COUNT = 4`
- npm registry — vitest 4.1.9

### Secondary (MEDIUM confidence)

- `.planning/phases/115-corpus-fixtures-and-audit-baseline/115-RESEARCH.md` — preview vs final tiers
- `.planning/ROADMAP.md` — Phase 119 success criteria

### Tertiary (LOW confidence)

- PITFALLS.md "320px width" thumbnail — superseded by codebase `dimensions/4` [ASSUMED: use formats.ts as source of truth]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield, no new packages; module pattern proven in 117–118
- Architecture: HIGH — QA/score/gate separation traced in code; phase boundaries explicit in ROADMAP
- Pitfalls: HIGH — mapped to PITFALLS.md, corpus fixtures, and existing gate tests

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable prompt domain; gate changes in Phase 120 may shift test expectations)

## RESEARCH COMPLETE

**Phase:** 119 - Observable Rubric
**Confidence:** HIGH

### Key Findings

- QA prompt still says **"Export must remain allowed"** — directly conflicts with RUBR-03 and causes generic/overload to surface as warnings, not honest `failed` checklist items.
- Corpus fixtures already model correct **observable notes** for `visual_overload` and `generic_template_aesthetic`; gate does not block them until Phase 120 — Phase 119 aligns vision **rubric prompts** to elicit those notes.
- Reuse existing criteria (`creativeRisk`, `legibility`, `briefMatch`) — no taxonomy schema change in 119.
- New `observable-rubric.ts` + `buildCreativeScorePrompt` extraction is the lowest-risk pattern; `BASELINE_GAP_COUNT = 4` must remain until Phase 120.

### File Created

`.planning/phases/119-observable-rubric/119-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new deps; Vitest + existing modules verified |
| Architecture | HIGH | QA/score/gate flow traced; 118 deferral boundaries confirmed |
| Pitfalls | HIGH | PITFALLS.md + corpus-baseline + gate test document current behavior |

### Open Questions

- Top-level QA `status: failed` vs checklist-only `failed` — recommend checklist-only unless UI audit says otherwise.
- `briefMatch` vs `creativeRisk` for missing dominant idea — document both in rubric.
- `renderTier` on contract for preview-specific rubric emphasis — optional enhancement.

### Ready for Planning

Research complete. Planner can create `119-01` through `119-04` PLAN.md files.
