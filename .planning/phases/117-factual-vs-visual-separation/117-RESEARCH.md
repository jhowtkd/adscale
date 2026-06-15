# Phase 117: Factual vs Visual Separation - Research

**Researched:** 2026-06-15
**Domain:** Creative derivation pipeline — factual/visual input classification, restyling isolation, lineage integrity, gate promotion for invented entities
**Confidence:** HIGH

## Summary

Phase 117 closes the gap between **declared** factual-source rules and **enforced** separation across prompts, contracts, job lineage, and the quality gate. Phase 116 wired canonical creative + integrity injection; Phase 115 registered `CANONICAL_CAMPAIGNS[].allowedEntities` and corpus red tests. Today, `FACTUAL_SOURCE_RULES` is stored on `CreativeContract` but never surfaced as an explicit input-classification block in prompts. Restyling gets a factual-source rule only when `styleAssetId` is set, while `visualTokenBrief` can still inject reference **content** tokens for non-`format_adaptation` modes (including restyling). The gate promotes `copied_style_reference_facts` from `styleFidelity` failures but routes invented-entity notes (e.g. Cantona / Manchester United) through `creativeRisk` → `polishSuggestions`, so `corpus-invented-factual-entity` stays **acceptable** and can be manually approved — then fed to `format_adaptation` via `parentId` + `approved_derivation` package source.

**Primary recommendation:** Add a dedicated `factual-visual-separation` module that (1) classifies inputs on the contract, (2) injects a single `INPUT SOURCE CLASSIFICATION` prompt section for all derivation modes, (3) tightens restyling abstract-transfer language and suppresses factual `visualTokenBrief` for restyling, (4) blocks `format_adaptation` jobs whose parent carries contamination hard-failure codes, and (5) promotes `invented_factual_entity` (and strengthens `style_reference_contamination`) in `creative-quality-gate.ts` using `CANONICAL_CAMPAIGNS` allowed-entity resolution — without waiting for Phase 120’s full GATE-01 taxonomy.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEP-01 | Inputs classificados: base factual, referência visual, brand kit, referências adicionais | New `InputSourceClassification` on contract + `buildInputClassificationPromptSection()` wired in `buildDerivationPrompt` after integrity block; map existing `sourcePackage`, `baseAssetId`, `styleAssetId`, `brandKit`, `clientReferences` [VERIFIED: prompt-builder.ts, derivation.ts] |
| SEP-02 | Referência visual transfere só atributos abstratos — nunca pessoas, marcas, textos, alegações | Expand RESTYLING factual-source + MODE blocks with explicit allowlist (ritmo, textura, cromia, tipografia, iluminação, lógica compositiva) and denylist; omit `visualTokenBrief` for `restyling`; clarify client `style` references as visual-only [VERIFIED: prompt-builder.ts:397-402, 553-558; PITFALLS.md §4] |
| SEP-03 | Derivação contaminada não pode alimentar adaptações de formato | Define `CONTAMINATION_FAILURE_CODES`; guard in `derivation.ts` when `usesParentOutput`; optional contract flag `factualLineageStatus`; align with `assertDerivationApprovable` already used on review + delivery-package [VERIFIED: derivation.ts:345-407, review/route.ts:43-48, delivery-package/route.ts:50-56] |
| SEP-04 | Cantona, Manchester United, Adidas e similares ausentes da fonte bloqueados no gate | Add `invented_factual_entity` to `CreativeHardFailureCode`; taxonomy patterns + `resolveAllowedEntities(campaign)` from `CANONICAL_CAMPAIGNS`; promote `briefMatch`/`creativeRisk` notes; inject allowed-entity denylist into prompt anti-hallucination section [VERIFIED: corpus-fixtures.ts:118-141; creative-quality-gate.ts:144-158; creative-corpus.ts:66-76] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Input role classification (factual vs visual) | API / Backend (`creative-contract`, prompt-builder) | — | Model instructions and persisted contract must agree before image API call |
| Restyling two-image edit ordering | API / Backend (`derivation.ts` job) | — | Base vs style buffer selection is server-side only |
| Allowed-entity registry lookup | API / Backend (`creative-corpus.ts`) | Database (campaign name/client fields) | `CANONICAL_CAMPAIGNS` is code registry; campaigns matched by display name/client heuristics |
| Prompt injection of separation rules | API / Backend (`prompt-builder.ts`) | — | Single assembly point per Phase 116 pattern |
| Lineage block (contaminated parent) | API / Backend (`derivation.ts`, repositories) | API routes (delivery-package, review) | Job must refuse parent output; routes already block invalid approval |
| Invented-entity gate promotion | API / Backend (`creative-quality-gate.ts`, `creative-quality-taxonomy.ts`) | QA vision (`creative-qa.ts` instructions) | Verdict authority is gate; QA note wording must match taxonomy patterns |
| Brand kit / client references | API / Backend (existing extractors) | — | Already injected; re-label roles in classification section only |
| UI display of input roles | Browser | — | Out of milestone scope (REQUIREMENTS.md) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (existing) | project pin | Contract types + prompt sections | Brownfield; no new runtime deps |
| Vitest | ^4.1.5 [VERIFIED: app/package.json] | Prompt + gate regression | Established in Phases 115–116 |
| `creative-contract.ts` | — | `FACTUAL_SOURCE_RULES`, `SourcePackage` | Phase 57 spine; extend, don’t replace |
| `creative-corpus.ts` | — | `CANONICAL_CAMPAIGNS`, `allowedEntities` | Phase 115 registry — read + wire |
| `prompt-builder.ts` | — | Prompt assembly | Single injection point |
| `creative-quality-gate.ts` | — | Hard failure promotion | SEP-04 requires gate changes in this phase |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `canonical-creative-contract.ts` | — | `invariantIdentity.people` population | When allowed entities include people |
| `corpus-fixtures.ts` / `quality-fixtures.ts` | — | Red→green targets | Gate + prompt tests |
| `derivation.ts` (Inngest job) | — | Lineage guards | SEP-03 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex gate promotion for invented entities | Defer all gate work to Phase 120 | ROADMAP success criterion #4 is Phase 117; corpus red tests already expect `invented_factual_entity` |
| New DB column `factualLineageStatus` | Derive from parent `hardFailures` at job time | DB column aids auditing but not required for SEP-03 if job guard is strict |
| Vision pre-pass on style ref | Prompt-only abstract allowlist | Cheaper; vision style-descriptor extraction deferred (PITFALLS.md) |

