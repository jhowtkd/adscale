# Phase 116: Canonical Creative Contract — Research

**Researched:** 2026-06-15
**Domain:** Creative derivation prompt contract — hierarchy, factual precedence, integrity injection
**Phase requirements:** CONT-01, CONT-02, CONT-03, CONT-04
**Confidence:** HIGH

## Summary

Phase 116 closes the root cause identified in the June 2026 audit: integrity rules exist as dead constants in `prompt-builder.ts` but never reach the image model, while mode blocks simultaneously demand literal preservation of every module and (in unwired text) allow hierarchy simplification. The fix is not a new pipeline — it extends the existing `CreativeContract` spine (`creative-contract.ts`), adds a canonical prompt section builder, wires `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` into every applicable derivation prompt, and resolves preserve-all vs hierarchy conflicts via an explicit precedence block.

The current `CreativeContract` (v11.1) carries mode, format, CTA semantics, asset IDs, and campaign fields — but not dominant idea, three-zone hierarchy, or content tiers. `buildDerivationPrompt` already consumes `contract` for CTA hard rules and restyling factual-source rules; Phase 116 should add contract-backed canonical fields and a shared `buildCanonicalContractPromptSection()` used by prompt assembly, with extractors for regression tests. Factual/visual input classification (SEP-*), per-mode rule packs (MODE-*), and gate hardening (GATE-*) are explicitly deferred to Phases 117, 118, and 120 respectively.

**Primary recommendation:** Extend `CreativeContract` with `canonicalCreative` (dominant idea, hook, proof zone, invariant identity) and `contentTiers` (mandatory / condensable / decorative) plus `precedenceRules`; add `buildCanonicalContractPromptSection()` and `extractPromptIntegritySection()`; inject integrity blocks immediately after HARD RULES and before MODE; replace conflicting preserve-all literals in mode blocks with tier-aware language governed by the precedence block (minimal edits in 116 — full mode packs remain Phase 118).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONT-01 | Contrato canônico declara ideia dominante, hook único, zona de prova/oferta, CTA único e identidade invariável | Extend `CreativeContract` + `buildCanonicalContractPromptSection()`; derive defaults from campaign/contract fields and optional diagnosis `dominantIdea` (Phase 116 may stub diagnosis field; full diagnosis schema is discretion) |
| CONT-02 | Contrato distingue obrigatório, condensável e decorativo com precedência fatos > hierarquia > decoração | `ContentTier` enum + `PRECEDENCE_RULES` constant rendered in prompt; maps to existing bold/extreme "consolidate modules" language |
| CONT-03 | Nenhum prompt exige preservar todos os módulos literalmente E simplificar hierarquia sem precedência | Edit `art_variation` MANDATORY PRESERVATION (L338) and `format_adaptation` PRESERVE EXACTLY (L353) to tier-aware wording; add `RULE PRECEDENCE` block that wins over mode/creativity sections |
| CONT-04 | `VISUAL_HIERARCHY_CONTRACT` e `ANTI_HALLUCINATION_RULES` injetados em todos os prompts de derivação aplicáveis | Wire via `buildIntegrityPromptSection()` in `buildDerivationPrompt` for `art_variation`, `format_adaptation`, `restyling`; add `extractPromptIntegritySection()` + tests |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Canonical contract type & defaults | API / Backend (`creative-contract.ts`) | Job (`derivation.ts` resolves contract) | Contract is persisted on derivation rows and built in job; types live server-side |
| Prompt section rendering | API / Backend (`prompt-builder.ts`) | — | Model-facing text assembled only in prompt builder |
| Contract field population | API / Backend (job + regenerate route) | Campaign diagnosis (read-only input) | Job merges campaign fields into `resolvedContract`; diagnosis supplies optional dominant idea |
| Integrity regression tests | Test (`prompt-builder.test.ts`, `quality-prompt-regression.test.ts`) | — | Snapshot extractors prove injection without live OpenAI |
| Gate enforcement of hierarchy/hallucination | API / Backend (`creative-quality-gate.ts`) | — | **Out of scope Phase 116** — Phase 120 promotes failures; 116 only fixes upstream prompt |

