# Phase 136: Quality Trend Dashboard - Research

**Researched:** 2026-06-18
**Domain:** Live human-quality time-series aggregation, owner-facing trend UI, evidence drilldown, sampling-honest trend gates
**Confidence:** HIGH

## Summary

Phase 136 is the **first time-series layer** on top of the v12.5/v12.6 human-quality infrastructure. Phases 129–135 delivered evaluated corpus rows in Postgres, snapshot reports (calibration, impact, quality improvement), canonical sampling thresholds, and a Coverage tab with a `trend_global` gate placeholder — but **no trend engine, API, or chart UI exists yet** [VERIFIED: grep for `buildTrend` / `quality-trend` returns zero matches in `app/`].

The brownfield already provides everything needed to build trends without new infrastructure:
- **Data source:** `listEvaluatedCorpusWithEvaluations()` joins `human_quality_corpus_items` + `human_quality_evaluations`, ordered by `selectedAt`, limit 500 [VERIFIED: `human-quality-corpus.ts:158-185`]
- **Time axis:** `human_quality_evaluations.created_at` is the human-judgment timestamp [VERIFIED: `schema.ts:1649`]
- **Slice dimensions:** `clientProfileId`, `generationMode`, `format`, `primaryFailureReason` on item + evaluation [VERIFIED: `schema.ts:1563-1573`, `compare.ts:37-48`]
- **Thresholds:** `TREND_GLOBAL_MIN_EVALUATED=5`, `TREND_SLICE_MIN=3`, `TREND_MIN_TIME_BUCKETS=2` in `sampling/thresholds.ts` [VERIFIED: `thresholds.ts:5-7`]
- **Charts:** `recharts@3.8.1` already used via dynamic import in `CreditChart.tsx` and `CreditHistoryTab.tsx` [VERIFIED: `package.json:75`, `CreditChart.tsx:9-31`]
- **Panel pattern:** `HumanQualityCorpusPanel` with ResponsiveTabs, cohort filter, per-tab report views, `SampleGuidanceList`, bounded `corpusItemId` drilldown tables, and 403-hide when **all five** APIs return 403 [VERIFIED: `HumanQualityCorpusPanel.tsx:233-305, 1313-1333`]

**Critical gaps for TREND-01..04:**
1. No `human-quality/trend/` module — bucketing, aggregation, status flags, and evidence refs must be built.
2. No `buildTrendGuidance()` — `trend_global` gate in `coverage.ts` only checks global count ≥ 5 [VERIFIED: `coverage.ts:117-153`].
3. Repository filters lack `generationMode`, `format`, `clientProfileId`, `primaryFailureReason` — TREND-02 cannot be server-honest without extending `ListEvaluatedCorpusWithEvaluationsFilters`.
4. No `LineChart` usage yet — only `BarChart`; trend series should follow the same dynamic-import + CSS variable color pattern.
5. Panel hide logic must add a **sixth** API (`quality-trend`) per Phase 135 precedent (each new tab extends the all-403 gate).
6. No `stale` / `regression` flag contract — TREND-03 requires explicit separate alert types, not a blended `insufficient_sample`.

**Primary recommendation:** Add `app/src/server/human-quality/trend/` (`bucket.ts`, `aggregate.ts`, `report.ts`, `service.ts`, `types.ts`) plus `buildTrendGuidance()` in `sampling/guidance.ts`; expose `GET /api/feedback/quality-trend` with dimensional filters; add a **Trend** tab on `HumanQualityCorpusPanel` using recharts `LineChart` for mean visual score, factual pass rate, and per-bucket learning-impact status; attach bounded `evidenceRefs` per bucket for TREND-04; mirror Phase 130–135 with `run-quality-trend.ts` evidence CLI and vitest coverage.

<user_constraints>
## User Constraints (from STATE.md — no Phase 136 CONTEXT.md)

