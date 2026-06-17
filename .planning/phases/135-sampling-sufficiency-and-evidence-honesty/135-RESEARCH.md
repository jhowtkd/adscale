# Phase 135: Sampling Sufficiency and Evidence Honesty - Research

**Researched:** 2026-06-17
**Domain:** Human-quality corpus sample thresholds, honest `insufficient_sample` gates, evidence-source separation, operator coverage visibility
**Confidence:** HIGH

## Summary

Phase 135 is a **unification and honesty layer** on top of Phases 129–134, not a new corpus workflow. The brownfield already implements partial sufficiency gates: calibration uses `MIN_GLOBAL_EVALUATED_ITEMS=5` and `MIN_SLICE_SAMPLE=3` with status `insufficient_corpus` [VERIFIED: `calibration/report.ts:10-11,98`]; learning impact uses `MIN_GLOBAL_IMPACT_ITEMS=5` and `MIN_ARM_SAMPLE=3` with `insufficient_sample` plus `insufficientReasons` [VERIFIED: `impact/report.ts:19,94-109`]; quality improvement reuses `MIN_SLICE_SAMPLE` per targeted failure reason in before/after arms [VERIFIED: `improvement/reevaluate.ts:196-201`]. Phase 133's `check-real-quality-release-evidence.mjs` already separates `qualityMetrics.humanCorpus`, `qualityMetrics.fixtureValidation`, `factualMetrics`, `learningImpactMetrics`, and `acceptedCaveats` (QA-23) [VERIFIED: `check-real-quality-release-evidence.mjs:66-71,215-246,283-305`].

**Critical gaps for SAMPLE-01..04:**
1. Thresholds are **duplicated and inconsistently named** (`insufficient_corpus` vs `insufficient_sample`; constants in three modules).
2. Reports and UI show **hardcoded prose** about thresholds but lack a structured **`sampleGuidance`** contract with per-gate `additionalNeeded` counts (SAMPLE-02).
3. **Trend thresholds do not exist** — Phase 136 builds the dashboard UI, but SAMPLE-01 requires thresholds to be defined in 135.
4. **No unified operator coverage view** — slice comparability is buried per tab (Impact slices table, Calibration global only); SAMPLE-04 needs a cross-gate rollup for "what to evaluate next."
5. Evidence separation is strong at the **133 aggregate** level but **not uniformly tagged** in individual phase evidence JSON (130/131/132) with `evidenceSource` metadata (SAMPLE-03).

**Primary recommendation:** Add a canonical `app/src/server/human-quality/sampling/` module (`thresholds.ts`, `guidance.ts`, `coverage.ts`, `types.ts`) as the single source of truth; refactor calibration/impact/improvement to import from it without changing numeric behavior; attach `sampleGuidance` to all human-quality reports and evidence JSON; add a read-only **Coverage** API + panel section for operator slice gaps; define trend thresholds as constants consumed by Phase 136 — do **not** build trend charts in 135.

<user_constraints>
## User Constraints (from STATE.md + Phase 134 boundary — no Phase 135 CONTEXT.md)

### Locked Decisions
- [v12.6]: Separate operational evidence from technical green checks; small datasets must yield `insufficient_sample`, not optimistic claims.
- [v12.5]: Validate output quality with a real human-judged corpus, not only deterministic fixtures.
- [v12.5]: Keep factual metrics separate from visual quality and learning-impact metrics.
- [Phase 129]: Corpus inclusion is explicit/manual; Postgres canonical; no prompts/signed URLs in corpus payloads.
- [Phase 130]: Global evaluated minimum 5 for calibration `ok`; slice proposals need ≥3 items; `insufficient_corpus` nulls visual aggregates; factual metrics still computed from available rows.
- [Phase 131]: `LearningImpactReport` nulls movement deltas when `insufficient_sample`; intent/factual remain descriptive; slice key `clientProfileId|generationMode|format`.
- [Phase 132]: `MIN_SLICE_SAMPLE` per targeted reason in both before/after arms required before quality improvement `ok`; checker rejects non-null deltas when `insufficient_sample`.
- [Phase 133]: QA-23 metric separation in aggregate evidence; QA-24 uses `accepted_gap` caveat when human corpus below target; fixture 70.17 is reference baseline only.
- [Phase 134]: Live corpus operations complete; **do not** claim SAMPLE/TREND/QALIVE complete in Phase 134; sampling sufficiency is Phase 135 scope [VERIFIED: `134-CONTEXT.md:53`, `134-03-SUMMARY.md`].
- [Phase 134]: Operator real-data evaluation is data-dependent — automated verification green with `evaluatedItemCount` potentially still 0.