**Installation:** None — code-only phase.

**Version verification:** No new packages.

## Architecture Patterns

### System Architecture Diagram

```
Campaign assets + brand kit + client refs
         │
         ▼
┌─────────────────────┐
│ derivation.ts job   │  resolve baseAssetId / styleAssetId / parent output
│ contract assembly   │  FACTUAL_SOURCE_RULES + sourcePackage on contract
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ resolveAllowed      │  CANONICAL_CAMPAIGNS[].allowedEntities
│ Entities(campaign)  │  → canonicalCreative.invariantIdentity
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ buildDerivation     │  HARD RULES → canonical → integrity
│ Prompt              │  → INPUT SOURCE CLASSIFICATION (NEW)
└─────────┬───────────┘  → mode-specific factual/visual rules
          │              → brand kit / client refs (re-labeled)
          ▼
    OpenAI image edit/generate
          │
          ▼
┌─────────────────────┐
│ QA + score          │  notes mention entities / style contamination
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│ creative-quality-   │  invented_factual_entity (NEW)
│ gate                │  copied_style_reference_facts (existing)
└─────────┬───────────┘  → qualityVerdict invalid
          │
          ▼
   approve / format_adaptation parent?
          │
          ├─ invalid or contamination codes → BLOCK (SEP-03)
          └─ acceptable → parent output allowed for package
```

### Recommended Project Structure

