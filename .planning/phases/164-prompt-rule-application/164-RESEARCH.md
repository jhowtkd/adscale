# Phase 164: Prompt Rule Application - Research

**Researched:** 2026-06-24  
**Branch scouted:** `feat/corpus-learning-loop` (current workspace)  
**Domain:** Prompt injection of approved `calibration_rules` per `clientProfileId` with provenance logging and isolation  
**Confidence:** HIGH — codebase verified on branch; design spec cross-checked

## Summary

Phase 164 closes the corpus-learning loop's **generation impact** surface: approved brand-taste rules (non-`corpus_quality` categories) and `corpus_quality` rules must shape derivation prompts for the correct `clientProfileId`, in the mandated section order, with rule IDs persisted on every derivation's `generation_log`.

**Scout finding:** Roughly half of APPLY is already on `feat/corpus-learning-loop`. `corpus_quality` loading, prompt section builder, and `appliedCorpusRuleIds` logging exist in `derivationJob`. Brand-taste rules are **not wired** into generation despite `getApprovedRuleConstraints`, `selectApplicableRules`, and `brandTasteConstraints` slots in `prompt-builder`. Section order is **wrong** — taste/corpus blocks are injected before `buildGenerationDirectionSection` (Olhar ADScale), not after. Rule cap is **prompt-only** (`slice(0, 10)`); DB deprecation on overflow is missing. Cross-profile isolation has repository-level filters but **no integration test**.

**Primary recommendation:** Add a single `loadPromptCalibrationContext` service, refactor `buildDerivationPrompt` to inject Olhar → brand-taste → corpus_quality in that order (immediately after `buildGenerationDirectionSection`), wire it from `derivationJob`, extend `DerivationGenerationLog` with `appliedBrandRuleIds`, implement `enforceCorpusQualityRuleCap` with `deprecateCalibrationRule`, and add an isolation integration test.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load approved rules per profile | API / Backend (`derivationJob` Inngest step) | Database (`calibration_rules` via Drizzle) | Rules are server-side; never resolved in browser |
| Evidence gate for brand-taste apply | API / Backend (`selectApplicableRules` + `buildBrandTasteProfile`) | Database (`calibration_signals`) | `uncalibrated` profiles must skip brand-taste overlay |
| Prompt section assembly | API / Backend (`prompt-builder.ts`) | — | Single canonical prompt string for image model |
| Olhar ADScale + client voice | API / Backend (`generation-direction.ts`) | Database (`client_profile_olhar_config` via Phase 162) | Voice is part of art-direction block |
| Rule cap + deprecation | API / Backend (accept hook + pre-load) | Database (`calibration_rules.status = deprecated`) | Overflow must persist, not only slice at prompt time |
| Provenance logging | API / Backend (`derivationJob` finalize step) | Database (`derivations.generation_log` JSONB) | Learning impact reports consume rule IDs |
| Cross-profile isolation | Database (query filters) + test harness | — | Enforcement is `(workspaceId, clientProfileId)` on every read |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APPLY-01 | Next derivation loads approved brand-taste and `corpus_quality` rules for that profile only | Wire `listApprovedCalibrationRulesByCategories` for brand-taste categories (exclude `corpus_quality`) + existing corpus path; both already filter by `(workspaceId, clientProfileId)` [VERIFIED: `calibration-rule.ts`] |
| APPLY-02 | Prompt-builder injects sections: Olhar ADScale → brand-taste → corpus_quality | Move injection in `prompt-builder.ts` to immediately after `buildGenerationDirectionSection`; Olhar includes client voice from Phase 162 [VERIFIED: `generation-direction.ts`, `prompt-builder.ts`] |
| APPLY-03 | Generation log records `appliedBrandRuleIds` and `appliedCorpusRuleIds` | Extend `DerivationGenerationLog`; set both in `derivationJob` finalize step [VERIFIED: partial — `appliedCorpusRuleIds` only today] |
| APPLY-04 | Active `corpus_quality` rules capped (default 10); oldest deprecated on overflow | Add `enforceCorpusQualityRuleCap` using `deprecateCalibrationRule`; call on accept + pre-generation load [VERIFIED: `deprecateCalibrationRule` exists; cap slice only today] |
| APPLY-05 | Rules from one profile never appear in another's prompt (integration-tested) | New test with two `clientProfileId`s, mocked or TEST_DATABASE_URL; assert prompt substrings and log IDs [GAP: no test exists] |
</phase_requirements>