### Claude's Discretion
- Exact module paths under `human-quality/sampling/` vs extending `calibration/report.ts` exports only.
- Whether to normalize status string to `insufficient_sample` everywhere vs keep `insufficient_corpus` as calibration alias with shared guidance builder.
- Trend threshold values (recommend mirror global=5, slice=3, time-buckets=2 for direction — see Assumptions Log).
- Coverage UI: new **Coverage** tab vs Queue-tab summary card on `HumanQualityCorpusPanel`.
- Phase 135 evidence CLI (`check-sampling-sufficiency-evidence.mjs`) vs extending existing four checkers only.
- Plan wave count (2–3 plans): canonical sampling module + report extensions vs operator coverage API/UI vs evidence-honesty checker hardening.

### Deferred Ideas (OUT OF SCOPE)
- Trend dashboard charts and filters (Phase 136 — TREND-01..04).
- Operational release gate rerun against live evidence (Phase 137 — QALIVE-01..04).
- Statistical significance / p-values — corpus N too small; descriptive gates only (Phase 131 precedent).
- Automatic corpus inclusion or multi-reviewer agreement.
- Changing numeric threshold values without explicit operator/product sign-off (preserve existing 5/3 behavior).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAMPLE-01 | System defines minimum sample thresholds per quality trend, calibration slice and learning-impact slice | Canonical `sampling/thresholds.ts` exporting all gate mins; refactor existing constants to re-export; add `MIN_TREND_*` constants for Phase 136 |
| SAMPLE-02 | Reports return `insufficient_sample` with required-next-sample guidance when thresholds are not met | `sampling/guidance.ts` builds `SampleGuidance[]` with `currentCount`, `requiredCount`, `additionalNeeded`, `blockedClaim`; attach to calibration/impact/improvement reports + evidence JSON |
| SAMPLE-03 | Release evidence distinguishes fixture metrics, live human metrics and accepted caveats without mixing denominators | Extend QA-23 pattern: `evidenceSource` tags on sections; strengthen `check-*-evidence.mjs` + aggregate validator; never use fixture denominators in human corpus claims |
| SAMPLE-04 | Operator can see which slices need more samples before the next release gate can make a stronger claim | `sampling/coverage.ts` + `GET /api/feedback/sample-coverage` + Coverage section/tab on `HumanQualityCorpusPanel` listing gate blockers and slice gaps |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Canonical threshold constants (SAMPLE-01) | API / Backend (`human-quality/sampling`) | — | Single module prevents drift across calibration/impact/improvement/trend |
| Next-sample guidance computation (SAMPLE-02) | API / Backend (`sampling/guidance.ts`) | Report builders | Pure functions over counts; same logic for API, CLI, UI |
| Report status + withheld deltas | API / Backend (existing report modules) | — | Status resolution stays in domain reports; guidance is additive |
| Evidence source separation (SAMPLE-03) | CLI / evidence scripts | Aggregate orchestrator | CI gates enforce honesty at artifact boundary |
| Operator coverage rollup (SAMPLE-04) | API / Backend (`sampling/coverage.ts`) | Browser (read-only panel) | Aggregates cross-report gaps server-side; UI displays |
| Trend threshold definition | API / Backend (`sampling/thresholds.ts`) | — | Phase 136 consumes; no chart rendering in 135 |
| Trend visualization | — (Phase 136) | Browser | Deferred per roadmap |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Threshold types, guidance math, coverage aggregation | Brownfield; Phases 129–134 pattern |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit tests for pure sampling functions | `app/config/vitest.config.ts` |
| Drizzle ORM | project pin | Evaluated corpus joins for coverage counts | Existing human-quality repositories |
| `human-quality/calibration/` | — | Calibration comparisons and slice groups | Source data for calibration + improvement gates |
| `human-quality/impact/` | — | Slice arm comparability | Source data for impact gates |
| `human-quality/improvement/` | — | Before/after failure-frequency arms | Source data for quality-improvement gates |
| `check-real-quality-release-evidence.mjs` | — | QA-23 aggregate separation | Extend for SAMPLE-03 enforcement |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | project pin | Optional `run-sample-coverage.ts` CLI | Mirror Phase 130–132 evidence CLIs |
| Node `fs` + JSON | — | `.planning/phases/135-*` evidence artifacts | Phase 137 precursor |
| `requireCalibrationAccess` pattern | — | Platform-owner auth on coverage API | Reuse `calibration-access.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `sampling/` module | Document constants in planning only | Drift already happened (`MIN_GLOBAL_IMPACT_ITEMS` duplicates `MIN_GLOBAL_EVALUATED_ITEMS`) |
| Change all statuses to `insufficient_sample` | Keep `insufficient_corpus` + map in guidance | Breaking change for 130 evidence checker; prefer alias + shared guidance |
| Client-side gap computation | Server coverage service | Duplicates logic; violates honesty if UI and CLI disagree |
| Full trend engine in 135 | Threshold constants only | Violates Phase 136 boundary; thresholds are enough for SAMPLE-01 |
| `simple-statistics` for confidence intervals | Count-based gates | Corpus N too small; invites false confidence |

**Installation:** None — no new npm dependencies.

**Version verification:** `npm view vitest version` → 4.1.9 (2026-06-17); `app/package.json` pins `^4.1.5`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 134 live corpus (evaluated rows in Postgres)                           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ human-quality/sampling/thresholds.ts — SINGLE SOURCE OF TRUTH                │
│  GLOBAL_MIN=5, SLICE_MIN=3, ARM_MIN=3, TREND_GLOBAL_MIN, TREND_BUCKET_MIN   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ calibration/     │  │ impact/          │  │ improvement/     │
│ report.ts        │  │ report.ts        │  │ reevaluate.ts    │
│ status + guidance│  │ status + guidance│  │ status + guidance│
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ sampling/guidance.ts — SampleGuidance[] (additionalNeeded per gate/slice)  │
│ sampling/coverage.ts — cross-gate CoverageReport for operator + Phase 137   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────────────┐
│ Evidence JSON + checkers      │    │ GET sample-coverage + Panel Coverage    │
│ evidenceSource tags (SAMPLE-03)│    │ slice gap table (SAMPLE-04)            │
└──────────────────────────────┘    └──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 136 trend dashboard reads MIN_TREND_* — charts NOT built in 135       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app/src/server/human-quality/
├── sampling/
│   ├── types.ts           # SampleGuidance, CoverageGap, EvidenceSource, gate enums
│   ├── thresholds.ts      # SAMPLE-01 canonical constants + TREND_* for Phase 136
│   ├── guidance.ts        # buildSampleGuidance(), computeAdditionalNeeded()
│   ├── coverage.ts        # buildSampleCoverageReport() — cross-gate rollup
│   └── service.ts         # runSampleCoverage() — joins existing report runners
├── calibration/report.ts  # import thresholds; attach sampleGuidance
├── impact/report.ts       # import thresholds; extend insufficientReasons → guidance
├── improvement/reevaluate.ts  # import thresholds; attach per-reason guidance
app/src/app/api/feedback/
├── sample-coverage/route.ts   # platform-owner GET
app/scripts/
├── check-sampling-sufficiency-evidence.mjs  # optional Phase 135 gate
├── run-sample-coverage.ts                   # optional evidence CLI
```