```
app/src/server/ai/
├── creative-contract.ts           # extend: InputSourceClassification, contamination codes
├── factual-visual-separation.ts   # NEW: resolver + prompt section + allowed entities
├── creative-corpus.ts             # add: resolveCanonicalCampaignSlug, getAllowedEntities
├── prompt-builder.ts              # wire classification section; restyling visualTokenBrief guard
├── creative-quality-gate.ts       # invented_factual_entity promotion
├── creative-quality-taxonomy.ts   # INVENTED_ENTITY_PATTERN, STYLE_CONTAMINATION_PATTERN
├── creative-qa.ts                 # QA instructions: cite allowed entities in briefMatch
└── jobs/derivation.ts             # parent contamination guard; persist classification on contract
```

### Pattern 1: Explicit Input Source Classification (SEP-01)

**What:** Machine-readable `InputSourceClassification` on `CreativeContract` plus a prompt block listing each input’s role before MODE.

**When to use:** Every derivation mode in `buildDerivationPrompt`.

**Example:**

```typescript
// Source: Phase 117 design — aligns with existing FACTUAL_SOURCE_RULES [VERIFIED: creative-contract.ts:27-46]
export type InputSourceRole =
  | "factual_base"       // campaign asset or approved parent output
  | "visual_reference"   // style_reference asset (restyling only)
  | "brand_kit"          // workspace brand guidelines
  | "auxiliary_reference"; // client reference library

export function buildInputClassificationPromptSection(
  contract: CreativeContract,
  ctx: { hasBrandKit: boolean; clientReferenceCount: number; packageSource?: SourcePackage }
): string[] {
  const factualSource =
    contract.sourcePackage === "approved_derivation"
      ? "approved parent derivation output (visual facts only if parent passed factual gate)"
      : "campaign base asset";
  return [
    "",
    "INPUT SOURCE CLASSIFICATION:",
    `- Factual base: ${factualSource} — sole source of people, products, brands, logos, copy, offers, CTAs, claims.`,
    contract.styleAssetId
      ? "- Visual reference: style_reference asset — abstract style only (see VISUAL REFERENCE TRANSFER RULE)."
      : "- Visual reference: none.",
    ctx.hasBrandKit ? "- Brand kit: palette, typography, tone — not factual claims." : "- Brand kit: not attached.",
    ctx.clientReferenceCount > 0
      ? `- Auxiliary references (${ctx.clientReferenceCount}): layout/mood guidance only; never override factual base.`
      : "- Auxiliary references: none.",
  ];
}
```

### Pattern 2: Visual Reference Transfer Allowlist (SEP-02)

**What:** Dedicated `VISUAL REFERENCE TRANSFER RULE` with explicit abstract allowlist and factual denylist, injected for restyling (and when any `style`-kind client reference exists).

**When to use:** `generationMode === "restyling"` or `styleAssetId` set.

**Allowlist (from SEP-02):** rhythm, texture, chroma, typography, lighting, compositional logic.

**Denylist:** people, uniforms, products, brands, logos, texts, claims.

**Critical fix:** Guard `visualTokenBrief` injection — today `prompt-builder.ts:553-558` applies to restyling because only `format_adaptation` is excluded. Omit entirely for restyling or pipe through a `stripFactualTokens()` helper (minimal: skip injection). [VERIFIED: prompt-builder.ts:553-558]

### Pattern 3: Contaminated Lineage Firewall (SEP-03)

**What:** Before downloading `parentDerivation.outputKey`, verify parent has no contamination hard failures and `qualityVerdict !== "invalid"`.

**Contamination codes (proposed):**

```typescript
export const CONTAMINATION_FAILURE_CODES = new Set<CreativeHardFailureCode>([
  "invented_factual_entity",      // new in 117
  "copied_style_reference_facts", // existing
  "wrong_brand",
  "unsupported_offer",
]);
```

**Job guard (derivation.ts):** If `usesParentOutput && parentHasContamination(parentDerivation)`, throw before `downloadBuffer(parent.outputKey)`.