### Locked Decisions
- [v12.6]: Turn quality infrastructure into a live operating loop; surface live quality, factuality and learning-impact trends for owner decisions.
- [v12.6]: Small datasets must yield `insufficient_sample`, not optimistic claims; separate operational evidence from technical green checks.
- [Phase 129]: Corpus inclusion is explicit/manual; Postgres canonical; platform-owner auth on human-quality APIs; no prompts/signed URLs in corpus payloads.
- [Phase 130]: Global evaluated minimum 5 for calibration `ok`; slice proposals need ≥3 items; panel hides when queue **and** calibration APIs both 403.
- [Phase 131]: Learning impact nulls movement deltas when `insufficient_sample`; slice key `clientProfileId|generationMode|format`.
- [Phase 132]: Panel hides when queue, calibration, impact, and quality APIs all return 403.
- [Phase 135]: Canonical sampling in `human-quality/sampling/`; `TREND_*` constants defined; `trend_global` coverage gate is placeholder only; trend charts deferred to Phase 136 [VERIFIED: `135-03-SUMMARY.md:41-42`].
- [Phase 135]: Panel hides when queue, calibration, impact, quality **and coverage** APIs all return 403 [VERIFIED: `HumanQualityCorpusPanel.tsx:1317-1330`].
- [Phase 135]: Coverage tab is dedicated (not Queue summary card); `evaluatedItemCount` sourced from calibration report for cross-tab consistency.

### Claude's Discretion
- Weekly vs calendar-month time buckets (recommend ISO week aligned with Phase 134 weekly batch ops).
- Regression detection threshold (recommend visual mean drop ≥ 5 points between consecutive sufficient buckets).
- Stale-evidence window (recommend flag when `latestEvaluatedAt > capturedAt` or new evaluations since last evidence CLI run).
- Trend tab vs extending Coverage tab (recommend dedicated Trend tab per TREND-01 scope).
- Plan wave count (2–3 plans: trend engine + API vs UI + evidence CLI).
- Whether learning-impact status over time is per-bucket `ok|insufficient_sample` or a numeric delta series (recommend status badge per bucket + optional delta when comparable).