### Pattern 1: Canonical Thresholds with Backward-Compatible Re-exports

**What:** Move numeric mins to `sampling/thresholds.ts`; existing modules re-export same names/values so tests stay green.

**When to use:** SAMPLE-01 — any new gate must import from here.

**Example:**

```typescript
// Source: [VERIFIED: calibration/report.ts, impact/report.ts, improvement/reevaluate.ts]
export const SAMPLE_GLOBAL_MIN = 5;
export const SAMPLE_SLICE_MIN = 3;
export const SAMPLE_ARM_MIN = 3;

/** Phase 136 consumes; no chart logic in 135 */
export const TREND_GLOBAL_MIN_EVALUATED = SAMPLE_GLOBAL_MIN;
export const TREND_SLICE_MIN = SAMPLE_SLICE_MIN;
export const TREND_MIN_TIME_BUCKETS = 2;

// Backward compat
export const MIN_GLOBAL_EVALUATED_ITEMS = SAMPLE_GLOBAL_MIN;
export const MIN_SLICE_SAMPLE = SAMPLE_SLICE_MIN;
export const MIN_GLOBAL_IMPACT_ITEMS = SAMPLE_GLOBAL_MIN;
export const MIN_ARM_SAMPLE = SAMPLE_ARM_MIN;
```