**API alignment:** `review/route.ts` and `delivery-package/route.ts` already call `assertDerivationApprovable` — extending hard failures for invented entities closes the approval path that currently allows `corpus-invented-factual-entity` baseline `acceptable`. [VERIFIED: corpus-baseline.test.ts:40-49]

### Pattern 4: Allowed-Entity Gate Promotion (SEP-04)

**What:** Resolve allowed entities from campaign → inject into prompt; classify QA/score notes against denylist.

```typescript
// Source: creative-corpus.ts CANONICAL_CAMPAIGNS [VERIFIED]
export function resolveAllowedEntitiesForCampaign(campaign: {
  name?: string | null;
  client?: string | null;
}): CanonicalCampaignAllowedEntities | null {
  const slug = matchCanonicalCampaignSlug(campaign.name, campaign.client);
  return slug ? CANONICAL_CAMPAIGNS[slug].allowedEntities : null;
}
```

**Gate:** Add to `creative-quality-taxonomy.ts`:

```typescript
export const INVENTED_ENTITY_PATTERN =
  /invented|hallucinat|not in allowed|absent from.*(?:source|brief|allowed)|Cantona|Manchester United|Eric Cantona/i;

export const UNAUTHORIZED_BRAND_PATTERN =
  /Adidas|unauthorized brand|trademark.*not in/i;
```

Promote in `classifyBriefMatchFailed` / `classifyCreativeRiskFailed` when note matches and entity not in resolved allowlist (string check on note is sufficient for corpus fixtures; stricter matching is Phase 120).

### Anti-Patterns to Avoid

- **Storing `FACTUAL_SOURCE_RULES` without prompt mirror:** Contract field alone does not change model behavior — Phase 116 lesson for integrity constants.
- **Treating `approved_derivation` parent as always factual:** Parent output is only safe if parent passed gate without contamination codes.
- **Injecting generic “visual source of truth” for restyling style image:** Lines 528-534 apply to primary reference asset; restyling needs separate labels for base (factual) vs style (visual-only) in classification block.
- **Deferring all gate work to Phase 120:** SEP-04 is traced to Phase 117 in REQUIREMENTS.md; minimum viable `invented_factual_entity` promotion belongs here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Allowed entity registry | Ad-hoc per-campaign strings in prompts | `CANONICAL_CAMPAIGNS` + slug matcher | Phase 115 fixtures already depend on this registry |
| Factual vs visual roles | Inline prose in each MODE block | Shared `buildInputClassificationPromptSection()` | CONT-04 pattern: one builder + extractor tests |
| Gate verdict logic | Scattered checks in API routes | `classifyCreativeQualityGate` + `assertDerivationApprovable` | Single authority; routes already delegate |
| Campaign → slug mapping | LLM classification | Deterministic `displayNames` / client string match | Testable; corpus slugs are known |
| Image pixel comparison for contamination | Custom CV | QA note + gate regex (now); vision assist deferred VISION-01 | Factual integrity is note-driven today |

**Key insight:** The pipeline already has 80% of the plumbing (`FACTUAL_SOURCE_RULES`, dual restyling assets, `sourcePackage`, `copied_style_reference_facts`). Phase 117 wires and enforces — it should not introduce a parallel contract system.

## Common Pitfalls

### Pitfall 1: Invented entities land in polishSuggestions

**What goes wrong:** `corpus-invented-factual-entity` stays `acceptable`; user approves; Cantona propagates to 9:16 format adaptations.

**Why it happens:** `classifyCreativeRiskFailed` only promotes `unsupported_offer`; other `creativeRisk` notes → `polishSuggestions`. [VERIFIED: creative-quality-gate.ts:144-158]

**How to avoid:** Add `invented_factual_entity` promotion path; add red test in `creative-quality-gate.test.ts` using corpus fixture QA output.

**Warning signs:** `corpus-baseline.test.ts` `it.fails` tests still fail after prompt-only changes.