## Codebase Findings

### Dead integrity constants (CONT-04 root cause)

`VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` are defined but never referenced outside their definitions:

```116:128:app/src/server/ai/prompt-builder.ts
const VISUAL_HIERARCHY_CONTRACT = `VISUAL HIERARCHY CONTRACT:
- Express ONE dominant visual idea per piece (the scroll-stopping hook focal point).
- Limit visible text hierarchy to THREE tiers: (1) primary hook/headline, (2) one supporting proof or offer line, (3) one CTA.
...
const ANTI_HALLUCINATION_RULES = `ANTI-HALLUCINATION RULES:
- Do NOT invent people, celebrities, athletes, teams, uniforms, products, logos, trademarks, or factual claims not visible in the source reference or campaign brief.
```

`grep` across `app/` finds no other references to these identifiers. [VERIFIED: codebase grep 2026-06-15]

### Preserve-all vs hierarchy conflicts (CONT-03)

| Location | Conflicting instruction | Conflicts with |
|----------|------------------------|----------------|
| `prompt-builder.ts:338` | `MANDATORY PRESERVATION: preserve every important piece of campaign information` | `VISUAL_HIERARCHY_CONTRACT:120` — secondary facts may be merged/omitted |
| `prompt-builder.ts:345` | `Do not solve a crowded layout by deleting information` | Hierarchy contract allows omitting Tier C when hook+offer+CTA suffice |
| `prompt-builder.ts:353` | `PRESERVE EXACTLY: the original photo/subject, all text copy...` | Three-tier hierarchy for art_variation; format mode needs factual preservation but not equal visual weight |
| `prompt-builder.ts:94-95` | bold: `INVIOLABLE FACTS` + `consolidate visual modules` | Same prompt also has preserve-every-piece at L338 — no precedence stated |
| `prompt-builder.ts:467` | `prioritize a cleaner hierarchy that still includes all critical copy` | Weaker than L338 preserve-all; model follows stronger literal instruction |

### Existing contract spine (extend, don't replace)

```50:62:app/src/server/ai/creative-contract.ts
export interface CreativeContract {
  generationMode: GenerationMode;
  targetFormat: string;
  ctaSemantics: CtaSemantics;
  baseAssetId: string | null;
  styleAssetId: string | null;
  client: string | null;
  product: string | null;
  offer: string | null;
  constraints: string | null;
  sourcePackage?: SourcePackage;
  factualSourceRules?: FactualSourceRules;
}
```

Job builds `resolvedContract` at `derivation.ts:443-476` and passes it to `buildDerivationPrompt` at `derivation.ts:501-517`. Contract is already consumed for CTA semantics in `buildHardRulesSection` (`prompt-builder.ts:207-244`) and restyling factual-source rule (`prompt-builder.ts:326-331`). [VERIFIED: file read]

### Prompt assembly order today

```310:324:app/src/server/ai/prompt-builder.ts
  const parts: string[] = [
    "You are an advertising derivation engine, not a generic creative generator.",
  ];

  parts.push(
    ...buildHardRulesSection({ ... })
  );
  // → restyling factual-source (conditional)
  // → MODE block (art_variation | format_adaptation | restyling)
  // → CREATIVITY LEVEL template (art_variation only)
  // → diagnosis / fallback preservation
  // → campaign, brand kit, plan, memory, references...
```

**Missing slot:** integrity/canonical contract between HARD RULES and MODE.

### Extractors exist for hard rules, mode, restyling — not integrity

- `extractPromptHardRulesSection` — `prompt-builder.ts:533-543`
- `extractPromptModeSection` — `prompt-builder.ts:546-557`
- `extractPromptRestylingFactualSourceSection` — `prompt-builder.ts:560-567`
- **No** `extractPromptIntegritySection` or `extractPromptCanonicalContractSection`