### Pattern 2: Structured Next-Sample Guidance (SAMPLE-02)

**What:** Every gated report includes `sampleGuidance: SampleGuidance[]` alongside status.

**When to use:** Whenever `status !== "ok"` (or calibration `insufficient_corpus`).

**Example:**

```typescript
// Source: [ASSUMED: pattern mirrors performance/hypothesis insufficient_evidence verdict]
export interface SampleGuidance {
  gate:
    | "calibration_global"
    | "calibration_slice"
    | "impact_global"
    | "impact_slice_arm"
    | "quality_improvement_reason"
    | "trend_global";
  sliceKey?: string;
  arm?: "learned" | "non_learned" | "before" | "after";
  dimension?: string; // failure reason, mode, format
  currentCount: number;
  requiredCount: number;
  additionalNeeded: number;
  blockedClaim: string;
}

export function computeAdditionalNeeded(current: number, required: number): number {
  return Math.max(0, required - current);
}
```

### Pattern 3: Evidence Source Tagging (SAMPLE-03)

**What:** Each evidence section carries `evidenceSource: "live_human" | "fixture" | "accepted_caveat" | "technical_regression"` and optional `denominatorNote`.

**When to use:** All phase evidence JSON and 133 aggregate output.

**Example:**

```typescript
// Source: [VERIFIED: check-real-quality-release-evidence.mjs aggregateEvidence structure]
{
  "qualityMetrics": {
    "humanCorpus": {
      "evidenceSource": "live_human",
      "evaluatedItemCount": 0,
      "meanHumanVisualScore": null,
      "denominatorNote": "Human-evaluated corpus items only"
    },
    "fixtureValidation": {
      "evidenceSource": "fixture",
      "meanQualityScore": 70.17,
      "denominatorNote": "Deterministic v12.3 matrix — not human corpus"
    }
  },
  "acceptedCaveats": [{
    "evidenceSource": "accepted_caveat",
    "id": "visual_quality_gap",
    "status": "accepted_gap"
  }]
}
```

### Pattern 4: Operator Coverage Rollup (SAMPLE-04)

**What:** `SampleCoverageReport` merges guidance from calibration, impact, and quality-improvement into one sorted gap list with `nextGate: "calibration" | "impact" | "quality_improvement" | "release"`.

**When to use:** Operator panel and Phase 137 audit preamble.

**Example:**