### Pitfall 2: visualTokenBrief re-introduces style-reference facts in restyling

**What goes wrong:** Style reference offer/brand tokens in brief override RESTYLING FACTUAL-SOURCE RULE.

**Why it happens:** `visualTokenBrief` injected when `generationMode !== "format_adaptation"`. [VERIFIED: prompt-builder.ts:553-558; PITFALLS.md §4]

**How to avoid:** `if (generationMode === "restyling")` skip `visualTokenBrief` entirely in Phase 117.

### Pitfall 3: Parent output used without gate check at job time

**What goes wrong:** Race or manual DB edit approves contaminated parent; child format job still runs.

**Why it happens:** `usesParentOutput` checks `parentId` + `outputKey` only. [VERIFIED: derivation.ts:392-407]

**How to avoid:** Load parent row; verify `qualityVerdict` and `hardFailures` against `CONTAMINATION_FAILURE_CODES` before download.

### Pitfall 4: RESTYLING FACTUAL-SOURCE RULE gated on styleAssetId

**What goes wrong:** Rule omitted if `styleAssetId` missing at prompt-build time but style image still attached in job.

**Why it happens:** `if (generationMode === "restyling" && contract?.styleAssetId)` at prompt-builder.ts:397. [VERIFIED]

**How to avoid:** Always inject for `generationMode === "restyling"`; job already throws if assets missing.

### Pitfall 5: Empty `invariantIdentity.people` in canonical block

**What goes wrong:** Anti-hallucination says “don’t invent people” but model has no positive allowlist.

**Why it happens:** `resolveCanonicalCreative` sets `people: []` with label “as in source”. [VERIFIED: canonical-creative-contract.ts:94, 105-108]

**How to avoid:** Populate from `resolveAllowedEntitiesForCampaign` when slug matches; inject `ALLOWED ENTITIES` sub-block under anti-hallucination.

## Code Examples

### Wire classification after integrity (prompt order)

```typescript
// Source: extends Phase 116 injection order [VERIFIED: prompt-builder.ts:373-405]
parts.push(...buildCanonicalContractPromptSection(effectiveContract));
parts.push(...buildIntegrityPromptSection());
parts.push(
  ...buildInputClassificationPromptSection(effectiveContract, {
    hasBrandKit: Boolean(config.brandKit),
    clientReferenceCount: config.clientReferences?.length ?? 0,
    packageSource: config.packageSource,
  })
);
if (generationMode === "restyling") {
  parts.push(...buildVisualReferenceTransferRuleSection());
}
```

### Parent contamination guard (derivation job)

```typescript
// Source: Phase 117 lineage pattern
function assertParentFactualLineage(
  parent: { qualityVerdict?: string | null; hardFailures?: unknown } | null
): void {
  if (!parent) return;
  const failures = (parent.hardFailures ?? []) as CreativeHardFailure[];
  const contaminated = failures.some((f) => CONTAMINATION_FAILURE_CODES.has(f.code));
  if (contaminated || parent.qualityVerdict === "invalid") {
    throw new Error(
      "Parent derivation failed factual integrity checks and cannot be used for format adaptation."
    );
  }
}
```

### Gate promotion for invented entity

```typescript
// Source: extends classifyBriefMatchFailed pattern [VERIFIED: creative-quality-gate.ts:93-112]
if (noteMatches(INVENTED_ENTITY_PATTERN, note)) {
  pushHardFailure(hardFailures, {
    code: "invented_factual_entity",
    message: note,
    criterion: "briefMatch",
  });
  return;
}
```

### Extractor for regression tests