Tests in `quality-prompt-regression.test.ts` and `prompt-builder.test.ts` snapshot hard rules/mode/restyling only — they would not fail if integrity blocks stay unwired.

### Duplicate `CreativeContract` name (do not confuse)

`app/scripts/creative-contract.ts` defines a **different** `CreativeContract` for image-analysis validation scripts. Server authority is `app/src/server/ai/creative-contract.ts`. [VERIFIED: file read]

### Phase 115 downstream assets (fixtures for later phases)

- `app/src/server/ai/creative-corpus.ts` — `CANONICAL_CAMPAIGNS` with `allowedEntities`
- `app/src/server/ai/corpus-fixtures.ts` — five audit archetypes with `baselineVerdict` vs `expectedVerdict`
- `app/tests/unit/ai/corpus-baseline.test.ts` — `test.fails` red baseline (gate gaps until Phase 120)

Phase 116 tests should **not** green baseline gate tests — only prove prompt contract injection.

### Name collision note

`app/scripts/creative-contract.ts` is unrelated to the server contract — planner should not merge or import from scripts path.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | (project) | Contract types + prompt builders | Existing spine in `creative-contract.ts` |
| Vitest | ^4.1.5 [VERIFIED: app/package.json] | Unit + snapshot regression | Already used for prompt-builder tests |
| Existing `prompt-builder.ts` | — | Single prompt assembly point | Audit root cause is here; no parallel prompt path |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prompt-builder.test-fixtures.ts` | — | `derivationConfigFromContract()` | All new prompt tests |
| `corpus-fixtures.ts` | — | Audit-linked contracts | Optional CONT-04 coverage per archetype |
| `QUALITY_FIXTURES` | — | Six synthetic gate fixtures | Extend `quality-prompt-regression.test.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `CreativeContract` in-place | New `CanonicalCreativeContract` parallel type | Duplicates persistence/schema migration; worse for job path |
| Append integrity without editing mode blocks | Precedence-only paragraph | CONT-03 fails — model still sees contradictory preserve-all |
| New npm prompt templating lib | String constants + extractors | Over-engineering; repo pattern is `parts.push` + extractors |

**Installation:** None — no new packages required.

## Architecture Patterns

### System Architecture Diagram

```text
Campaign + asset + plan
        │
        ▼
derivationJob (derivation.ts)
  resolveCreativeContract() ──► CreativeContract (+ new canonical fields)
        │
        ▼
buildDerivationPrompt (prompt-builder.ts)
  ┌─────────────────────────────────────────────────────────┐
  │ 1. Engine preamble                                      │
  │ 2. HARD RULES (CTA, format, logo, locale)               │
  │ 3. CANONICAL CREATIVE CONTRACT  ◄── NEW (CONT-01/02)   │
  │    - dominant idea, hook, proof zone, invariant identity │
  │    - content tiers + PRECEDENCE: facts>hierarchy>deco   │
  │ 4. VISUAL_HIERARCHY_CONTRACT      ◄── WIRE (CONT-04)   │
  │ 5. ANTI_HALLUCINATION_RULES        ◄── WIRE (CONT-04)   │
  │ 6. RESTYLING FACTUAL-SOURCE (if restyling)              │
  │ 7. MODE block (tier-aware wording)  ◄── EDIT (CONT-03)  │
  │ 8. Creativity template / diagnosis / flexible context     │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
OpenAI images.edit / generate
        │
        ▼
(score → QA → gate)  ◄── Phase 120 hardens; 116 does not change gate
```

### Recommended Project Structure

