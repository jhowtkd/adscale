# Phase 118: Per-Mode Prompt Rules - Research

**Researched:** 2026-06-15
**Domain:** Creative derivation pipeline — per-mode prompt contracts (`art_variation`, `restyling`, `format_adaptation`)
**Confidence:** HIGH

## Summary

Phase 118 closes the gap between **generic MODE paragraphs** in `prompt-builder.ts` and the **behavioral contracts** required by MODE-01–05. Phases 116–117 delivered canonical creative contract, integrity injection, input classification, visual-reference transfer, and lineage guards — but corpus failures persist: decorative-only `art_variation`, restyling factual leakage (partially mitigated), and `format_adaptation` outputs that read as a different campaign. Root cause for this phase: MODE blocks still emphasize “perceptibly different” / “sibling creative” without forbidding decorative-only deltas; three-zone hierarchy is declared globally but not enforced as an `art_variation` budget; `format_adaptation` still receives flexible context (plan strategy, hooks, competitor memory) that pressures conceptual drift; cross-format identity is implied by per-aspect hints but not locked as “same narrative.”

**Primary recommendation:** Extract dedicated per-mode rule packs into `per-mode-prompt-rules.ts` (mirror `factual-visual-separation.ts`), replace the inline MODE strings in `buildDerivationPrompt`, add `extractPromptPerModeRulesSection()` for regression snapshots, implement a `format_adaptation` flexible-context firewall (demote/skip variation-oriented plan and memory blocks), and cover MODE-01–05 with Vitest assertions — **prompt + tests only**; gate promotion of `decorative_only_variation`, `missing_dominant_idea`, and `campaign_identity_drift` remains Phase 120 per ROADMAP and Phase 117 verification deferrals.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODE-01 | `art_variation` exige ideia ou mecanismo visual novo; reprova variação meramente decorativa | Add `ART_VARIATION CREATIVE MECHANISM RULE` with explicit reject list (color swap, glow, background-only, card chrome replacement) and require new composition mechanism / focal hierarchy / proof presentation; tighten creativity templates to forbid decorative-only at conservative/balanced [VERIFIED: prompt-builder.ts:437-450, 83-97; gap vs REQUIREMENTS.md MODE-01] |
| MODE-02 | `art_variation` limita orçamento visual a no máximo três zonas principais | Add `THREE-ZONE VISUAL BUDGET` block binding art_variation to canonical hook / proof-offer / CTA zones; forbid fourth competing module at equal weight; cross-ref `VISUAL_HIERARCHY CONTRACT` + `CONTENT TIERS` [VERIFIED: canonical-creative-contract.ts:26-29, prompt-builder.ts:128-136] |
| MODE-03 | `restyling` preserva entidades da base factual; extrai só atributos abstratos da referência | Consolidate MODE restyling block with Phase 117 `VISUAL REFERENCE TRANSFER RULE` + `RESTYLING FACTUAL-SOURCE RULE`; add entity checklist (people, product, offer, CTA, brand) locked to base; no factual tokens from style ref [VERIFIED: factual-visual-separation.ts:95-114, prompt-builder.ts:429-493; 117-VERIFICATION.md truths 4–6] |
| MODE-04 | `format_adaptation` = edição da mesma campanha — preserva pessoas, copy, CTA, marca, conceito; só composição/escala/agrupamento | Add `CAMPAIGN IDENTITY LOCK` + `EDIT NOT RECREATE` sections; implement flexible-context firewall skipping plan angles/hooks and demoting competitor/memory variation language for format jobs [VERIFIED: PITFALLS.md §5; prompt-builder.ts:451-464, 532-542] |
| MODE-05 | Mesma campanha reconhecível em `1:1`, `4:5`, `9:16` sem nova narrativa | Add `CROSS-FORMAT IDENTITY RULE` in format pack; extend existing per-format hints with explicit “no new story, photo, or copy”; parameterized Vitest over `1:1` / `4:5` / `9:16` contracts [VERIFIED: prompt-builder.ts:474-479; tests/unit/prompt-builder.test.ts format section] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-mode rule prose and constants | API / Backend (`per-mode-prompt-rules.ts`) | — | Single source of truth; prompt-builder wires sections |
| MODE block assembly order | API / Backend (`prompt-builder.ts`) | — | Established injection spine from Phases 116–117 |
| Format flexible-context firewall | API / Backend (`prompt-builder.ts`) | — | Demote plan/memory/competitor variation pressure before image API |
| Restyling abstract transfer | API / Backend (`factual-visual-separation.ts`) | `per-mode-prompt-rules.ts` | SEP-02 infrastructure exists; MODE-03 extends restyling MODE text only |
| Cross-format layout hints | API / Backend (`per-mode-prompt-rules.ts`) | — | Target-format parameter drives 1:1 / 4:5 / 9:16 clauses |
| Prompt regression extractors | API / Backend (`prompt-builder.ts` or `per-mode-prompt-rules.ts`) | Vitest | `extractPromptModeSection` exists; add `extractPromptPerModeRulesSection` or expand MODE extractor |
| Gate rejection of decorative drift | API / Backend (`creative-quality-gate.ts`) | — | **Deferred Phase 120** — Phase 118 delivers prompt contract only |
| Live image compliance | External (OpenAI image API) | Phase 122/123 | Prompt tests prove injection; live render validation deferred |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (existing) | project pin | Rule modules + prompt wiring | Brownfield; no new runtime deps |
| Vitest | ^4.1.9 [VERIFIED: npm registry 2026-06-15] | Per-mode prompt regression | Established Phases 115–117 |
| `prompt-builder.ts` | — | `buildDerivationPrompt` assembly | Single injection point |
| `per-mode-prompt-rules.ts` | — | **NEW** MODE rule packs + firewall helpers | Mirrors `factual-visual-separation.ts` pattern [VERIFIED: 117-RESEARCH.md structure] |
| `factual-visual-separation.ts` | — | Input classification + restyling transfer | Phase 117 — consume, do not duplicate |
| `canonical-creative-contract.ts` | — | Dominant idea, tiers, precedence | Phase 116 — art_variation budget references this |
| `prompt-builder.test-fixtures.ts` | — | Mode contracts + `derivationConfigFromContract` | Existing fixtures for all three modes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `quality-fixtures.ts` | — | Cross-mode prompt regression matrix | Extend `quality-prompt-regression.test.ts` |
| `corpus-fixtures.ts` | — | Audit archetypes (overload, format drift) | Prompt-level fixtures optional; gate flip is Phase 120 |
| `creative-qa.ts` | — | QA instructions per mode | **Phase 119** observable rubric — optional one-line cross-ref in 118, not full rewrite |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `per-mode-prompt-rules.ts` | Inline strings only in `prompt-builder.ts` | File already 700+ lines; 117 proved dedicated module + extractors scales better |
| Gate + prompt in same phase | Prompt-only in 118, gate in 120 | ROADMAP + 117-VERIFICATION defer `visual_overload`, `format_campaign_drift` gate to Phase 120 |
| Strip all flexible context for format | Demote with explicit “layout-only” labels | Full strip risks losing brand kit tone; demote + relabel is safer [ASSUMED: product wants brand kit on format jobs] |