### Deferred Ideas (OUT OF SCOPE)
- Operational release gate rerun (Phase 137 — QALIVE-01..04).
- Statistical significance / p-values — corpus N too small; descriptive gates only (Phase 131 precedent).
- Automatic corpus inclusion or multi-reviewer agreement.
- Changing `TREND_*` numeric thresholds without operator sign-off.
- Fixture-based trend lines — trends are **live human corpus only**; fixture metrics stay on Quality tab with `evidenceSource: fixture` badge.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TREND-01 | Owner can view live human quality trend, factual pass rate and learning-impact status over time | `trend/report.ts` buckets by `evaluation.createdAt`; series: `meanHumanVisualScore`, `factualPassRate`, `learningImpactStatus` per bucket; Trend tab + recharts `LineChart`; gate withholds direction when `< TREND_MIN_TIME_BUCKETS` |
| TREND-02 | Owner can filter trends by workspace, mode, format, client profile and visible failure reason | Extend repository filters + zod query schema on `GET /api/feedback/quality-trend`; UI filter row alongside existing cohort select |
| TREND-03 | Dashboard flags regressions, stale evidence and insufficient live corpus coverage separately | `TrendAlertFlags` object with three independent booleans + reasons; insufficient reuses `sampleGuidance`; stale compares `capturedAt` vs `latestEvaluatedAt`; regression compares consecutive sufficient buckets |
| TREND-04 | Dashboard links each aggregate back to bounded corpus evidence for auditability | `TrendBucketEvidenceRef` with `corpusItemIds[]` + `itemRefs[]` capped at 100; expandable drilldown table matching Calibration/Impact row pattern |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Time bucketing & metric aggregation (TREND-01) | API / Backend (`human-quality/trend`) | — | Pure functions over evaluated rows; same data contract as calibration/impact |
| Dimensional filtering (TREND-02) | API / Backend (repository + zod query) | Browser (filter controls) | Server must apply filters before aggregation — client-side filter would lie about sample sufficiency |
| Regression / stale / insufficient flags (TREND-03) | API / Backend (`trend/report.ts`) | Browser (alert chips) | Flags depend on full corpus timestamps and bucket math — not derivable from chart pixels alone |
| Evidence drilldown refs (TREND-04) | API / Backend (bounded refs in report) | Browser (read-only table) | API caps at 100 items like calibration/impact routes [VERIFIED: `score-calibration/route.ts:8,35-50`] |
| Trend charts (TREND-01) | Browser (`HumanQualityCorpusPanel` Trend tab) | — | recharts client-only dynamic import; no SSR chart rendering |
| Sampling guidance for trends | API / Backend (`sampling/guidance.ts`) | Coverage rollup (update `trend_global` gate) | Single honesty module; coverage already lists `trend_global` placeholder |
| Auth | API / Backend (`requireCalibrationAccess`) | — | Phase 130 precedent for all human-quality read APIs |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project pin | Trend types, pure aggregation | Brownfield Phases 129–135 pattern |
| Drizzle ORM | project pin | Evaluated corpus queries | Existing `listEvaluatedCorpusWithEvaluations` |
| Zod | ^3.0.0 [VERIFIED: `package.json`] | API query validation | Same as `score-calibration/route.ts:10-13` |
| recharts | 3.8.1 [VERIFIED: npm registry 2026-06-18] | Line charts for trend series | Already installed; `CreditChart` establishes dynamic-import + CSS token pattern |
| Vitest | ^4.1.5 (registry 4.1.9) [VERIFIED: npm registry] | Unit tests for bucket/aggregate/report | `app/config/vitest.config.ts` |
| `@tanstack/react-query` | project pin | Trend tab data fetching | Existing panel queries |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `human-quality/sampling/thresholds.ts` | — | `TREND_*` gates | Import — do not duplicate constants |
| `human-quality/sampling/guidance.ts` | — | `buildTrendGuidance()` | Add trend-specific guidance builder |
| `human-quality/impact/enrich.ts` | — | `buildImpactRow`, `resolveLearningApplied` | Reuse for per-bucket learning-impact status |
| `tsx` | project pin | `run-quality-trend.ts` evidence CLI | Mirror `run-sample-coverage.ts` |
| Node `fs` + JSON | — | `.planning/phases/136-*` evidence | Phase 137 precursor |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `trend/` module | Extend `coverage.ts` with time series | Coverage is snapshot-only by design [VERIFIED: `135-RESEARCH.md` Pitfall 4] |
| recharts LineChart | Chart.js / custom SVG | recharts already a dependency; BarChart pattern exists |
| `selectedAt` bucketing | `evaluation.createdAt` | selectedAt is corpus enqueue time, not judgment time — wrong for "quality over time" |
| Client-side filter after fetch | Server-side repository filters | Would fetch 500 rows then filter — breaks sufficiency counts and leaks cross-slice data in API payload |
| Daily buckets | ISO week buckets | Weekly aligns with Phase 134 controlled weekly batch ops [VERIFIED: `REQUIREMENTS.md` LIVEQUAL-01] |

**Installation:** None — no new npm dependencies.

**Version verification:**
```bash
npm view recharts version  # → 3.8.1
npm view vitest version    # → 4.1.9
```

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Postgres: human_quality_corpus_items ⨝ human_quality_evaluations             │
│  (evaluated rows, evaluation.createdAt as trend time axis)                   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ listEvaluatedCorpusWithEvaluations (extended filters for TREND-02)           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ human-quality/trend/                                                         │
│  bucket.ts   → group rows into ISO-week buckets                              │
│  aggregate.ts → per bucket: meanVisual, factualPassRate, impactStatus        │
│  report.ts   → status, TrendAlertFlags, sampleGuidance, evidenceRefs         │
│  service.ts  → orchestrate + latestEvaluatedAt for stale detection           │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ GET quality-trend│  │ run-quality-trend│  │ sampling/guidance │
│ API (auth)       │  │ .ts evidence CLI │  │ buildTrendGuidance│
└────────┬─────────┘  └──────────────────┘  └────────┬─────────┘
         │                                            │
         ▼                                            ▼