```
app/src/server/ai/
├── creative-contract.ts          # EXTEND: CanonicalCreative, ContentTier, precedence types
├── canonical-creative-contract.ts  # NEW (optional split): buildCanonicalContractPromptSection,
│                                 #   DEFAULT_PRECEDENCE_RULES, resolveCanonicalFromContract()
├── prompt-builder.ts             # MODIFY: wire integrity, edit mode conflicts, extractors
├── prompt-builder.test-fixtures.ts  # EXTEND: fixtures with canonical fields
└── creative-corpus.ts            # READ-ONLY: allowedEntities for anti-hallucination hints (Phase 117+)

app/src/server/ai/prompt-builder.test.ts       # ADD: integrity injection tests
app/tests/unit/ai/quality-prompt-regression.test.ts  # ADD: per-fixture integrity asserts
app/tests/unit/creative-contract.test.ts       # ADD: canonical field validation
```

**File split guidance:** Keep `creative-contract.ts` under 500 lines; if canonical builders exceed ~80 lines, extract to `canonical-creative-contract.ts` and re-export from contract module. [ASSUMED: matches AGENTS.md file size guidance]

### Pattern 1: Canonical contract prompt section

**What:** Single function renders machine contract as model-facing prose.
**When to use:** Every `buildDerivationPrompt` call for derivation modes.
**Example:**

```typescript
// Recommended shape — implement in Phase 116
export function buildCanonicalContractPromptSection(
  contract: CreativeContract
): string[] {
  const c = contract.canonicalCreative;
  return [
    "",
    "CANONICAL CREATIVE CONTRACT:",
    `Dominant idea: ${c.dominantIdea}`,
    `Primary hook (Tier 1): ${c.hook}`,
    `Proof/offer zone (Tier 2): ${c.proofZone}`,
    `CTA (Tier 3): ${resolveCtaLine(contract.ctaSemantics)}`,
    `Invariant identity: campaign=${c.invariantIdentity.campaign}; brand=${c.invariantIdentity.brand}; product=${c.invariantIdentity.product}; palette=${c.invariantIdentity.palette}; people=${c.invariantIdentity.people.join(", ") || "as in source"}`,
    "",
    "CONTENT TIERS:",
    `- Mandatory (must appear legibly): ${c.tiers.mandatory.join("; ")}`,
    `- Condensable (may merge/shrink): ${c.tiers.condensable.join("; ")}`,
    `- Decorative (may omit if hook+offer+CTA suffice): ${c.tiers.decorative.join("; ")}`,
    "",
    "RULE PRECEDENCE (highest wins):",
    "1. Factual accuracy — no invented entities; preserve Tier mandatory meaning.",
    "2. Visual hierarchy — max three information zones; Tier condensable/decorative yield to focal hook.",
    "3. Decoration — styling, glow, card chrome; never overrides facts or hierarchy.",
    "When mode instructions conflict with this block, this block wins.",
  ];
}
```

### Pattern 2: Integrity injection wrapper

**What:** Compose existing constants + export for tests.
**When to use:** After canonical section, before MODE.

```typescript
export function buildIntegrityPromptSection(): string[] {
  return ["", VISUAL_HIERARCHY_CONTRACT, "", ANTI_HALLUCINATION_RULES];
}

export function extractPromptIntegritySection(prompt: string): string {
  const start = prompt.indexOf("VISUAL HIERARCHY CONTRACT:");
  if (start === -1) return "";
  const end = prompt.indexOf("\nMODE:", start);
  return prompt.slice(start, end === -1 ? undefined : end).trimEnd();
}
```

### Pattern 3: Default canonical resolution from existing contract fields

**What:** Populate `canonicalCreative` when job builds contract — no new API required for MVP.
**When to use:** `derivation.ts` `resolvedContract` assembly.