## Existing vs Gap (branch scout)

| Area | Status | Location | APPLY |
|------|--------|----------|-------|
| `corpus_quality` category in `RULE_CATEGORIES` | ✅ Exists | `calibration-signal-types.ts` | — |
| `listApprovedCalibrationRulesByCategories` scoped query | ✅ Exists | `repositories/calibration-rule.ts` | APPLY-01, APPLY-05 |
| `buildCorpusQualityPromptSection` | ✅ Exists | `human-quality/learning/corpus-quality-prompt.ts` | APPLY-02 |
| `derivationJob` loads `corpus_quality` rules | ✅ Exists | `jobs/derivation.ts` `load-corpus-quality-rules` step | APPLY-01 (partial) |
| `corpusQualitySection` passed to `buildDerivationPrompt` | ✅ Exists | `derivation.ts` L643, L1125 | APPLY-02 (wrong position) |
| `appliedCorpusRuleIds` in generation log | ✅ Exists | `generation-log.ts`, `derivation.ts` L1240 | APPLY-03 (partial) |
| Prompt-time cap `slice(0, 10)` | ✅ Exists | `derivation.ts` L427, `corpus-quality-prompt.ts` | APPLY-04 (partial) |
| `buildBrandTastePromptSection` + `selectApplicableRules` | ✅ Exists | `brand-taste/taste-application.ts` | APPLY-01, APPLY-02 |
| `getApprovedRuleConstraints` | ✅ Exists (unused in job) | `brand-taste/calibration-rules.ts` | APPLY-01 gap |
| `brandTasteConstraints` slot in `DerivationPromptConfig` | ✅ Exists (never passed) | `prompt-builder.ts` | APPLY-01, APPLY-02 gap |
| `buildGenerationDirectionSection` (Olhar + DB voice) | ✅ Exists | `olhar/generation-direction.ts` | APPLY-02 |
| `deprecateCalibrationRule` | ✅ Exists (unused for cap) | `brand-taste/calibration-rules.ts` | APPLY-04 gap |
| `appliedBrandRuleIds` on generation log | ❌ Missing | `generation-log.ts` | APPLY-03 |
| Section order Olhar → brand-taste → corpus | ❌ Wrong | `prompt-builder.ts` L431–445 before L476 | APPLY-02 |
| DB deprecation on cap overflow | ❌ Missing | — | APPLY-04 |
| Cross-profile prompt isolation test | ❌ Missing | — | APPLY-05 |
| `taste-application` / loader unit tests | ❌ Missing | — | Validation Wave 0 |

### Critical code evidence

**Corpus rules wired (partial APPLY-01/03):**

```417:432:app/src/server/jobs/derivation.ts
      step.run("load-corpus-quality-rules", async () => {
        if (!campaign.clientProfileId) {
          return { section: [] as string[], appliedRuleIds: [] as string[] };
        }

        const rules = await listApprovedCalibrationRulesByCategories({
          workspaceId,
          clientProfileId: campaign.clientProfileId,
          categories: ["corpus_quality"],
        });
        const cappedRules = rules.slice(0, 10);

        return {
          section: buildCorpusQualityPromptSection(cappedRules),
          appliedRuleIds: cappedRules.map((rule) => rule.id),
        };
      }),
```

**Wrong section order (APPLY-02 gap):** `brandTasteConstraints` and `corpusQualitySection` are pushed at L431–445, but `buildGenerationDirectionSection` (Olhar) runs at L476+.

**Brand-taste never passed:** `brandTasteConstraints` appears only in `prompt-builder.ts` — `derivation.ts` never sets it [VERIFIED: grep].