```typescript
export interface SampleCoverageReport {
  schemaVersion: 1;
  capturedAt: string;
  evaluatedItemCount: number;
  gates: Array<{
    id: string;
    status: "ok" | "insufficient_sample" | "insufficient_corpus";
    blockedClaims: string[];
  }>;
  sliceGaps: SampleGuidance[];
  nextOperatorAction: string; // human-readable summary
}
```

### Anti-Patterns to Avoid

- **Duplicating threshold literals in UI strings:** Panel must read `sampleGuidance` from API, not hardcode "≥5 evaluated items."
- **Mixing fixture pass rates into human corpus denominators:** `fixtureMetrics` stays separate; never compute human means over fixture N.
- **Building trend charts in 135:** Threshold constants only; defer UI to Phase 136.
- **Claiming improvement when `additionalNeeded > 0`:** Checkers must fail `improvementClaimed` when any movement gate is blocked (extend Phase 131/132 pattern).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sample size gating | Ad-hoc `if (n < 5)` per report | `sampling/guidance.ts` | Three modules already drifted; fourth (trend) would repeat |
| Cross-report operator view | Manual tab-by-tab reading | `sampling/coverage.ts` service | SAMPLE-04 requires unified slice gaps |
| Evidence bucket separation | New blended score | QA-23 section layout + `evidenceSource` tags | Phase 133 checker already encodes rules |
| Statistical tests | Custom t-test / chi-square | Count thresholds + withheld deltas | Phase 131/132 explicit deferral of inference |
| Auth on coverage API | New auth scheme | `requireCalibrationAccess` | Phase 130 precedent for human-quality read APIs |

**Key insight:** Phase 135 is policy consolidation and operator visibility — the hard honesty rules already exist in silos; the risk is inconsistency and missing structured guidance, not missing corpus infrastructure.

## Common Pitfalls

### Pitfall 1: Renaming `insufficient_corpus` Breaks Phase 130 Evidence CI

**What goes wrong:** Mass-replace status strings; `check-score-calibration-evidence.mjs` rejects evidence.

**Why it happens:** Calibration uses different status label than impact/improvement.

**How to avoid:** Keep `insufficient_corpus` on calibration reports; map both labels in `guidance.ts` and coverage rollup; optionally add normalized `samplingStatus: "insufficient_sample"` alias field.

**Warning signs:** 130-EVIDENCE.json checker failures after refactor.

### Pitfall 2: Guidance Without `additionalNeeded` Fails SAMPLE-02

**What goes wrong:** Reports only echo `insufficientReasons` string codes (`global_below_minimum`) without numeric next steps.

**Why it happens:** Phase 131 added reasons but not structured guidance.

**How to avoid:** Every guidance item must include `currentCount`, `requiredCount`, `additionalNeeded`.

**Warning signs:** Operator still asks "how many more evaluations?" despite insufficient status.

### Pitfall 3: Fixture Metrics Presented as Live Progress

**What goes wrong:** Quality tab `fixtureMetrics` pass rate shown without label distinction; operators confuse archetype fixtures with corpus movement.

**Why it happens:** `fixtureMetrics` already rendered in `HumanQualityCorpusPanel` Quality tab [VERIFIED: `HumanQualityCorpusPanel.tsx:713-797`].

**How to avoid:** Require `evidenceSource: "fixture"` badge; never include fixture counts in `evaluatedItemCount`.

**Warning signs:** SAMPLE-03 checker catches mixed denominators — add UI parity.

### Pitfall 4: Coverage API Becomes Trend Dashboard

**What goes wrong:** Phase 135 scope creeps into TREND-* requirements.

**Why it happens:** "Coverage over time" sounds like trends.

**How to avoid:** Coverage report is snapshot of current gate blockers only; time-series is Phase 136.

**Warning signs:** ROADMAP TREND requirements marked complete in Phase 135.

### Pitfall 5: Empty Live Corpus Shows Misleading `ok`

**What goes wrong:** Factual pass defaults to 1.0 when `evaluatedItemCount=0` [VERIFIED: `check-real-quality-release-evidence.mjs:166-168`] — correct for factual, but visual claims must stay blocked.