```typescript
function resolveCanonicalCreative(contract: CreativeContract, campaign?: Campaign | null): CanonicalCreative {
  return {
    dominantIdea: campaign?.objective ?? contract.offer ?? "Campaign core message from reference",
    hook: contract.offer ?? "Primary headline from reference",
    proofZone: contract.product ?? contract.client ?? "Supporting proof from reference",
    invariantIdentity: {
      campaign: campaign?.name ?? "source campaign",
      brand: contract.client ?? "source brand",
      product: contract.product ?? "source product",
      palette: "from reference and brand kit",
      people: [], // Phase 117 may populate from allowedEntities
    },
    tiers: {
      mandatory: ["hook/headline", "offer/proof", "CTA", "logo if present", "product/subject"],
      condensable: ["badges", "duration labels", "bullet pillars", "legal copy"],
      decorative: ["icon rows", "selos", "card chrome", "background shapes"],
    },
  };
}
```

### Conflict resolution strategy (CONT-03)

| Conflict | Resolution in Phase 116 | Deferred |
|----------|-------------------------|----------|
| art_variation `preserve every important piece` vs hierarchy merge | Replace with: "Preserve **Tier mandatory** content in meaning; condensable/decorative per canonical contract tiers" | Decorative-only variation rejection → Phase 118 MODE-01 |
| `Do not solve crowded layout by deleting information` | Replace with: "Do not drop **mandatory tier** meaning; condense or omit condensable/decorative modules per precedence" | Gate overload code → Phase 120 |
| format_adaptation `PRESERVE EXACTLY` all modules | Split: **copy/facts** preserved exactly; **layout prominence** follows three zones (factual content ≠ equal visual weight) | Same-campaign identity gate → Phase 120 |
| bold/extreme `INVIOLABLE TEXT` vs consolidate modules | Add explicit line: "INVIOLABLE applies to mandatory tier spelling; consolidation applies to condensable modules only" | — |
| creativity template "sibling creative" in format jobs | format_adaptation already skips creativity template — verify no `visualTokenBrief` variation language (L480-485 excludes format) | Strip variation language → Phase 118 |

**Key principle:** Factual completeness ≠ visual prominence. Precedence block must state this explicitly.

### Injection order (locked for planner)

```
1. Engine preamble
2. HARD RULES (existing buildHardRulesSection)
3. CANONICAL CREATIVE CONTRACT (new)
4. VISUAL_HIERARCHY_CONTRACT + ANTI_HALLUCINATION_RULES (wired)
5. RESTYLING FACTUAL-SOURCE RULE (conditional, existing)
6. MODE block (edited for tier-awareness)
7. CREATIVITY LEVEL (art_variation only)
8. Diagnosis / fallback preservation (tier-map elementsToPreserve in 116 or 118)
9. Flexible context (campaign, plan, memory, brand kit, …)
```

### Anti-Patterns to Avoid

- **Defining constants without `parts.push`:** The June audit failure mode — deliverable is injection, not declaration.
- **Appending precedence without removing preserve-all:** CONT-03 requires editing conflicting lines, not stacking fixes.
- **Implementing gate hard failures in 116:** Scope creep into Phase 120; prompt-only milestone slice.
- **Importing `app/scripts/creative-contract.ts`:** Wrong type; validation script contract ≠ derivation contract.
- **Full diagnosis schema migration in 116:** Optional `dominantIdea` read from existing `creativeDiagnosis` is enough; full `factualInventory` schema is Phase 117/118 discretion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt section snapshots | Custom diff tooling | `extractPrompt*Section` + Vitest inline snapshots | Pattern exists for hard rules/mode |
| CTA resolution | Duplicate literal-CTA logic | `resolveCtaSemantics` + `buildHardRulesSection` | Already wired |
| Contract persistence | New DB column | Existing `derivations.creativeContract` JSON | Schema already stores `CreativeContract` |
| Allowed entities list | Ad-hoc string arrays in prompt | `CANONICAL_CAMPAIGNS[].allowedEntities` (read-only hints) | Phase 115 registry; full SEP-04 blocking is Phase 117/120 |
| Precedence prose | Five copies in score/QA/gate | Single `PRECEDENCE_RULES` constant shared export | Phase 120 will consume same text |

## Common Pitfalls

### Pitfall 1: Tests pass while integrity stays unwired