```typescript
export function extractPromptInputClassificationSection(prompt: string): string {
  const header = "INPUT SOURCE CLASSIFICATION:";
  const start = prompt.indexOf(header);
  if (start === -1) return "";
  const end = prompt.indexOf("\nMODE:", start);
  return prompt.slice(start, end === -1 ? undefined : end).trimEnd();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `FACTUAL_SOURCE_RULES` type only | + prompt classification block + allowed entities | Phase 117 | SEP-01/02 model-visible |
| Restyling factual rule if `styleAssetId` | Always for restyling + transfer allowlist | Phase 117 | SEP-02 |
| Parent output trust by approval status | Parent gate + contamination codes | Phase 117 | SEP-03 |
| Invented entity → polish | `invented_factual_entity` hard failure | Phase 117 | SEP-04; corpus red tests can start flipping |
| Full GATE-01 taxonomy | Partial codes in 117; remainder Phase 120 | v12.3 roadmap | Scope boundary |

**Deprecated/outdated:**
- Relying on `ANTI_HALLUCINATION_RULES` alone without campaign-specific allowed entity lists
- Using `visualTokenBrief` as authoritative for restyling factual content

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Campaign slug can be resolved deterministically from `campaign.name` / `campaign.client` against `displayNames` | Pattern 4 | Unmapped campaigns get prompt-only generic anti-hallucination; gate promotion falls back to regex without allowlist |
| A2 | SEP-04 requires **some** gate promotion in 117, not full GATE-01 in 120 | Summary, Phase boundaries | Planner might under-scope if user expected only prompts |
| A3 | `invented_factual_entity` and `style_reference_contamination` can be distinct codes; corpus fixture lists both for restyling archetype | SEP-03/04 | Map `style_reference_contamination` → `copied_style_reference_facts` alias if duplicate codes rejected |
| A4 | No DB migration required — classification stored on `creativeContract` JSONB | Standard Stack | Auditing lineage relies on parent `hardFailures` snapshot |
| A5 | Phase 118 MODE-03 will refine restyling MODE text further; 117 owns separation infrastructure | Phase boundaries | Avoid duplicating full MODE pack rewrite in 117 |

## Open Questions

1. **Should `style_reference_contamination` be a new gate code or alias `copied_style_reference_facts`?**
   - What we know: Corpus fixtures list both; gate only has `copied_style_reference_facts`. [VERIFIED: creative-quality-gate.ts:31-38]
   - What's unclear: Whether GATE-01 naming requires distinct code now.
   - Recommendation: Alias in taxonomy mapper for Phase 117; add distinct code only if GATE-01 schema locked in 120.

2. **How to match live campaigns to `CANONICAL_CAMPAIGNS` slugs in production?**
   - What we know: Fixtures use explicit slugs; manifest uses `canonicalSlug`. [VERIFIED: creative-corpus.ts]
   - What's unclear: Production campaign names may not match `displayNames` exactly.
   - Recommendation: `matchCanonicalCampaignSlug(name, client)` with normalized substring match + `constraints` field fallback for test campaigns; unmapped → empty allowlist (deny-by-QA-note only).

3. **Extent of corpus-baseline greening in 117 vs 120?**
   - What we know: 5 archetypes red; only `format_campaign_drift` and `restyling_factual_contamination` already baseline `invalid`. [VERIFIED: corpus-fixtures.ts]
   - Recommendation: 117 targets `invented_factual_entity` + strengthens restyling; overload/generic template remain Phase 120.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies beyond existing Node/Vitest/OpenAI deploy stack. Phase 117 is code + unit tests only.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vitest, build | ✓ | project pin | — |
| Vitest | unit tests | ✓ | ^4.1.5 | — |
| OpenAI API | runtime generation | ✓ (deploy) | — | Not required for Phase 117 unit tests |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 [VERIFIED: app/package.json] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/quality-prompt-regression.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEP-01 | Prompt lists factual base, visual ref, brand kit, auxiliary refs | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "input classification"` | ❌ Wave 0 |
| SEP-01 | Classification on persisted contract in job | unit | `cd app && npm test -- src/server/jobs/derivation.test.ts -t "input classification"` | ❌ Wave 0 |
| SEP-02 | Restyling prompt has abstract allowlist + no visualTokenBrief | unit | `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts -t "restyling"` | ✅ extend |
| SEP-02 | `extractPromptVisualReferenceTransferSection` snapshot | unit | `cd app && npm test -- src/server/ai/prompt-builder.test.ts -t "visual reference transfer"` | ❌ Wave 0 |
| SEP-03 | Job rejects contaminated parent for format_adaptation | unit | `cd app && npm test -- src/server/jobs/derivation.test.ts -t "contaminated parent"` | ❌ Wave 0 |
| SEP-03 | Delivery package still blocked (existing) | unit | `cd app && npm test -- src/app/api/derivations/[id]/delivery-package/route.test.ts` | ✅ extend |
| SEP-04 | Gate promotes Cantona fixture to `invented_factual_entity` | unit | `cd app && npm test -- tests/unit/ai/creative-quality-gate.test.ts -t "invented_factual_entity"` | ❌ Wave 0 |
| SEP-04 | Corpus baseline invented entity red test starts passing | unit | `cd app && npm test -- tests/unit/ai/corpus-baseline.test.ts -t "corpus-invented-factual-entity"` | ✅ extend (expect flip from `.fails`) |
| SEP-04 | Allowed entities injected in prompt for CENBRAP NR1 | unit | `cd app && npm test -- tests/unit/ai/creative-corpus.test.ts` | ✅ extend |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- src/server/ai/prompt-builder.test.ts tests/unit/ai/creative-quality-gate.test.ts`
- **Per wave merge:** `cd app && npm test -- tests/unit/ai/quality-prompt-regression.test.ts tests/unit/ai/corpus-baseline.test.ts`
- **Phase gate:** `cd app && npm test && npm run lint && npm run build`

### Wave 0 Gaps

- [ ] `factual-visual-separation.ts` — classification builder, allowed-entity resolver, contamination code set
- [ ] `extractPromptInputClassificationSection` (+ optional visual transfer extractor)
- [ ] `invented_factual_entity` on `CreativeHardFailureCode` + taxonomy patterns
- [ ] `matchCanonicalCampaignSlug` / `resolveAllowedEntitiesForCampaign` in `creative-corpus.ts`
- [ ] Tests: input classification present for art_variation, format_adaptation, restyling
- [ ] Tests: restyling prompt must NOT contain `Extracted Visual Token Brief`
- [ ] Tests: derivation job throws when parent has `copied_style_reference_facts`
- [ ] Tests: gate classifies corpus invented-entity QA note as `invalid`
- [ ] Extend `quality-prompt-regression.test.ts` with classification + allowed-entities asserts

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Sanitize campaign/client strings in prompt join; no HTML; validate parent lineage server-side |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via campaign fields | Tampering | Existing plain-text join; classification does not elevate untrusted refs to factual |
| Contaminated creative approved as format parent | Tampering | `assertDerivationApprovable` + job lineage guard |
| Invented trademark/athlete in ad output | Spoofing | Allowed-entity denylist + `invented_factual_entity` gate |
| Style reference factual leak | Tampering | RESTYLING transfer rule + `copied_style_reference_facts` |

## Phase Boundaries

### In scope (Phase 117)

- SEP-01: `InputSourceClassification` + prompt section + job persistence on `creativeContract`
- SEP-02: Visual reference transfer allowlist/denylist; restyling `visualTokenBrief` guard; strengthen existing RESTYLING FACTUAL-SOURCE RULE
- SEP-03: Parent contamination check in `derivation.ts`; `CONTAMINATION_FAILURE_CODES` constant
- SEP-04: `invented_factual_entity` gate code + taxonomy + `CANONICAL_CAMPAIGNS` wiring into prompt and gate
- Populate `canonicalCreative.invariantIdentity.people` (and brands/products) from allowed entities when slug matches
- Prompt/gate unit tests; flip `corpus-invented-factual-entity` baseline red test

### Out of scope — Phase 118 (Per-Mode Rules)

- MODE-01–05 full mode packs, decorative-only variation rejection, three-zone budget per mode
- Full `visualTokenBrief` policy for art_variation

### Out of scope — Phase 120 (Quality Gate Hardening)

- Remaining GATE-01 codes: `replaced_source_subject`, `campaign_identity_drift`, `generic_template_aesthetic`, `visual_overload`, `missing_dominant_idea`, `decorative_only_variation`
- Greening all 5 corpus archetype baseline reds
- Score caps (SCR-02)

### Out of scope — Phase 122 (Regression Suite)

- TEST-01 full matrix (broader than SEP-focused additions here)

## Sources

### Primary (HIGH confidence)

- `app/src/server/ai/creative-contract.ts` — `FACTUAL_SOURCE_RULES`, `SourcePackage` [read 2026-06-15]
- `app/src/server/ai/prompt-builder.ts` — restyling rule, reference handling, visualTokenBrief [read 2026-06-15]
- `app/src/server/jobs/derivation.ts` — contract assembly, parent output, restyling assets [read 2026-06-15]
- `app/src/server/ai/creative-quality-gate.ts` — hard failure classification [read 2026-06-15]
- `app/src/server/ai/creative-corpus.ts` — `CANONICAL_CAMPAIGNS`, `allowedEntities` [read 2026-06-15]
- `app/tests/unit/ai/corpus-baseline.test.ts` — red baseline tests [read 2026-06-15]
- `app/tests/unit/ai/corpus-fixtures.ts` — Cantona / contamination fixtures [read 2026-06-15]
- `.planning/phases/116-canonical-creative-contract/116-RESEARCH.md` — deferred SEP-* scope [read 2026-06-15]
- `.planning/phases/116-canonical-creative-contract/116-VERIFICATION.md` — Phase 116 deliverables [read 2026-06-15]
- `.planning/research/PITFALLS.md` §4–6 — restyling contamination, format drift, unwired rules [read 2026-06-15]
- `.planning/research/ARCHITECTURE.md` — integration model for gate + corpus [read 2026-06-15]

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` Phase 117 success criteria
- `.planning/REQUIREMENTS.md` SEP-01–04