**Installation:** None — code-only phase.

**Version verification:** `npm view vitest version` → 4.1.9 (2026-06-15).

## Architecture Patterns

### System Architecture Diagram

```
Campaign + contract + plan + memory + refs
         │
         ▼
┌─────────────────────┐
│ buildDerivation     │  HARD RULES → canonical → integrity
│ Prompt              │  → classification → allowed entities
└─────────┬───────────┘  → visual transfer (restyling)
          │              → RESTYLING FACTUAL-SOURCE (restyling)
          ▼
┌─────────────────────┐
│ buildPerModeRules   │  NEW: art_variation / restyling / format packs
│ Section (118)       │  MODE-01–05 behavioral contracts
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Flexible context    │  format_adaptation: firewall demotes variation
│ (campaign, plan,    │  art_variation: full plan + diagnosis
│  memory, brand)     │  restyling: no visualTokenBrief (117 guard)
└─────────┬───────────┘
          ▼
    OpenAI image edit/generate
          │
          ▼
    QA + gate (Phase 119–120 consume MODE outcomes)
```

### Recommended Project Structure

```
app/src/server/ai/
├── per-mode-prompt-rules.ts       # NEW: rule constants, builders, extractors, firewall
├── prompt-builder.ts              # wire per-mode section; call format firewall
├── factual-visual-separation.ts   # unchanged SEP infrastructure
├── canonical-creative-contract.ts # three-zone + tiers (referenced, not duplicated)
├── prompt-builder.test.ts         # MODE-01–05 presence + ordering tests
├── prompt-builder.test-fixtures.ts# add multi-format format_adaptation helpers if needed
└── corpus-fixtures.ts             # optional prompt-only archetype notes (gate Phase 120)

app/tests/unit/ai/
└── quality-prompt-regression.test.ts  # extend snapshots per mode
```