**What goes wrong:** CI green; production still hallucinates/overloads.
**Why it happens:** Tests assert `MODE:` and HARD RULES only.
**How to avoid:** Add `extractPromptIntegritySection`; `describe.each` over all three modes + `QUALITY_FIXTURES` + `CORPUS_ARCHETYPE_FIXTURES` asserting hierarchy + anti-hallucination present.
**Warning signs:** PR touches `creative-contract.ts` but not `buildDerivationPrompt` `parts.push` paths.

### Pitfall 2: Precedence block loses to later preserve-all text

**What goes wrong:** Model follows last strong "preserve everything" instruction.
**Why it happens:** Creativity template and reference paragraphs repeat preservation after integrity block.
**How to avoid:** Edit mode blocks; add "when instructions conflict, CANONICAL CREATIVE CONTRACT and RULE PRECEDENCE win" in integrity section.
**Warning signs:** Prompt length grows >30% without removing legacy lines.

### Pitfall 3: format_adaptation regression

**What goes wrong:** Format jobs lose literal copy preservation.
**Why it happens:** Over-aggressive tier language applied to format mode.
**How to avoid:** format_adaptation tiers: mandatory = all copy/facts verbatim; condensable = layout modules only; decorative = chrome. Do not tell format mode to omit legal copy.
**Warning signs:** `quality-prompt-regression` format snapshots lose `PRESERVE EXACTLY` for copy.

### Pitfall 4: Contract migration breaks stored derivations

**What goes wrong:** Old `creativeContract` JSON without new fields crashes prompt build.
**How to avoid:** All new fields optional with `resolveCanonicalCreative()` defaults at read time.
**Warning signs:** TypeScript requires fields without defaults in job path.

## Code Examples

### Wire integrity in buildDerivationPrompt

```typescript
// After buildHardRulesSection, before MODE — prompt-builder.ts
parts.push(...buildCanonicalContractPromptSection(contract ?? resolveDefaultContract(config)));
parts.push(...buildIntegrityPromptSection());

if (generationMode === "restyling" && contract?.styleAssetId) {
  parts.push(...buildRestylingFactualSourceSection());
}
// then existing MODE blocks (edited)
```

### Regression test pattern

```typescript
it("injects integrity contract for all derivation modes", () => {
  for (const mode of ["art_variation", "format_adaptation", "restyling"] as const) {
    const prompt = buildDerivationPrompt({ generationMode: mode, targetFormat: "1:1", contract: minimalContract(mode) });
    expect(extractPromptIntegritySection(prompt)).toContain("VISUAL HIERARCHY CONTRACT");
    expect(extractPromptIntegritySection(prompt)).toContain("ANTI-HALLUCINATION RULES");
    expect(prompt).toContain("RULE PRECEDENCE");
    expect(prompt).not.toMatch(/preserve every important piece.*without.*precedence/s);
  }
});
```

### Update extractPromptHardRulesSection end marker

```typescript
// extractPromptHardRulesSection currently stops at RESTYLING or MODE
// Add "\nCANONICAL CREATIVE CONTRACT:" as end marker before MODE
const end = indexOfEarliest(prompt, start + header.length, [
  "\nCANONICAL CREATIVE CONTRACT:",
  "\nVISUAL HIERARCHY CONTRACT:",
  "\nRESTYLING FACTUAL-SOURCE RULE:",
  "\nMODE:",
]);
```

## Phase Boundaries

### In scope (Phase 116)

- Extend `CreativeContract` with canonical creative + content tiers + precedence metadata
- `buildCanonicalContractPromptSection()` + `buildIntegrityPromptSection()`
- Wire `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` into `buildDerivationPrompt` for all three derivation modes
- Resolve preserve-all vs hierarchy conflicts via precedence block + targeted mode text edits (CONT-03)
- `extractPromptIntegritySection` / `extractPromptCanonicalContractSection` + Vitest coverage
- Default canonical resolution in job contract assembly (`derivation.ts`)
- Update `derivationConfigFromContract` test fixtures with canonical fields