### Tertiary (LOW confidence)

- None asserted without codebase verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield, verified file paths
- Architecture: HIGH — traced job → prompt → gate → approval → delivery-package
- Pitfalls: HIGH — matches corpus audit + PITFALLS.md with line evidence

**Research date:** 2026-06-15
**Valid until:** 2026-07-15 (stable prompt/gate layer)

## RESEARCH COMPLETE

**Phase:** 117 - Factual vs Visual Separation
**Confidence:** HIGH

### Key Findings

- `FACTUAL_SOURCE_RULES` is persisted on contracts but not injected as an explicit input-classification prompt block (SEP-01 gap).
- `visualTokenBrief` still applies to restyling, undermining factual/visual separation (SEP-02 gap; PITFALLS.md confirmed).
- Format adaptations from `approved_derivation` parents do not verify parent `hardFailures` at job time — only `parentId` + `outputKey` (SEP-03 gap).
- Invented entities (Cantona, Manchester United) route to `polishSuggestions`, not hard failures — `corpus-invented-factual-entity` baseline stays `acceptable` (SEP-04 root cause).
- `CANONICAL_CAMPAIGNS.allowedEntities` exists from Phase 115 but is not wired to prompts or gate.
- Phase 116 delivered integrity injection; Phase 117 should add separation module + minimal gate promotion without duplicating Phase 120’s full taxonomy.

### File Created

`.planning/phases/117-factual-vs-visual-separation/117-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new deps; patterns from 116 |
| Architecture | HIGH | End-to-end path verified in code |
| Pitfalls | HIGH | Corpus red tests + gate classifier traced |

### Open Questions

- Distinct `style_reference_contamination` gate code vs alias to `copied_style_reference_facts`
- Production campaign → canonical slug matching heuristic
- How many corpus baseline reds to flip in 117 vs defer to 120

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