### Pattern 1: Dedicated Per-Mode Rule Module (MODE-01–05)

**What:** Export `buildArtVariationModeRulesSection()`, `buildRestylingModeRulesSection()`, `buildFormatAdaptationModeRulesSection(options)` returning `string[]` lines injected at current MODE position.

**When to use:** Always in `buildDerivationPrompt` after classification/allowed-entities/visual-transfer, before creativity level.

**Example:**

```typescript
// Source: Phase 118 design — follows factual-visual-separation.ts [VERIFIED: 117-RESEARCH.md Pattern 1]
export const DECORATIVE_ONLY_REJECTION = `DECORATIVE-ONLY VARIATION (REJECT):
- Changing only background color/texture, glow, gradient stack, or card chrome WITHOUT a new visual mechanism is NOT a valid art_variation.
- Valid variation requires a NEW composition mechanism: different focal hierarchy, proof presentation, subject framing, or CTA module architecture — not recoloring the same layout.`;

export function buildArtVariationModeRulesSection(): string[] {
  return [
    "",
    "MODE: art_variation — Recompose into a new artistic variation (same format/proportions).",
    DECORATIVE_ONLY_REJECTION,
    "THREE-ZONE VISUAL BUDGET: at most three main information zones (hook, proof/offer, CTA). No fourth module at equal visual weight.",
    // ... preserve mandatory tier, anti-cropping (migrate from prompt-builder.ts)
  ];
}
```

### Pattern 2: Format Adaptation Flexible-Context Firewall (MODE-04)

**What:** For `generationMode === "format_adaptation"`, skip or relabel flexible blocks that imply new creative concepts.

**When to use:** Before pushing plan / competitor / memory sections into `parts`.

**Firewall matrix:**

| Context block | art_variation | format_adaptation | restyling |
|---------------|---------------|-------------------|-----------|
| Plan strategy | include | include (factual tone only) | include |
| Plan angles/hooks | include | **omit or label “do not introduce new concepts”** | include |
| Creative diagnosis | include | **omit** (already art-only) | omit |
| Competitor analyses | include | **omit** | include |
| Campaign/brand memory | include | include with **layout-only** suffix | include |
| visualTokenBrief | include (non-format) | excluded (existing) | excluded (117) |
| Reference “recreate ad” language | variation OK | **replace with “same ad, new frame”** | N/A |

**Example:**

```typescript
// Source: PITFALLS.md §5 [VERIFIED: .planning/research/PITFALLS.md]
export function shouldIncludePlanHooksForMode(mode: GenerationMode): boolean {
  return mode !== "format_adaptation";
}
```

### Pattern 3: Cross-Format Identity Clause (MODE-05)

**What:** Shared `CROSS-FORMAT IDENTITY RULE` appended to all `format_adaptation` prompts regardless of `targetFormat`.

**When to use:** Every format_adaptation job; paired with existing 1:1 / 4:5 / 9:16 layout hints.

**Example:**

```typescript
export const CROSS_FORMAT_IDENTITY_RULE = `CROSS-FORMAT IDENTITY:
- The 1:1, 4:5, and 9:16 outputs must remain the SAME campaign: identical people, copy, CTA, brand, and dominant idea.
- Do not introduce a new narrative, new hero photo, new offer, or new concept when adapting aspect ratio.
- Only composition, scale, grouping, and safe margins may change.`;
```

### Anti-Patterns to Avoid