### Out of scope — Phase 117 (Factual vs Visual Separation)

- SEP-01: Explicit input classification (base factual vs visual reference vs brand kit)
- SEP-02: Visual reference transfer restrictions in job inputs
- SEP-03: Contaminated derivation cannot feed format adaptation
- SEP-04: Cantona/Manchester United/Adidas gate blocking
- Populating `allowedEntities` from `CANONICAL_CAMPAIGNS` into live anti-hallucination enforcement

### Out of scope — Phase 118 (Per-Mode Prompt Rules)

- MODE-01–05: Decorative-only variation rejection, three-zone budget enforcement per mode, format firewall stripping plan hooks
- Full mode-specific rule packs replacing MODE blocks
- `visualTokenBrief` variation language removal for non-format modes

### Out of scope — Phase 120 (Quality Gate Hardening)

- GATE-01–05: New hard failure codes (`invented_factual_entity`, `visual_overload`, etc.)
- Greening `corpus-baseline.test.ts` red tests
- Score caps and generic-template promotion to `invalid`

### Out of scope — Phase 122 (Regression Suite)

- TEST-01 full matrix (entidades proibidas, separação factual/visual in tests) — 116 adds subset (integrity presence + precedence + no preserve-all conflict)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Integrity constants beside templates, unwired | Wire via `buildIntegrityPromptSection` after canonical block | Phase 116 | Model sees hierarchy + anti-hallucination |
| Flat `CreativeContract` (mode/CTA/assets) | + `canonicalCreative` + tiers + precedence | Phase 116 | CONT-01/02 machine-readable |
| preserve-all mode text | Tier-aware preservation + precedence | Phase 116 | CONT-03 |
| Prompt tests: hard rules + mode only | + integrity + canonical extractors | Phase 116 | CONT-04 provable |

**Deprecated/outdated:**
- Treating `VISUAL_HIERARCHY_CONTRACT` as documentation-only — must be injected
- "Preserve every module at equal size" as default art_variation instruction

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Optional new fields on `CreativeContract` suffice without DB migration | Codebase findings | Old rows need runtime defaults |
| A2 | `resolveCanonicalCreative()` defaults from campaign/contract are acceptable until diagnosis supplies `dominantIdea` | Pattern 3 | Weak dominant-idea text until diagnosis extended |
| A3 | Minimal mode-block edits satisfy CONT-03; full MODE packs wait for Phase 118 | Phase boundaries | Planner may need one art_variation + one format_adaptation edit task in 116 |
| A4 | All three modes are "applicable" for CONT-04 (including format_adaptation) | Requirements | If product excludes format, tests should document exception |

## Open Questions (RESOLVED)

1. **Should `canonical-creative-contract.ts` be a separate file or stay in `creative-contract.ts`?**
   - **Resolution (116-01):** Separate `canonical-creative-contract.ts` module. Keeps `creative-contract.ts` under size budget and isolates prompt builders from persistence types.

2. **Diagnosis `dominantIdea` in Phase 116 vs later?**
   - **Resolution (116-01):** Phase 116 maps `creativeDiagnosis.detectedConcept` → `dominantIdea` when present; structured `factualInventory` deferred to Phase 117/118.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies; code-only changes. Vitest/npm test runs locally.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest | ✓ | (project) | — |