**Why it happens:** Conservative factual default from Phase 133.

**How to avoid:** Coverage report must list `calibration_global` and `impact_global` gaps when count=0; never surface mean visual scores.

**Warning signs:** Operator thinks quality target met with zero evaluations.

## Code Examples

### Impact slice comparability (existing — extend with guidance)

```typescript
// Source: [VERIFIED: impact/aggregate.ts:54-68]
export function computeSliceComparison(
  sliceKey: string,
  rows: ImpactEvaluatedRow[],
  minArmSample = MIN_ARM_SAMPLE
): ImpactSliceComparison {
  const learned = computeArmMetrics(rows.filter((r) => r.learningApplied === true));
  const nonLearned = computeArmMetrics(rows.filter((r) => r.learningApplied === false));
  const comparability =
    learned.count >= minArmSample && nonLearned.count >= minArmSample
      ? "ok"
      : "insufficient";
  // Phase 135: emit guidance when comparability === "insufficient"
  return { sliceKey, learned, nonLearned, visualScoreDelta: /* ... */, comparability };
}
```

### QA-23 metric separation validation (extend for SAMPLE-03)

```javascript
// Source: [VERIFIED: check-real-quality-release-evidence.mjs:283-305]
export function validateMetricSeparation(evidence, errors, label = "evidence") {
  for (const field of BLENDED_FIELD_DENYLIST) {
    if (field in evidence) {
      errors.push(`${label} must not include blended metric field "${field}" at root`);
    }
  }
  // Phase 135: also require evidenceSource on humanCorpus vs fixtureValidation
}
```

### Panel insufficient messaging (replace hardcoded thresholds)

```tsx
// Source: [VERIFIED: HumanQualityCorpusPanel.tsx:510-516 — hardcoded today]
{report.sampleGuidance?.map((item) => (
  <li key={`${item.gate}-${item.sliceKey ?? "global"}`}>
    Need {item.additionalNeeded} more for {item.blockedClaim} ({item.currentCount}/{item.requiredCount})
  </li>
))}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No sample gates | Per-module MIN constants | Phases 130–132 | Honest `insufficient_*` but scattered |
| Fixture-only release evidence | Human corpus + aggregate QA-23 | Phase 133 | Separation at aggregate; not all child evidence tagged |
| Operator queue only | Queue + 4 report tabs | Phase 134 | No unified "what's missing for next gate" |
| Prose-only insufficient messages | Structured `sampleGuidance` | **Phase 135 target** | SAMPLE-02 compliance |
| No trend thresholds | `MIN_TREND_*` constants | **Phase 135 target** | Unblocks Phase 136 without redefining policy |

**Deprecated/outdated:**
- Hardcoded threshold strings in `HumanQualityCorpusPanel` — replace with API-driven `sampleGuidance`.
- Duplicate `MIN_GLOBAL_IMPACT_ITEMS` / `MIN_GLOBAL_EVALUATED_ITEMS` definitions — consolidate to `sampling/thresholds.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Trend thresholds should mirror calibration/global (5) and slice (3) | Standard Stack | Product may want higher bar for trend claims |
| A2 | `TREND_MIN_TIME_BUCKETS=2` is sufficient to define "trend" gate | Architecture | May need 3+ buckets for weekly ops — confirm with owner |
| A3 | Keep `insufficient_corpus` label on calibration reports | Pitfall 1 | Alias field may be cleaner long-term |
| A4 | Phase 135 evidence CLI is optional if existing four checkers gain guidance validation | Claude's Discretion | Phase 137 may want single 135-EVIDENCE.json artifact |

## Open Questions

1. **Should calibration status rename to `insufficient_sample`?**
   - What we know: 130 checker expects `insufficient_corpus`; impact/improvement use `insufficient_sample`.
   - What's unclear: Whether v12.6 milestone wants one canonical status enum.
   - Recommendation: Keep calibration label; normalize in coverage rollup only.