┌──────────────────┐                    ┌──────────────────────────┐
│ HumanQuality     │                    │ coverage.ts trend_global  │
│ CorpusPanel      │                    │ gate uses real trend status│
│ Trend tab +      │                    └──────────────────────────┘
│ LineChart +      │
│ drilldown table  │
└──────────────────┘
```

### Recommended Project Structure

```
app/src/server/human-quality/trend/
├── types.ts        # QualityTrendReport, TrendBucket, TrendAlertFlags, evidence refs
├── bucket.ts       # assignBucketKey(evaluatedAt), groupRowsByBucket
├── aggregate.ts    # computeBucketMetrics, detectRegression
├── report.ts       # buildQualityTrendReport
└── service.ts      # runQualityTrend

app/src/app/api/feedback/quality-trend/route.ts
app/scripts/run-quality-trend.ts
app/scripts/check-quality-trend-evidence.mjs   # optional Phase 136 checker

app/tests/unit/human-quality/trend/
├── bucket.test.ts
├── aggregate.test.ts
└── report.test.ts
```

### Pattern 1: ISO-Week Time Bucketing

**What:** Group evaluated rows by ISO week of `evaluation.createdAt` (UTC). Empty weeks are omitted from series (sparse chart) but counted toward `populatedBucketCount`.

**When to use:** Default granularity for v12.6 weekly operational loop.

**Example:**

```typescript
// Pattern derived from CreditHistoryTab date grouping [VERIFIED: CreditHistoryTab.tsx:85-94]
export function bucketKeyForDate(date: Date): string {
  // ISO week: YYYY-Www (implement via UTC Thursday reference or date-fns if already in project)
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ... standard ISO week algorithm
  return `${year}-W${week.toString().padStart(2, "0")}`;
}