| Vitest | unit tests | ✓ | ^4.1.5 | — |
| OpenAI API | runtime generation | ✓ (deploy) | — | Not needed for Phase 116 tests |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 [VERIFIED: app/package.json] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- src/server/ai/prompt-builder.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONT-01 | Prompt declares dominant idea, hook, proof zone, CTA, invariant identity | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "canonical"` | ❌ Wave 0 |
| CONT-02 | Tiers + precedence fatos>hierarquia>decoração in prompt | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "precedence"` | ❌ Wave 0 |
| CONT-03 | No simultaneous preserve-all + hierarchy without precedence | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "no preserve-all conflict"` | ❌ Wave 0 |
| CONT-04 | VISUAL_HIERARCHY + ANTI_HALLUCINATION in all modes | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts` | ❌ extend existing |
| CONT-04 | Integrity extractor snapshots | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "integrity section"` | ❌ Wave 0 |
| CONT-01 | Contract type accepts canonical fields | unit | `cd app && npm test -- tests/unit/creative-contract.test.ts` | ✅ extend |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- src/server/ai/prompt-builder.test.ts`
- **Per wave merge:** `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `extractPromptIntegritySection` + `extractPromptCanonicalContractSection` in `prompt-builder.ts`
- [ ] `buildCanonicalContractPromptSection` module
- [ ] Tests: integrity present for art_variation, format_adaptation, restyling
- [ ] Tests: `prompt` must NOT match preserve-all without precedence (CONT-03 negative assert)
- [ ] Extend `quality-prompt-regression.test.ts` with `expect(extractPromptIntegritySection(prompt)).not.toBe("")`
- [ ] Extend `creative-contract.test.ts` for canonical field defaults
- [ ] Update inline snapshots for mode sections if preserve-all text changes

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Sanitize contract string fields at job boundary; no user HTML in prompts |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via campaign fields | Tampering | Existing campaign text already flows to prompts; canonical fields use same escaping (plain text join) |
| Invented entity in output | Spoofing | ANTI_HALLUCINATION_RULES injection (CONT-04); gate blocking deferred Phase 120 |

## Sources

### Primary (HIGH confidence)

- `app/src/server/ai/prompt-builder.ts` — dead constants, mode conflicts, assembly order (read 2026-06-15)
- `app/src/server/ai/creative-contract.ts` — existing contract spine
- `app/src/server/jobs/derivation.ts` — contract resolution and prompt invocation
- `.planning/research/PITFALLS.md` — preserve-all, unwired rules, precedence guidance
- `.planning/research/ARCHITECTURE.md` — integration model, recommended extensions
- `.planning/REQUIREMENTS.md` — CONT-01–04
- `.planning/phases/115-corpus-fixtures-and-audit-baseline/115-RESEARCH.md` — fixture foundation

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` — phase boundaries 116 vs 117/118/120

### Tertiary (LOW confidence)

- None asserted without codebase verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield extension, no new deps
- Architecture: HIGH — verified live code paths and grep
- Pitfalls: HIGH — matches audit + PITFALLS.md with file evidence

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable prompt layer)

## RESEARCH COMPLETE

**Phase:** 116 - Canonical Creative Contract
**Confidence:** HIGH

### Key Findings

- `VISUAL_HIERARCHY_CONTRACT` and `ANTI_HALLUCINATION_RULES` are defined at `prompt-builder.ts:116-128` but never injected — root cause of audit gap
- `CreativeContract` lacks dominant idea, content tiers, and precedence; job already persists and passes contract to `buildDerivationPrompt`
- art_variation (`L338`) and format_adaptation (`L353`) preserve-all text directly conflicts with hierarchy rules — CONT-03 requires precedence block plus mode text edits
- Extractors exist for hard rules/mode/restyling but not integrity — tests cannot catch regression of unwired rules
- Phase 117 (factual/visual separation), 118 (per-mode packs), and 120 (gate) are out of scope; 116 is prompt contract + injection only

### File Created

`.planning/phases/116-canonical-creative-contract/116-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new packages; Vitest patterns exist |
| Architecture | HIGH | File:line verified conflicts and job wiring |
| Pitfalls | HIGH | Documented in PITFALLS.md and confirmed in code |

### Open Questions

- Separate `canonical-creative-contract.ts` vs inline in `creative-contract.ts` (size threshold)
- Whether Phase 116 maps `creativeDiagnosis.detectedConcept` → `dominantIdea` or waits for schema extension

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