2. **What is the minimum for trend time buckets?**
   - What we know: SAMPLE-01 mentions trend thresholds; no code exists yet.
   - What's unclear: Weekly vs daily bucketing for v12.6 ops.
   - Recommendation: `TREND_MIN_TIME_BUCKETS=2` as constant; Phase 136 implements bucketing.

3. **Does operator coverage scope to workspace or global rollup?**
   - What we know: Calibration/impact CLIs support `--all-workspaces`.
   - What's unclear: Panel default workspace filter vs global owner view.
   - Recommendation: Match Phase 130 — workspace-scoped API with optional global for platform owner.

## Environment Availability

Step 2.6: External dependencies limited to existing Postgres corpus and npm test toolchain.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Scripts, Vitest | ✓ | project pin | — |
| Postgres (evaluated corpus) | Coverage counts | ✓ (deployed) | — | Empty corpus → all gates `insufficient_*` with guidance |
| Vitest | Unit tests | ✓ | 4.1.9 | — |
| Live evaluated items | Meaningful `ok` gates | ✗ (often 0) | — | Guidance still works; demonstrates SAMPLE-02/04 value |

**Missing dependencies with no fallback:**
- None — phase is code/config consolidation.

**Missing dependencies with fallback:**
- Live corpus population — operator action from Phase 134 handoff; gates correctly show gaps when empty.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/human-quality/sampling --passWithNoTests` |
| Full suite command | `cd app && npm test -- tests/unit/human-quality tests/unit/release/real-quality-release-evidence.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAMPLE-01 | Canonical thresholds exported; modules re-export same values | unit | `cd app && npm test -- tests/unit/human-quality/sampling/thresholds.test.ts -x` | ❌ Wave 0 |
| SAMPLE-01 | Trend constants defined for Phase 136 | unit | `cd app && npm test -- tests/unit/human-quality/sampling/thresholds.test.ts -x` | ❌ Wave 0 |
| SAMPLE-02 | `additionalNeeded` computed per gate when below minimum | unit | `cd app && npm test -- tests/unit/human-quality/sampling/guidance.test.ts -x` | ❌ Wave 0 |
| SAMPLE-02 | Impact/calibration reports include `sampleGuidance` when insufficient | unit | `cd app && npm test -- tests/unit/human-quality/impact/report.test.ts tests/unit/human-quality/calibration/aggregate.test.ts -x` | ✅ extend |
| SAMPLE-03 | Evidence sections carry `evidenceSource`; no blended denominators | unit | `cd app && npm test -- tests/unit/release/real-quality-release-evidence.test.ts -x` | ✅ extend |
| SAMPLE-03 | Child evidence checkers validate guidance + source tags | unit | `cd app && npm test -- tests/unit/human-quality/sampling/evidence-honesty.test.ts -x` | ❌ Wave 0 |
| SAMPLE-04 | Coverage report lists cross-gate slice gaps | unit | `cd app && npm test -- tests/unit/human-quality/sampling/coverage.test.ts -x` | ❌ Wave 0 |
| SAMPLE-04 | Panel renders coverage gaps from API | component | `cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -x` | ✅ extend |
| SAMPLE-04 | Coverage API enforces platform-owner auth | integration | `cd app && npm test -- src/app/api/feedback/sample-coverage/route.test.ts -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/human-quality/sampling --passWithNoTests`
- **Per wave merge:** `cd app && npm test -- tests/unit/human-quality tests/unit/release/real-quality-release-evidence.test.ts`
- **Phase gate:** `cd app && npm run build` + full human-quality unit suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/human-quality/sampling/thresholds.test.ts` — SAMPLE-01 constant consolidation
- [ ] `tests/unit/human-quality/sampling/guidance.test.ts` — SAMPLE-02 `additionalNeeded` math
- [ ] `tests/unit/human-quality/sampling/coverage.test.ts` — SAMPLE-04 cross-gate rollup
- [ ] `tests/unit/human-quality/sampling/evidence-honesty.test.ts` — SAMPLE-03 checker rules
- [ ] `src/app/api/feedback/sample-coverage/route.test.ts` — auth + response shape
- [ ] Extend existing `impact/report.test.ts`, `calibration/aggregate.test.ts`, `HumanQualityCorpusPanel.test.tsx`, `real-quality-release-evidence.test.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Platform-owner auth on coverage API (reuse calibration access) |
| V3 Session Management | no | Read-only reports |
| V4 Access Control | yes | Workspace scoping; no cross-tenant leakage in coverage counts |
| V5 Input Validation | yes | Zod on API query params (`workspaceId`, `cohort`) |
| V6 Cryptography | no | No new secrets |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace corpus enumeration | Information disclosure | Auth + workspace filter on coverage service |
| Over-claiming quality from fixtures | Tampering (evidence honesty) | `evidenceSource` tags + checker rejects blended metrics |
| DoS via unbounded coverage aggregation | Denial of service | Reuse report row caps (calibration 500, impact truncation flags) |