**Global query trap (must not use for prompts):** `listApprovedCorpusQualityRules()` has no `clientProfileId` filter — reserved for Phase 167 cross-client aggregator only [VERIFIED: `calibration-rule.ts` L95–106; PITFALLS.md #11].

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.45.2 [VERIFIED: `app/package.json`] | Rule queries, deprecation updates | Existing `calibration_rules` table |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit + integration tests | Project test runner |
| Existing modules | — | `brand-taste/*`, `human-quality/learning/corpus-quality-prompt` | No parallel prompt stack |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `deprecateCalibrationRule` | in-tree | Set `status: deprecated` on overflow | APPLY-04 accept + pre-load |
| `buildBrandTasteProfile` | in-tree | Evidence gate for brand-taste apply | Before `selectApplicableRules` |
| `listCalibrationSignalsForClientProfile` | in-tree | Profile input | Brand-taste loader |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Refactor `prompt-builder` section order | Inject taste/corpus in `derivationJob` string concat | Rejected — duplicates assembly; `prompt-builder` is canonical |
| `getApprovedRuleConstraints` (lines only) | `selectApplicableRules` + `buildBrandTastePromptSection` | Prefer后者 — preserves rule IDs for logging and tagged format |
| Cap only at prompt `slice` | DB deprecation only | Both required per APPLY-04 and design §16 |

**Installation:** None — no new packages.

```bash
# Verify baseline after implementation
cd app && npm test && npm run lint && npm run build
```

## Architecture Patterns

### System Architecture Diagram

```
derivationJob (Inngest)
    │
    ├─► resolve campaign.clientProfileId
    │
    ├─► load-corpus-quality-rules ──► listApprovedCalibrationRulesByCategories
    │         │                              (workspaceId, clientProfileId, corpus_quality)
    │         ├─► enforceCorpusQualityRuleCap (deprecate oldest if >10)  [NEW]
    │         └─► buildCorpusQualityPromptSection → section + appliedCorpusRuleIds
    │
    ├─► load-brand-taste-rules [NEW] ──► listApprovedCalibrationRulesByCategories
    │         │                              (categories ≠ corpus_quality)
    │         ├─► buildBrandTasteProfile(signals)
    │         ├─► selectApplicableRules(profile gate)
    │         └─► buildBrandTastePromptSection → section + appliedBrandRuleIds
    │
    └─► buildDerivationPrompt
              │
              ├─► hard rules / contract / integrity
              ├─► buildGenerationDirectionSection  (Olhar ADScale + client voice)
              ├─► brand-taste section              [REORDER]
              ├─► corpus_quality section           [REORDER]
              └─► mode rules, creativity, feedback...
                        │
                        ▼
              finalizeGenerationLog
              { appliedBrandRuleIds, appliedCorpusRuleIds }
```

### Recommended Project Structure

```
app/src/server/
├── brand-taste/
│   ├── taste-application.ts      # existing — selectApplicableRules, buildBrandTastePromptSection
│   └── prompt-calibration-loader.ts  # NEW — loadPromptCalibrationContext()
├── human-quality/learning/
│   └── corpus-quality-prompt.ts  # existing — extend with enforceCorpusQualityRuleCap
├── ai/
│   ├── prompt-builder.ts         # reorder section injection
│   └── generation-log.ts       # add appliedBrandRuleIds
└── jobs/
    └── derivation.ts             # wire loader steps + log both ID arrays
```

### Pattern 1: Unified calibration context loader

**What:** Single async function returns `{ brandTasteSection, corpusQualitySection, appliedBrandRuleIds, appliedCorpusRuleIds }` for a `(workspaceId, clientProfileId)` pair.

**When to use:** Every `buildDerivationPrompt` call site in `derivationJob` (primary + auto-retry path).

**Example:**

```typescript
// Recommended shape — adapt to existing types
export async function loadPromptCalibrationContext(input: {
  workspaceId: string;
  clientProfileId: string | null;
}): Promise<{
  brandTasteSection: string[];
  corpusQualitySection: string[];
  appliedBrandRuleIds: string[];
  appliedCorpusRuleIds: string[];
}> {
  if (!input.clientProfileId) {
    return {
      brandTasteSection: [],
      corpusQualitySection: [],
      appliedBrandRuleIds: [],
      appliedCorpusRuleIds: [],
    };
  }

  const brandCategories = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");

  const [signals, brandRules, corpusRules] = await Promise.all([
    listCalibrationSignalsForClientProfile({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    }),
    listApprovedCalibrationRulesByCategories({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      categories: [...brandCategories],
    }),
    listApprovedCalibrationRulesByCategories({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      categories: ["corpus_quality"],
    }),
  ]);

  const cappedCorpus = await enforceCorpusQualityRuleCap({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    rules: corpusRules,
    maxActive: 10,
  });

  const profile = buildBrandTasteProfile({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    signals,
  });
  const brandApply = selectApplicableRules({ approvedRules: brandRules, profile });

  return {
    brandTasteSection: brandApply.constraintLines.length
      ? buildBrandTastePromptSection(
          brandRules
            .filter((r) => brandApply.appliedRuleIds.includes(r.id))
            .map((r) => ({ id: r.id, category: r.category, rationale: r.rationale }))
        )
      : [],
    corpusQualitySection: buildCorpusQualityPromptSection(cappedCorpus.active),
    appliedBrandRuleIds: brandApply.appliedRuleIds,
    appliedCorpusRuleIds: cappedCorpus.active.map((r) => r.id),
  };
}
```

Source: Composed from existing modules [VERIFIED: codebase patterns].

### Pattern 2: Prompt section order enforcement

**What:** After `buildGenerationDirectionSection`, push brand-taste then corpus_quality; remove early injection at L431–445.

**When to use:** All modes (`art_variation`, `format_adaptation`, `restyling`).

**Test assertion:**

```typescript
const olharIdx = prompt.indexOf(GENERATION_DIRECTION_HEADER);
const brandIdx = prompt.indexOf("BRAND TASTE CONSTRAINTS");
const corpusIdx = prompt.indexOf("CORPUS QUALITY CONSTRAINTS");
expect(olharIdx).toBeLessThan(brandIdx);
expect(brandIdx).toBeLessThan(corpusIdx);
```

### Pattern 3: Cap with DB deprecation

**What:** When approved `corpus_quality` count > 10, deprecate oldest by `approvedAt` ASC (fallback `createdAt`).

**When to use:** On `acceptClientLearningProposal` after insert; optionally on `load-corpus-quality-rules` as safety net.

**Example:**

```typescript
export async function enforceCorpusQualityRuleCap(input: {
  workspaceId: string;
  clientProfileId: string;
  rules: CalibrationRule[];
  maxActive?: number;
}): Promise<{ active: CalibrationRule[]; deprecatedIds: string[] }> {
  const max = input.maxActive ?? 10;
  const sorted = [...input.rules].sort(
    (a, b) => (a.approvedAt ?? a.createdAt).getTime() - (b.approvedAt ?? b.createdAt).getTime()
  );
  if (sorted.length <= max) return { active: sorted, deprecatedIds: [] };

  const overflow = sorted.slice(0, sorted.length - max);
  for (const rule of overflow) {
    await deprecateCalibrationRule({ workspaceId: input.workspaceId, ruleId: rule.id });
  }
  return {
    active: sorted.slice(-max),
    deprecatedIds: overflow.map((r) => r.id),
  };
}
```

Source: Design spec §16 [CITED: `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md`]; `deprecateCalibrationRule` [VERIFIED: `calibration-rules.ts`].

### Anti-Patterns to Avoid

- **Using `listApprovedCorpusQualityRules()` in prompt path:** Cross-brand leakage risk (Phase 167 only).
- **Passing `brandTasteConstraints` as raw strings:** Loses rule IDs for APPLY-03; use rule objects + `buildBrandTastePromptSection`.
- **Cap-only `slice` without deprecation:** Orphan approved rows accumulate; learning impact reports over-count.
- **Skipping `selectApplicableRules` gate:** Injects brand-taste for `uncalibrated` profiles against v13.0 contract.
- **Duplicating cap in three places:** Centralize in `enforceCorpusQualityRuleCap`; prompt builder receives pre-capped rules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tagged constraint lines | Custom string format | `ruleConstraintText` / `buildBrandTastePromptSection` | Consistent `[brand-taste:id]` / `[corpus-quality:id]` tags |
| Rule status lifecycle | New status enum | `deprecateCalibrationRule` → `deprecated` | Already in schema CHECK |
| Profile evidence gate | Ad-hoc decision count | `buildBrandTasteProfile` + `selectApplicableRules` | Matches Phase 151–156 behavior |
| Cross-profile filtering | App-layer filter after global query | `listApprovedCalibrationRulesByCategories` with both IDs | DB-enforced isolation |

**Key insight:** All prompt impact flows through existing `calibration_rules` rows — Phase 164 is wiring and ordering, not a new learning store.

## Common Pitfalls

### Pitfall 1: Cross-brand rule leakage

**What goes wrong:** Profile B's prompt contains `[corpus-quality:rule-from-A]`.

**Why it happens:** Global list query or missing `clientProfileId` on campaign.

**How to avoid:** Only scoped repository functions in prompt path; integration test with two profiles.

**Warning signs:** `listApprovedCorpusQualityRules` imported in `derivation.ts` or `prompt-builder.ts`.

### Pitfall 2: Wrong section order regressing Olhar precedence

**What goes wrong:** Corpus constraints override sacred facts or hard rules perception.

**Why it happens:** Early injection before `buildGenerationDirectionSection`.

**How to avoid:** Index-based regression test in `prompt-builder.test.ts`.

**Warning signs:** `CORPUS QUALITY CONSTRAINTS` appears before `DIRECAO DE ARTE PARA GERACAO`.

### Pitfall 3: Prompt bloat

**What goes wrong:** 15+ constraint lines degrade image model adherence.

**Why it happens:** Accept without cap enforcement; no deprecation.

**How to avoid:** `enforceCorpusQualityRuleCap` on every new approved rule.

**Warning signs:** `calibration_rules` count per profile > 10 with `status = approved`.

### Pitfall 4: Incomplete provenance

**What goes wrong:** Learning impact report cannot attribute output to rules.

**Why it happens:** Only `appliedCorpusRuleIds` logged today.

**How to avoid:** Log both ID arrays on primary and auto-retry finalize paths.

**Warning signs:** `appliedBrandRuleIds` undefined in `generation_log` JSONB.

### Pitfall 5: `brandTasteConstraints` misuse

**What goes wrong:** Double-wrapped sections, fake `inline-0` rule IDs in prompt.

**Why it happens:** Passing pre-rendered lines into slot that re-calls `buildBrandTastePromptSection`.

**How to avoid:** Pass structured `brandTasteSection: string[]` from loader (already rendered) or refactor config to `brandTasteRules: CalibrationRule[]`.

## Code Examples

### Scoped corpus rule query (existing — keep)

```typescript
// Source: app/src/server/repositories/calibration-rule.ts
export async function listApprovedCalibrationRulesByCategories(input: {
  workspaceId: string;
  clientProfileId: string;
  categories: string[];
}): Promise<CalibrationRule[]> {
  return db
    .select()
    .from(calibrationRules)
    .where(
      and(
        eq(calibrationRules.workspaceId, input.workspaceId),
        eq(calibrationRules.clientProfileId, input.clientProfileId),
        eq(calibrationRules.status, "approved"),
        inArray(calibrationRules.category, input.categories)
      )
    )
    .orderBy(desc(calibrationRules.updatedAt));
}
```

### Generation log extension (required)

```typescript
// Source: app/src/server/ai/generation-log.ts — extend interface
export interface DerivationGenerationLog {
  // ...existing fields...
  appliedBrandRuleIds?: string[];
  appliedCorpusRuleIds?: string[];
}
```

### Finalize with both ID arrays

```typescript
// Source: pattern from app/src/server/jobs/derivation.ts L1230–1243
generationLog = finalizeGenerationLog(generationLog, {
  model: env.OPENAI_IMAGE_MODEL,
  appliedBrandRuleIds: calibrationContext.appliedBrandRuleIds,
  appliedCorpusRuleIds: calibrationContext.appliedCorpusRuleIds,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cenbrap-only brand-taste via campaign name | `clientProfileId` voice in `generation-direction` | Phase 162 | Olhar block is profile-aware |
| Corpus evals → artifacts only | Accept → `calibration_rules` (`corpus_quality`) | Phase 163 | Rules exist but prompt wiring partial |
| `brandTasteConstraints` early in prompt | Spec: after Olhar | Design 2026-06-21 | Phase 164 must reorder |
| Cap via slice only | Spec: deprecate oldest | Design §16 | Phase 164 must persist deprecation |

**Deprecated/outdated:**
- Passing taste rules only via `getApprovedRuleConstraints` without `selectApplicableRules` gate — bypasses `uncalibrated` check.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Oldest" for deprecation = earliest `approvedAt` (fallback `createdAt`) | Pattern 3 | Wrong rules deprecated if product prefers `updatedAt` |
| A2 | Brand-taste categories = all `RULE_CATEGORIES` except `corpus_quality` | Pattern 1 | `export_conflict` or other categories wrongly excluded/included |
| A3 | `selectApplicableRules` empty for `uncalibrated` is intended for generation | Pattern 1 | Brand with approved rules but no signals gets no taste overlay |
| A4 | Auto-retry prompt rebuild must receive same calibration context | Architecture | Retry generation misses rules if only primary path loads them |

## Open Questions (RESOLVED)

1. **Should cap enforcement run on accept only, load only, or both?**
   - **RESOLVED:** Both — accept immediately deprecates via `enforceCorpusQualityRuleCap` (164-02); load acts as safety net in `loadPromptCalibrationContext` (164-01/02).

2. **Should auto-retry `finalizeGenerationLog` also record rule IDs?**
   - **RESOLVED:** Yes — 164-01 Task 3 merges `appliedBrandRuleIds` and `appliedCorpusRuleIds` on retry finalize for consistent provenance.

## Environment Availability

Step 2.6: SKIPPED — phase is code/config-only; no new external CLIs or services.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL / TEST_DATABASE_URL | APPLY-05 integration test | Optional | — | Mock repository in unit test; integration test skipped without DB |
| Vitest | All automated tests | ✓ | ^4.1.5 | — |
| Inngest (runtime) | derivationJob | Deploy-time | 4.4.0 | Tests mock job steps |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 [VERIFIED: `app/package.json`] |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npx vitest run src/server/ai/prompt-builder.test.ts src/server/human-quality/learning/corpus-quality-prompt.test.ts -x` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APPLY-01 | Loads brand-taste + corpus rules scoped to profile | unit | `cd app && npx vitest run src/server/brand-taste/prompt-calibration-loader.test.ts -x` | ❌ Wave 0 |
| APPLY-02 | Section order Olhar → brand-taste → corpus | unit | `cd app && npx vitest run src/server/ai/prompt-builder.test.ts -t "section order" -x` | ❌ Wave 0 |
| APPLY-03 | Generation log has both ID arrays | unit | `cd app && npx vitest run src/server/jobs/derivation.test.ts -t "generation log" -x` | ❌ Wave 0 |
| APPLY-04 | Overflow deprecates oldest rules | unit | `cd app && npx vitest run src/server/human-quality/learning/corpus-quality-cap.test.ts -x` | ❌ Wave 0 |
| APPLY-05 | Profile A rules absent from profile B prompt | integration | `cd app && npx vitest run tests/integration/prompt-rule-isolation.test.ts -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Quick run command above
- **Per wave merge:** `cd app && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/server/brand-taste/prompt-calibration-loader.ts` + test — APPLY-01
- [ ] `src/server/human-quality/learning/corpus-quality-cap.ts` + test — APPLY-04
- [ ] `prompt-builder.test.ts` — section order regression — APPLY-02
- [ ] `generation-log.ts` + `derivation.test.ts` — APPLY-03
- [ ] `tests/integration/prompt-rule-isolation.test.ts` — APPLY-05
- [ ] `taste-application.test.ts` — `selectApplicableRules` gate coverage

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | N/A — generation job uses internal workspace context |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | `(workspaceId, clientProfileId)` on all rule queries; never global list for prompts |
| V5 Input Validation | yes | Existing Zod on admin accept; rule text from DB only (no user freeform in prompt) |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant/profile rule injection | Tampering / Elevation | Scoped Drizzle `where` on both IDs |
| Prompt injection via malicious rationale | Tampering | Rules owner-approved only; bounded tagged format |
| Global query misuse | Information disclosure | Ban `listApprovedCorpusQualityRules` from derivation path |

## Project Constraints (milestone scope)

From `.planning/STATE.md` and REQUIREMENTS out-of-scope (no CONTEXT.md for Phase 164):

- Owner-only operation — no workspace admin calibration UI (Phase 165)
- No freeform voice editor — voice from DB seed only (Phase 162 complete)
- `factual_issue` never becomes prompt rule (Phase 163 complete)
- No auto-approve of learning proposals
- Global cross-client promotion must not bypass per-brand isolation (Phase 167 — do not wire global rules into prompt)

## Sources

### Primary (HIGH confidence)

- Codebase on `feat/corpus-learning-loop` — `derivation.ts`, `prompt-builder.ts`, `calibration-rule.ts`, `taste-application.ts`, `corpus-quality-prompt.ts`, `generation-log.ts`
- `docs/superpowers/specs/2026-06-21-corpus-learning-loop-design.md` §7, §16 — section order, cap, provenance
- `.planning/REQUIREMENTS.md` APPLY-01..05
- `.planning/research/STACK.md`, `PITFALLS.md` — integration points and pitfalls

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` — code gaps list (cross-verified with grep)
- `.planning/phases/163-corpus-learning-proposals/163-RESEARCH.md` — explicit deferral of APPLY to Phase 164

### Tertiary (LOW confidence)

- None — all critical claims verified in-tree

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; modules exist
- Architecture: HIGH — scout mapped exact files and gaps
- Pitfalls: HIGH — aligned with PITFALLS.md and verified anti-patterns

**Research date:** 2026-06-24  
**Valid until:** 2026-07-24 (stable domain; wiring-only phase)