export function groupEvaluatedRowsByBucket(rows: EvaluatedCorpusRow[]): Map<string, EvaluatedCorpusRow[]> {
  const buckets = new Map<string, EvaluatedCorpusRow[]>();
  for (const row of rows) {
    const key = bucketKeyForDate(row.evaluation.createdAt);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  return buckets;
}
```

### Pattern 2: Honest Trend Status (mirrors calibration/impact)

**What:** Global trend direction withheld until `evaluatedItemCount >= TREND_GLOBAL_MIN_EVALUATED` **and** `populatedBucketCount >= TREND_MIN_TIME_BUCKETS`. Per-bucket metrics still shown descriptively when `count > 0` but direction/regression flags require slice minimum `TREND_SLICE_MIN`.

**When to use:** Every `buildQualityTrendReport` call.

**Example:**

```typescript
import {
  TREND_GLOBAL_MIN_EVALUATED,
  TREND_MIN_TIME_BUCKETS,
  TREND_SLICE_MIN,
} from "../sampling/thresholds";
import { buildTrendGuidance } from "../sampling/guidance";

const status =
  evaluatedItemCount >= TREND_GLOBAL_MIN_EVALUATED &&
  populatedBucketCount >= TREND_MIN_TIME_BUCKETS
    ? "ok"
    : "insufficient_sample";

// Movement/regression deltas: null when status !== "ok" OR bucket.count < TREND_SLICE_MIN
```

### Pattern 3: Separate Alert Flags (TREND-03)

**What:** Three independent flags on the report — never collapse into one `warning` string.

| Flag | Trigger | UI treatment |
|------|---------|--------------|
| `insufficientCoverage` | `status === "insufficient_sample"` or any `sampleGuidance.length > 0` | Amber `SampleGuidanceList` (reuse component) |
| `staleEvidence` | `latestEvaluatedAt > capturedAt` OR evaluations added since `evidenceCapturedAt` | Blue/info chip: "Corpus refreshed — re-run evidence CLI" |
| `regressionDetected` | Last two populated buckets both `count >= TREND_SLICE_MIN` AND visual mean drop ≥ threshold | Red chip with bucket labels |

**Stale detection source:** `CorpusOperationsProgress.latestEvaluatedAt` already computed in queue progress [VERIFIED: `human-quality-corpus.ts:288-292`]; trend service should compute `max(evaluation.createdAt)` over filtered rows.

### Pattern 4: Bounded Evidence Drilldown (TREND-04)

**What:** Each `TrendBucket` includes `evidenceRefs` matching calibration adjustment evidence shape (bounded list).

**When to use:** Every bucket with `count > 0`.

**Example:**

```typescript
// Mirrors CalibrationAdjustmentEvidence [VERIFIED: calibration/types.ts:25-38]
export interface TrendBucketEvidenceRef {
  bucketKey: string;
  corpusItemIds: string[];       // max 100
  itemRefs: Array<{
    corpusItemId: string;
    visualScore: number;
    factualPass: boolean;
    evaluatedAt: string;
  }>;
  truncated: boolean;
  totalCount: number;
}
```

**UI:** Expandable section per selected bucket — table columns match Impact rows (`corpusItemId` prefix, visual, factual, evaluatedAt). No deep links to campaign review (out of scope); IDs are audit anchors.

### Pattern 5: Trend Tab on HumanQualityCorpusPanel

**What:** Add `{ id: "trend", label: "Trend" }` to `PANEL_TABS`; fetch `GET /api/feedback/quality-trend`; extend 403-hide to six APIs; add filter row for mode/format/clientProfile/failureReason alongside cohort.

**Chart:** Dynamic-import `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `CartesianGrid` — same SSR-safe pattern as `CreditChart.tsx`. Three lines:
1. `meanHumanVisualScore` (0–100, left axis)
2. `factualPassRate` (0–1, right axis or secondary)
3. `learningImpactStatus` — render as per-bucket badge below chart OR encoded as categorical overlay (discretion: badges under x-axis ticks when `ok|insufficient`)

**When to use:** TREND-01 UI delivery.

### Anti-Patterns to Avoid

- **Plotting fixture archetype scores on the trend chart:** Fixture data lives in `qualityMetrics.fixtureMetrics` — never mix denominators [VERIFIED: Phase 135 Pitfall 3].
- **Computing trends client-side from Calibration tab comparisons:** Comparisons are point-in-time snapshot, not time-bucketed.
- **Using `selectedAt` as trend time:** Misattributes pre-review queue time as quality judgment time.
- **Single combined warning for regression + stale + insufficient:** TREND-03 explicitly requires separate flags.
- **Returning unbounded `corpusItemIds`:** API must cap at 100 with `truncated: true` like other feedback routes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time-series chart rendering | Custom canvas/SVG | recharts `LineChart` (dynamic import) | Already a project dependency with established token styling |
| Sample sufficiency for trends | Ad-hoc `if (n < 5)` in UI | `TREND_*` + `buildTrendGuidance()` | Phase 135 canonical module prevents drift |
| ISO week math (if complex) | Copy-paste from Stack Overflow | Small pure function + vitest fixtures | Testable; avoid adding date-fns unless already used elsewhere for weeks |
| Learning-impact per bucket | Reimplement arm partition | `buildImpactRow` + `computeArmMetrics` from `impact/aggregate.ts` | Same slice key and `learningApplied` resolution |
| Auth on trend API | New middleware | `requireCalibrationAccess` | Phase 130 precedent |
| Statistical trend tests | t-test / confidence bands | Count thresholds + withheld direction | Phase 131 explicit deferral |

**Key insight:** Phase 136 is **aggregation + visualization** over existing evaluated rows — not a new data pipeline. The risk is mixing snapshot-report semantics with time-series semantics or breaking the honesty gates Phase 135 established.

## Common Pitfalls

### Pitfall 1: Trend Global Gate Stays Placeholder After Phase 136

**What goes wrong:** `coverage.ts` `trend_global` still only checks `evaluatedItemCount >= 5` without `TREND_MIN_TIME_BUCKETS`.

**Why it happens:** Placeholder written in Phase 135-03 [VERIFIED: `coverage.ts:117-153`].

**How to avoid:** Wire `buildSampleCoverageReport` to accept optional trend report status OR call `buildTrendGuidance` inside coverage orchestrator.

**Warning signs:** Coverage tab shows `trend_global: ok` with only 5 evaluations in a single week.

### Pitfall 2: Panel Hide Logic Missing Sixth API

**What goes wrong:** Non-owner sees Trend tab fetch errors while panel remains visible.

**Why it happens:** Phase 135 added coverage as fifth gate [VERIFIED: `135-03-SUMMARY.md:44`].

**How to avoid:** Add `trendForbidden` + include in all-403 check; invalidate trend query on evaluation submit.

**Warning signs:** `HumanQualityCorpusPanel.test.tsx` still expects five fetchers only.

### Pitfall 3: Filters Applied After Aggregation

**What goes wrong:** Operator filters by `format=9:16` but sufficiency counts reflect full corpus.

**Why it happens:** Tempting to reuse unfiltered report and filter client-side.

**How to avoid:** Pass filters to `listEvaluatedCorpusWithEvaluations` and recompute all gates on filtered set.

**Warning signs:** `sampleGuidance` counts don't match visible chart points.

### Pitfall 4: Repository Limit Truncates Trend History

**What goes wrong:** 500-row cap drops oldest evaluations silently; early buckets vanish.

**Why it happens:** `DEFAULT_EVALUATED_CORPUS_LIMIT = 500` [VERIFIED: `human-quality-corpus.ts:80`].

**How to avoid:** For trend service, either raise limit with explicit `TREND_MAX_ROWS` constant or add `evaluatedAfter` filter; surface `truncated: true` on report when row count hits limit.

**Warning signs:** `evaluatedItemCount` on trend report < calibration report for same workspace.

### Pitfall 5: Learning-Impact Status Misread as Improvement Claim

**What goes wrong:** Chart shows upward visual line and owner interprets as learning causation.

**Why it happens:** TREND-01 includes learning-impact **status**, not causal delta.

**How to avoid:** Label series "Learning impact comparability (per bucket)"; withhold delta unless both arms ≥ `TREND_SLICE_MIN` in that bucket.

**Warning signs:** Trend evidence checker allows movement claims when `learningImpactStatus === "insufficient_sample"`.

## Code Examples

### API Route Shape (matches existing feedback reports)

```typescript
// Source: pattern from score-calibration/route.ts [VERIFIED]
const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
  generationMode: z.string().optional(),
  format: z.string().optional(),
  clientProfileId: z.string().uuid().optional(),
  primaryFailureReason: z.enum(HUMAN_QUALITY_FAILURE_REASONS).optional(),
});

export async function GET(request: Request) {
  await requireCalibrationAccess(request, parsed.data.workspaceId ?? null);
  const { report } = await runQualityTrend({ ...parsed.data, capturedAt: new Date().toISOString() });
  return NextResponse.json({ report });
}
```

### recharts LineChart Dynamic Import

```typescript
// Source: CreditChart.tsx pattern [VERIFIED: app/src/components/dashboard/CreditChart.tsx]
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
// Use stroke="var(--color-chart-1)" etc. from globals.css chart tokens
```

### Evaluated Row → Bucket Metrics

```typescript
// Source: compare.ts + impact/aggregate.ts patterns [VERIFIED]
function computeBucketMetrics(rows: EvaluatedCorpusRow[]) {
  const n = rows.length;
  const meanHumanVisualScore =
    n === 0 ? null : rows.reduce((s, r) => s + r.evaluation.visualScore, 0) / n;
  const factualPassRate =
    n === 0 ? null : rows.filter((r) => r.evaluation.factualPass).length / n;
  const impactRows = rows.map(buildImpactRow);
  const learned = impactRows.filter((r) => r.learningApplied);
  const nonLearned = impactRows.filter((r) => !r.learningApplied);
  const learningImpactStatus =
    learned.length >= TREND_SLICE_MIN && nonLearned.length >= TREND_SLICE_MIN
      ? "ok"
      : "insufficient_sample";
  return { count: n, meanHumanVisualScore, factualPassRate, learningImpactStatus };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No trend thresholds | `TREND_*` in `sampling/thresholds.ts` | Phase 135 | Phase 136 consumes constants |
| Per-tab snapshot only | Time-bucketed series + snapshot tabs coexist | Phase 136 (target) | Owner sees movement over weeks |
| `trend_global` placeholder | Real trend report drives gate | Phase 136 (target) | Coverage tab honesty improves |
| 5-API panel hide | 6-API panel hide | Phase 136 (target) | Trend tab respects auth |

**Deprecated/outdated:**
- Hardcoded "trend charts deferred to Phase 136" in `blockedClaims` — replace with real guidance once trend engine ships.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ISO week (UTC) is the default bucket granularity | Architecture | Owner may prefer calendar month — add `granularity` query param later |
| A2 | `TREND_MIN_TIME_BUCKETS=2` means two **populated** weeks, not calendar weeks on chart | Pattern 2 | Empty weeks could satisfy gate incorrectly if misimplemented |
| A3 | Regression = visual mean drop ≥ 5 between last two sufficient buckets | Pattern 3 | Threshold may be too sensitive/noisy for small N |
| A4 | Stale = `latestEvaluatedAt > capturedAt` | Pattern 3 | May flag on every page load until cache refresh — acceptable for honesty |
| A5 | `evaluation.createdAt` is the canonical trend timestamp | Pattern 1 | Product may want `selectedAt` for operational throughput view |

## Open Questions

1. **Should trend report include automatic `qualityScore` series?**
   - What we know: Calibration compares automatic vs human at snapshot time; trend is about **live human** quality per REQUIREMENTS.
   - What's unclear: Owner might want automatic score drift for calibration monitoring.
   - Recommendation: **Defer** — TREND-01 lists human visual, factual, learning-impact only; automatic series is a follow-up.

2. **Multi-workspace rollup for platform owner?**
   - What we know: Calibration CLI supports `--all-workspaces` [VERIFIED: `run-score-calibration.ts:34`].
   - What's unclear: Trend dashboard may need global view when no `workspaceId` set.
   - Recommendation: Match calibration API — optional `workspaceId`; without it, platform-owner sees cross-workspace rollup with `truncated` bounds.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tsx scripts, vitest | ✓ | (project) | — |
| PostgreSQL | Evaluated corpus queries | ✓ (dev) | — | Unit tests use in-memory fixtures only |
| recharts | Trend LineChart UI | ✓ | 3.8.1 | None — already installed |
| Platform owner session | API auth | ✓ (seeded) | — | Panel hidden via 403 cascade |

**Missing dependencies with no fallback:** None for Phase 136 implementation.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 (registry 4.1.9) |
| Config file | `app/config/vitest.config.ts` |
| Quick run command | `cd app && npm test -- tests/unit/human-quality/trend/ -x` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TREND-01 | Buckets rows by evaluation week; computes visual + factual series | unit | `cd app && npm test -- tests/unit/human-quality/trend/bucket.test.ts -x` | ❌ Wave 0 |
| TREND-01 | Withholds direction when `< TREND_MIN_TIME_BUCKETS` | unit | `cd app && npm test -- tests/unit/human-quality/trend/report.test.ts -x` | ❌ Wave 0 |
| TREND-02 | Repository/API applies dimension filters before aggregate | unit + route | `cd app && npm test -- tests/unit/human-quality/trend/aggregate.test.ts src/app/api/feedback/quality-trend/route.test.ts -x` | ❌ Wave 0 |
| TREND-03 | Separate regression/stale/insufficient flags | unit | `cd app && npm test -- tests/unit/human-quality/trend/report.test.ts -x` | ❌ Wave 0 |
| TREND-04 | Evidence refs capped at 100 with `truncated` | unit | `cd app && npm test -- tests/unit/human-quality/trend/report.test.ts -x` | ❌ Wave 0 |
| TREND-01..04 | Panel Trend tab renders chart + flags | component | `cd app && npm test -- src/components/feedback/HumanQualityCorpusPanel.test.tsx -x` | ✅ extend existing |

### Sampling Rate

- **Per task commit:** `cd app && npm test -- tests/unit/human-quality/trend/ -x`
- **Per wave merge:** `cd app && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `app/tests/unit/human-quality/trend/bucket.test.ts` — ISO week assignment edge cases
- [ ] `app/tests/unit/human-quality/trend/aggregate.test.ts` — per-bucket metrics + regression detection
- [ ] `app/tests/unit/human-quality/trend/report.test.ts` — status gates, flags, evidence cap
- [ ] `app/src/app/api/feedback/quality-trend/route.test.ts` — auth + zod validation
- [ ] Extend `HumanQualityCorpusPanel.test.tsx` — Trend tab, sixth 403 gate, filter controls
- [ ] `app/scripts/check-quality-trend-evidence.mjs` — optional honesty checker for Phase 137

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireCalibrationAccess` — session required |
| V3 Session Management | yes | Existing session cookies via `getSessionFromHeaders` |
| V4 Access Control | yes | Platform-owner or workspace admin; 403 hides panel |
| V5 Input Validation | yes | Zod query schema; enum validation for cohort/failureReason |
| V6 Cryptography | no | Read-only aggregates; no new secrets |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace data leak via `workspaceId` param | Information disclosure | `requireCalibrationAccess` + repository `workspaceId` filter |
| DoS via unbounded evidence arrays | Availability | Cap `corpusItemIds` at 100 per bucket; report-level `truncated` |
| UUID injection in filters | Tampering | Zod `.uuid()` on `workspaceId` / `clientProfileId` |
| Corpus item ID enumeration | Information disclosure | Same auth gate as calibration comparisons — acceptable for owner/admin role |

## Sources

### Primary (HIGH confidence)
- `app/src/server/human-quality/sampling/thresholds.ts` — TREND_* constants
- `app/src/server/human-quality/sampling/coverage.ts` — trend_global placeholder
- `app/src/server/repositories/human-quality-corpus.ts` — evaluated row query
- `app/src/server/db/schema.ts` — corpus + evaluation columns
- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` — tab/403/drilldown patterns
- `app/src/app/api/feedback/score-calibration/route.ts` — API route template
- `app/src/components/dashboard/CreditChart.tsx` — recharts dynamic import pattern
- npm registry — recharts 3.8.1, vitest 4.1.9

### Secondary (MEDIUM confidence)
- `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-RESEARCH.md` — trend deferral boundary and threshold assumptions
- `.planning/phases/135-sampling-sufficiency-and-evidence-honesty/135-03-SUMMARY.md` — coverage API delivery

### Tertiary (LOW confidence)
- ISO week algorithm inline implementation — validate with vitest fixtures against known dates

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — recharts and vitest verified in repo and registry; no new deps
- Architecture: HIGH — clear extension of calibration/impact module pattern; data model verified in schema
- Pitfalls: MEDIUM — regression threshold and stale semantics are product discretion (assumptions A3–A4)

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stable brownfield); 2026-06-25 if recharts major upgrade