- **Duplicating SEP-02 in restyling:** Reference `VISUAL REFERENCE TRANSFER RULE`; extend MODE block, do not fork allowlist/denylist.
- **Gate work in 118:** `decorative_only_variation` / `campaign_identity_drift` promotion belongs in Phase 120 (GATE-01).
- **Weakening format copy preservation:** MODE-04 edits must keep `PRESERVE COPY AND FACTS VERBATIM` — tier language applies to visual prominence, not copy edits [VERIFIED: 116-RESEARCH.md Pitfall 3].
- **Stacking rules without removing conflicts:** Remove legacy “perceptibly different” if it encourages background-only swaps; replace with mechanism-first language.
- **Tests that only grep `MODE:`:** Assert new section headers (`DECORATIVE-ONLY`, `THREE-ZONE`, `CAMPAIGN IDENTITY LOCK`, `CROSS-FORMAT`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-mode prompt snapshots | Custom diff tooling | `extractPromptModeSection` + Vitest inline snapshots | Pattern from Phase 116–117 |
| Three-zone taxonomy | New tier enum | `CanonicalCreative` + `VISUAL_HIERARCHY_CONTRACT` | Already on contract |
| Restyling allowlist/denylist | Second copy | `buildVisualReferenceTransferRuleSection` | SEP-02 single source |
| Format dimension math | New resolver | `getTargetDimensions` / existing format hints | Unchanged |
| Decorative-only gate | Regex in 118 | Prompt rejection prose now; taxonomy in Phase 120 | Phase boundary |

**Key insight:** Phase 118 changes what the **model is told**; Phases 119–120 change what **QA/gate enforces**. Corpus baseline `BASELINE_GAP_COUNT = 4` should remain until Phase 120 [VERIFIED: corpus-baseline.test.ts:14, 80-82].

## Common Pitfalls

### Pitfall 1: Decorative-only passes as “perceptibly different”

**What goes wrong:** Model swaps background/glow; QA notes “generic” but no MODE violation in prompt.
**Why it happens:** `balanced` creativity template rewards composition change but allows “rebuild layout” without requiring new **mechanism**; no explicit decorative-only rejection [VERIFIED: prompt-builder.ts:91-97, 439-440].
**How to avoid:** MODE-01 `DECORATIVE_ONLY_REJECTION` + creativity template guardrail line at conservative/balanced.
**Warning signs:** Corpus `generic_template_aesthetic` and decorative previews still `acceptable` until Phase 120.

### Pitfall 2: art_variation overload despite hierarchy contract

**What goes wrong:** >3 competing zones (NR1 card grids).
**Why it happens:** `VISUAL_HIERARCHY CONTRACT` is global; art_variation MODE never states **hard budget** [VERIFIED: corpus-visual-overload fixture; PITFALLS.md §2].
**How to avoid:** MODE-02 explicit three-zone cap in art_variation pack; reference condensable/decorative yield.
**Warning signs:** `corpus-visual-overload` baseline still `acceptable`.

### Pitfall 3: format_adaptation conceptual drift from plan hooks

**What goes wrong:** 9:16 output shows different campaign narrative (education vs NR1).
**Why it happens:** Plan hooks/angles inject for all modes; `visualTokenBrief` excluded but strategy still suggests repositioning [VERIFIED: prompt-builder.ts:532-542; corpus-format-campaign-drift].
**How to avoid:** Format firewall omitting hooks/angles; `CAMPAIGN IDENTITY LOCK` citing `canonicalCreative.dominantIdea`.
**Warning signs:** `briefMatch` failures on format jobs; corpus `538246da`, `27069645`.

### Pitfall 4: Restyling MODE redundancy vs transfer rule

**What goes wrong:** Contradictory instructions between MODE and `VISUAL REFERENCE TRANSFER RULE`.
**Why it happens:** Two blocks authored separately.
**How to avoid:** Restyling MODE opens with “factual entities locked to base per INPUT SOURCE CLASSIFICATION”; defer abstract list to transfer rule.
**Warning signs:** Prompt length grows with duplicate deny lists.

### Pitfall 5: Snapshot churn on unrelated prompt edits

**What goes wrong:** Full-prompt snapshots break on campaign field changes.
**How to avoid:** Extract `extractPromptPerModeRulesSection(prompt)` bounded between `MODE:` and `\n\nCampaign:` (extend existing `extractPromptModeSection` pattern).
**Warning signs:** PRs touch snapshots outside MODE blocks.

## Code Examples

### Wire per-mode section in prompt-builder

```typescript
// Source: Phase 118 planned wiring — after Phase 117 blocks [VERIFIED: prompt-builder.ts:404-435]
import {
  buildPerModeRulesSection,
  buildFormatFlexibleContextSuffix,
} from "./per-mode-prompt-rules";

// ... after restyling factual-source / visual transfer ...
parts.push(
  ...buildPerModeRulesSection({
    generationMode,
    targetFormat,
    packageSource: config.packageSource,
    dominantIdea: effectiveContract.canonicalCreative?.dominantIdea,
  })
);

// When pushing plan for format_adaptation:
if (plan && generationMode !== "format_adaptation") {
  // existing plan hooks/angles
} else if (plan && generationMode === "format_adaptation") {
  parts.push(`\nCreative Strategy (layout tone only): ${plan.strategy}`);
  parts.push(buildFormatFlexibleContextSuffix());
}
```

### Parameterized cross-format test (MODE-05)

```typescript
// Source: existing format tests pattern [VERIFIED: tests/unit/prompt-builder.test.ts:218-246]
describe.each(["1:1", "4:5", "9:16"] as const)(
  "format_adaptation cross-format identity — %s",
  (targetFormat) => {
    it("includes CROSS-FORMAT IDENTITY and forbids new narrative", () => {
      const prompt = buildDerivationPrompt(
        derivationConfigFromContract(
          formatAdaptationCampaignAssetContractFixture({ targetFormat }),
          { targetFormat }
        )
      );
      const mode = extractPromptModeSection(prompt);
      expect(mode).toMatch(/same campaign|CROSS-FORMAT IDENTITY/i);
      expect(mode).toMatch(/no new narrative|Do not introduce a new/i);
    });
  }
);
```

## State of the Art

| Old Approach | Current Approach (post-117) | Phase 118 Adds | Impact |
|--------------|----------------------------|----------------|--------|
| Preserve-all module lists | Tier-aware mandatory/condensable/decorative | Decorative-only rejection for art_variation | Stops “same layout, new gradient” |
| Global hierarchy only | `VISUAL_HIERARCHY CONTRACT` injected | art_variation three-zone **budget** | Addresses overload archetype |
| Restyling factual rule conditional on styleAssetId | Unconditional RESTYLING FACTUAL-SOURCE + transfer rule | MODE-03 entity checklist on base | Tighter than 117 alone |
| Format = layout strings inline | Tier-aware copy verbatim + zones | Identity lock + context firewall | Reduces campaign drift |
| Single 9:16 snapshot test | Per-format layout hints | Cross-format identity clause all formats | MODE-05 testable |

**Deprecated/outdated for art_variation:**
- “Vary background, composition…” without mechanism qualifier — replace with MODE-01 language [VERIFIED: prompt-builder.ts:440].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Format jobs should retain brand kit + strategy tone, but not plan hooks/angles | Pattern 2 firewall | Over-stripping context hurts brand fidelity |
| A2 | Phase 118 does not promote `decorative_only_variation` at gate | Phase boundaries | Planner might scope gate work early |
| A3 | `1.91:1` corpus cases map to same format_adaptation rules as other aspects | MODE-05 | May need explicit 1.91:1 hint line |
| A4 | Creativity templates stay in `prompt-builder.ts` with added guardrails, not moved to new file | Standard stack | Larger diff in prompt-builder if templates move |

## Open Questions (RESOLVED)

1. **Should competitor analyses be fully omitted or relabeled for format_adaptation?**
   - What we know: PITFALLS recommends strip/demote; no product UAT on format jobs with competitor context [VERIFIED: PITFALLS.md §5].
   - **Resolution (118-03):** Fully omit competitor block for `format_adaptation` via `shouldIncludeCompetitorAnalysesForMode` returning false. No relabel fallback.

2. **Does art_variation `creativeDiagnosis.variationOpportunities` need caps for MODE-02?**
   - What we know: Diagnosis can list many opportunities; three-zone budget is prompt-level [VERIFIED: prompt-builder.ts:503-510].
   - **Resolution (118-01):** Add diagnosis suffix line “explore opportunities within three-zone budget only” in art_variation pack when diagnosis is injected.

## Environment Availability

Step 2.6: **SKIPPED** — code-only phase; no new external dependencies. Existing toolchain: Node.js, `cd app && npm test`, Vitest ^4.1.9 [VERIFIED: app/package.json].

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.9 [VERIFIED: npm registry] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODE-01 | art_variation prompt rejects decorative-only; requires new mechanism | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "decorative-only"` | ❌ Wave 0 |
| MODE-01 | Creativity template guardrail present at balanced | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "creative mechanism"` | ❌ Wave 0 |
| MODE-02 | art_variation prompt caps three information zones | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "three-zone"` | ❌ Wave 0 |
| MODE-02 | Mode section references canonical hook/proof/CTA zones | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "THREE-ZONE"` | ❌ Wave 0 |
| MODE-03 | restyling MODE + transfer rule + factual-source coherent | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts -t "restyling"` | ✅ extend |
| MODE-03 | restyling prompt lists base-locked entities | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "restyling factual entities"` | ❌ Wave 0 |
| MODE-04 | format_adaptation CAMPAIGN IDENTITY LOCK + verbatim copy | unit | `cd app && npm test -- tests/unit/prompt-builder.test.ts -t "format_adaptation"` | ✅ extend |
| MODE-04 | format_adaptation omits plan hooks/angles | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "format firewall"` | ❌ Wave 0 |
| MODE-05 | 1:1 / 4:5 / 9:16 include cross-format identity, no new narrative | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "cross-format"` | ❌ Wave 0 |
| MODE-05 | Per-mode rules after classification, before campaign fields | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "per-mode ordering"` | ✅ extend ordering tests |
| All | `quality-prompt-regression` snapshots updated | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts` | ✅ extend |
| Regression | Corpus baseline gate count unchanged (4 gaps until Phase 120) | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "baseline gap"` | ✅ exists |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts`
- **Per wave merge:** `cd app && npm test -- tests/unit/prompt-builder.test.ts tests/unit/ai/corpus-baseline.test.ts`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `app/src/server/ai/per-mode-prompt-rules.ts` — rule builders, constants, `extractPromptPerModeRulesSection`
- [ ] Wire `buildPerModeRulesSection` in `prompt-builder.ts`; migrate inline MODE strings
- [ ] Format flexible-context firewall (plan hooks/angles, competitor omit)
- [ ] Tests: MODE-01 decorative-only + mechanism requirement
- [ ] Tests: MODE-02 three-zone budget
- [ ] Tests: MODE-03 restyling entity lock (extend existing restyling suite)
- [ ] Tests: MODE-04 format firewall + identity lock
- [ ] Tests: MODE-05 `describe.each` over `1:1`, `4:5`, `9:16`
- [ ] Update `quality-prompt-regression.test.ts` inline snapshots for mode sections
- [ ] Optional: `per-mode-prompt-rules.test.ts` if prompt-builder.test.ts exceeds maintainability

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Campaign/plan strings joined as plain text; no elevation of auxiliary refs to factual |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via plan hooks | Tampering | Format firewall; hard rules precedence unchanged |
| Campaign identity drift → wrong ad exported | Spoofing | MODE-04/05 prompt locks; gate in Phase 120 |
| Style reference factual leak | Tampering | MODE-03 + Phase 117 transfer rule (do not weaken) |

## Recommended Plan Breakdown (Waves)

| Wave | Plan ID (suggested) | Scope | Requirements |
|------|---------------------|-------|--------------|
| 1 | 118-01-PLAN.md | Scaffold `per-mode-prompt-rules.ts`; art_variation pack (DECORATIVE_ONLY + THREE-ZONE); wire + extractors; MODE-01/02 tests | MODE-01, MODE-02 |
| 2 | 118-02-PLAN.md | Restyling MODE pack consolidation (entity checklist, cross-ref transfer rule); snapshot update | MODE-03 |
| 3 | 118-03-PLAN.md | Format adaptation pack (CAMPAIGN IDENTITY LOCK, CROSS-FORMAT); flexible-context firewall; reference paragraph fix for format | MODE-04, MODE-05 |
| 4 | 118-04-PLAN.md | `quality-prompt-regression` + ordering regression; document Phase 120 gate handoff; phase verification | MODE-01–05 integration |

**Dependency order:** 118-01 → 118-02 → 118-03 → 118-04 (sequential; each wave leaves tests green).

## Phase Boundaries

### In scope (Phase 118)

- MODE-01–05 prompt rule packs and injection
- Format flexible-context firewall
- Vitest prompt regression + cross-format parameterized tests
- Extractors for MODE sections
- Minor creativity-template guardrails for decorative-only rejection

### Out of scope — Phase 119 (Observable Rubric)

- RUBR-01–04 QA prompt rewrite; thumbnail hook test; “polished” ban in QA

### Out of scope — Phase 120 (Quality Gate Hardening)

- `decorative_only_variation`, `missing_dominant_idea`, `campaign_identity_drift`, `visual_overload`, `generic_template_aesthetic` hard-failure promotion
- Corpus baseline flip (`BASELINE_GAP_COUNT` → 0)
- GATE-04 corpus piece blocking

### Out of scope — Phase 122–123

- Live image generation regression; visual validation rubric ≥75/≥95

## Project Constraints (from .cursor/rules/)

- Use Context7 for library/API documentation when touching external packages [VERIFIED: context7.mdc — N/A this phase, no new deps]
- Render ephemeral filesystem — no prompt persistence to local disk beyond existing derivation provenance [VERIFIED: render-platform.mdc]
- Run tests after code changes; verify build before commit [VERIFIED: AGENTS.md]

## Sources

### Primary (HIGH confidence)

- `app/src/server/ai/prompt-builder.ts` — current MODE blocks, injection order, visualTokenBrief guards
- `app/src/server/ai/factual-visual-separation.ts` — Phase 117 SEP infrastructure
- `app/src/server/ai/canonical-creative-contract.ts` — tiers, precedence, three-zone language
- `.planning/REQUIREMENTS.md` — MODE-01–05 definitions
- `.planning/phases/117-factual-vs-visual-separation/117-RESEARCH.md` — Phase 118 deferral boundaries
- `.planning/phases/117-factual-vs-visual-separation/117-VERIFICATION.md` — deferred gate archetypes
- `.planning/research/PITFALLS.md` — decorative-only, format drift, restyling contamination
- `app/tests/unit/ai/corpus-baseline.test.ts` — baseline gap count
- npm registry — vitest 4.1.9

### Secondary (MEDIUM confidence)

- `.planning/phases/116-canonical-creative-contract/116-RESEARCH.md` — injection order, CONT-03 conflict resolution
- `.planning/ROADMAP.md` — Phase 118 success criteria

### Tertiary (LOW confidence)

- None requiring validation beyond codebase audit

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield, no new packages
- Architecture: HIGH — mirrors proven Phase 117 module pattern
- Pitfalls: HIGH — directly mapped to corpus archetypes and PITFALLS.md

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable prompt domain; gate work may shift test expectations in Phase 120)