## Project Constraints (from .cursor/rules/)

No `.cursor/rules/` directory in workspace root [VERIFIED: glob 2026-06-17]. Follow `app/AGENTS.md` Next.js breaking-change notice when touching App Router routes.

## Sources

### Primary (HIGH confidence)
- `app/src/server/human-quality/calibration/report.ts` — MIN constants, `insufficient_corpus`
- `app/src/server/human-quality/impact/report.ts` — impact mins, `insufficientReasons`
- `app/src/server/human-quality/improvement/reevaluate.ts` — per-reason slice gates, `fixtureMetrics`
- `app/scripts/check-real-quality-release-evidence.mjs` — QA-23 separation, aggregate structure
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` — operator tabs, insufficient UI
- `.planning/REQUIREMENTS.md` — SAMPLE-01..04 definitions
- `.planning/phases/134-live-corpus-operations/134-CONTEXT.md` — Phase 135 boundary

### Secondary (MEDIUM confidence)
- `.planning/phases/131-learning-impact-measurement/131-RESEARCH.md` — insufficient_sample patterns
- `.planning/phases/130-score-calibration-and-rubric-alignment/130-RESEARCH.md` — calibration thresholds
- `app/src/server/performance/hypothesis/compare.ts` — `insufficient_evidence` verdict precedent

### Tertiary (LOW confidence)
- `TREND_MIN_TIME_BUCKETS=2` — ASSUMED; needs owner confirmation (see Assumptions Log A2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — brownfield modules verified in codebase
- Architecture: HIGH — clear gaps between existing silos and SAMPLE requirements
- Pitfalls: HIGH — derived from Phase 130–133 checker behavior and panel inspection

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable domain; threshold values may need product confirmation)

## RESEARCH COMPLETE

**Phase:** 135 - Sampling Sufficiency and Evidence Honesty
**Confidence:** HIGH

### Key Findings
- Thresholds exist but are duplicated across calibration (5/3), impact (5/3), and improvement (3 per reason) with inconsistent status labels.
- SAMPLE-02 requires structured `sampleGuidance` with `additionalNeeded` — not just `insufficientReasons` codes or hardcoded UI prose.
- QA-23 aggregate separation is solid; SAMPLE-03 needs `evidenceSource` tags propagated to child evidence JSON and checkers.
- SAMPLE-04 needs a new `sampling/coverage` service + operator API — slice gaps are per-tab today.
- Trend thresholds must be defined in 135 as constants for Phase 136; no chart UI in this phase.

### File Created
`.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Verified existing modules and constants |
| Architecture | HIGH | Clear consolidation path via `sampling/` module |
| Pitfalls | HIGH | Grounded in checker scripts and panel code |

### Open Questions
- Canonical status enum: keep `insufficient_corpus` vs normalize to `insufficient_sample`
- `TREND_MIN_TIME_BUCKETS` value for trend sufficiency
- Workspace vs global default for coverage API

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