## RESEARCH COMPLETE

**Phase:** 118 - Per-Mode Prompt Rules
**Confidence:** HIGH

### Key Findings

- MODE blocks in `prompt-builder.ts` are tier-aware from Phase 116 but lack explicit **decorative-only rejection** and **three-zone budget** for `art_variation` (MODE-01/02).
- `format_adaptation` still receives plan hooks/angles and variation-oriented reference copy — primary drift vector for MODE-04/05 (corpus `format_campaign_drift`).
- Phase 117 solved restyling infrastructure (transfer rule, visualTokenBrief guard); MODE-03 needs **MODE pack consolidation**, not duplicate SEP modules.
- New `per-mode-prompt-rules.ts` + format firewall + extractors is the lowest-risk pattern; gate promotion stays Phase 120 (`BASELINE_GAP_COUNT = 4` unchanged).

### File Created

`.planning/phases/118-per-mode-prompt-rules/118-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new deps; Vitest + existing modules verified |
| Architecture | HIGH | Phase 117 module pattern + prompt-builder spine traced in code |
| Pitfalls | HIGH | Mapped to corpus fixtures and PITFALLS.md with file references |

### Open Questions (RESOLVED)

- Competitor block: **omit** for format_adaptation (118-03 `shouldIncludeCompetitorAnalysesForMode`).
- Diagnosis three-zone cap: **suffix line** in art_variation pack (118-01).
- Whether `1.91:1` needs explicit hint line alongside 1:1/4:5/9:16 — deferred; MODE-05 tests cover 1:1/4:5/9:16 only.

### Ready for Planning

Research complete. Planner can create `118-01` through `118-04` PLAN.md files.
