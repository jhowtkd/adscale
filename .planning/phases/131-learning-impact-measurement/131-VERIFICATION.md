---
phase: 131-learning-impact-measurement
verified: 2026-06-17T13:25:00Z
status: human_needed
score: 17/17 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live evidence generation on staging DB with ≥5 evaluated corpus items in both arms"
    expected: "`npx tsx scripts/run-learning-impact.ts --all-workspaces` writes 131-EVIDENCE.json with status=ok, populated slices, non-null globalVisualScoreDelta and deltaLearnedMinusNonLearned. Checker passes against the live file (not just the template)."
    why_human: "Requires staging DB seeded with both learned and non-learned arms; cannot run from verifier sandbox without DB credentials and seeded fixtures."
  - test: "End-to-end attribution flow: accept output-learning recommendation → generate → corpus → evaluate"
    expected: "New corpus item shows `qualitySnapshot.outputLearningApplication.applied=true` with `resolution=recorded`; subsequent impact report rows include this item with `learningApplied=true` and `applicationResolution=recorded`."
    why_human: "Requires running app with a real campaign, output-learning recommendation, and human evaluation — visual flow not testable via grep."
  - test: "Impact tab UI under platform-owner and workspace-admin sessions"
    expected: "Impact tab visible alongside Queue and Calibration; learned/non-learned counts, slice table, intent/visual/factual sections render distinctly; `insufficient_sample` message replaces global delta headline when applicable; tab hidden only when all three APIs return 403 for a non-admin member."
    why_human: "Visual layout, tab visibility under different auth scopes, and conditional rendering require human inspection."
---

# Phase 131: Learning Impact Measurement Verification Report

**Phase Goal:** O produto mede se recommendation/prefill de v12.4 realmente melhora outputs em amostras comparaveis, sem inventar conclusao quando faltam dados.

**Verified:** 2026-06-17T13:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

ROADMAP Success Criteria (Plans 01–04 must-haves consolidated):

| #   | Truth                                                                                                                          | Status     | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------- |
| 1   | Generated samples indicate whether output-learning recommendation/prefill was applied                                          | ✓ VERIFIED | `derivations.output_learning_application` jsonb persisted via migration `0045`; API POST and regenerate thread sanitized snapshot; corpus selection merges into qualitySnapshot (`service.ts:184–195`); `resolveLearningApplied` returns `applied===true` (`enrich.ts:11`). |
| 2   | Reports separate learned vs non-learned comparable outputs by client, mode and format                                          | ✓ VERIFIED | `partitionImpactSlices` keys by `${clientProfileId}|${generationMode}|${format}` (`aggregate.ts:10`, `types.ts:88`); arm split uses `learningApplied===true/false` only (no cohort proxy). |
| 3   | Report measures rejection/regeneration intent, human visual score movement and factual pass rate                               | ✓ VERIFIED | `LearningImpactReport` exposes separate `intentMetrics` (`rejectRate`/`regenerateRate` per arm), `visualMovementMetrics` (`deltaLearnedMinusNonLearned`, optional `cohortMovement`), and `factualMetrics` (`learnedFactualPassRate`/`nonLearnedFactualPassRate`) (`types.ts:48–67`, `report.ts:114–152`). Checker denylist blocks blended fields. |
| 4   | Insufficient sample states are explicit and block false claims of improvement                                                  | ✓ VERIFIED | `MIN_GLOBAL_IMPACT_ITEMS=5`, `MIN_ARM_SAMPLE=3`; `resolveReportStatus` emits `insufficientReasons` and `status=insufficient_sample` (`report.ts:85–112`); deltas forced null (`report.ts:70–75, 130–131`); checker enforces `deltaLearnedMinusNonLearned===null` and rejects `improvementClaimed:true` when insufficient (`check-learning-impact-evidence.mjs:142–162`). |

Plan-level must-haves (additional detail beyond ROADMAP SCs):

| #   | Truth                                                                                                                          | Status     | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------- |
| 5   | Every new derivation can persist a bounded output-learning application snapshot in Postgres                                    | ✓ VERIFIED | Migration `0045` adds nullable jsonb; schema `db/schema.ts:649`; `createDerivation` writes via repository (`derivation.ts:55,76`); POST route Zod-validates and sanitizes (`route.ts:32,41,76–91,218`). |
| 6   | Legacy derivations without application metadata resolve to learningApplied=false with resolution not_recorded                  | ✓ VERIFIED | `LEGACY_OUTPUT_LEARNING_APPLICATION_SNAPSHOT` defaults to `applied:false, resolution:"not_recorded"` (`application-schema.ts:10–16`); `resolveLearningApplied` requires `applied===true`; `buildImpactRow` defaults missing snapshot to `not_recorded` (`enrich.ts:40`); `unlabeledCount` tallied. |
| 7   | Regenerate inherits parent outputLearningApplication unless POST overrides                                                     | ✓ VERIFIED | `regenerate/route.ts:193–198` reads `original.outputLearningApplication` and overrides only when `parsed.data.outputLearningApplication` present; result passed to `createDerivation` (`route.ts:215`). |
| 8   | Batch derivation POST applies identical snapshot to every job in the batch                                                     | ✓ VERIFIED | Sanitized `outputLearningApplication` is hoisted above the batch loop (`route.ts:76–91`) and passed identically into each `createDerivation` call (`route.ts:218`). Route test "outputLearningApplication" suite passes (4/4). |
| 9   | Corpus selection freezes outputLearningApplication into qualitySnapshot at selection time                                      | ✓ VERIFIED | `service.ts:184–195`: `storedApplication` from `derivation.outputLearningApplication` is sanitized and merged into the snapshot built by `buildQualitySnapshotFromDerivation`. |
| 10  | Output-learning accept flow threads trace metadata through derivation POST — not performance-learning card                     | ✓ VERIFIED | Only `OutputLearningRecommendationCard.tsx:12,105,125` builds `applicationSnapshot` via `buildApplicationSnapshotFromAccept`; grep over `app/src/components/campaigns` finds no other source. `page.tsx:347–348` wires `payload.applicationSnapshot → setPendingOutputLearningApplication`; `use-campaign-workspace.ts:281–282` injects into POST body; `use-derivations.ts:138–139` includes field. |
| 11  | resolveLearningApplied returns true only when snapshot.applied===true; legacy rows return false                                | ✓ VERIFIED | `enrich.ts:11–17`. Unit tests in `enrich.test.ts` (passing). |
| 12  | Historical corpus items without application metadata report learningApplied=false and unlabeledCount increments                | ✓ VERIFIED | `buildImpactRows` increments `unlabeledCount` when `applicationResolution === "not_recorded"` (`enrich.ts:47–55`); reflected in `learningImpactMetrics.unlabeledCount`. |
| 13  | Impact report partitions evaluated corpus rows into learned vs non-learned arms within client × mode × format slices            | ✓ VERIFIED | `partitionImpactSlices` + `computeSliceComparison` split by `learningApplied` only; cohort is not used for arm assignment. |
| 14  | Report exposes separate `learningImpactMetrics`, `intentMetrics`, `visualMovementMetrics`, `factualMetrics` — never blended    | ✓ VERIFIED | Top-level keys in `LearningImpactReport` (`types.ts:69–81`); checker denylist (`BLENDED_FIELD_DENYLIST`) rejects `overallImpactScore`, `qualityImprovementPathRate`, etc. |
| 15  | Reject and regenerate intent rates are computed per arm from human evaluation intent field                                     | ✓ VERIFIED | `computeArmMetrics` counts `intent==='reject'` / `intent==='regenerate'` (`aggregate.ts:39–50`); `buildIntentMetrics` returns per-arm rates (`report.ts:29–45`). |
| 16  | When global evaluated count < 5 or a slice lacks ≥3 items in either arm, status is insufficient_sample and movement deltas null | ✓ VERIFIED | `resolveReportStatus` enforces global ≥5 and at least one comparable slice; `comparability` falls back to `insufficient` per slice when arm count < 3; deltas nulled (`report.ts:70–131`). |
| 17  | CLI generates `131-EVIDENCE.json` with multi-workspace rollup + cohort filter; evidence checker rejects improvement claims when insufficient; checker validates separated buckets; Impact tab renders honest UX; platform-owner and workspace admin can access | ✓ VERIFIED | `scripts/run-learning-impact.ts` (4.9KB) supports `--all-workspaces`/`--workspace-id`/`--cohort`/`--out`; `check-learning-impact-evidence.mjs` enforces shape + honesty + denylist (8.0KB); template JSON passes checker; `HumanQualityCorpusPanel.tsx:149,260,309–323` renders Impact tab with insufficient-sample messaging; API uses `requireCalibrationAccess` and caps rows at 100. Route tests pass: 403 forbidden, platform-owner global, workspace-admin scoped, truncation, invalid query. |

**Score:** 17/17 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/src/server/human-quality/application-schema.ts` | Zod validation + sanitization for snapshot | ✓ VERIFIED | Exports `outputLearningApplicationSchema`, `sanitizeOutputLearningApplication`, `buildApplicationSnapshotFromAccept`, `OUTPUT_LEARNING_APPLICATION_SCHEMA_VERSION`. Used by API routes and service.ts. |
| `app/drizzle/0045_derivation_output_learning_application.sql` | jsonb column on derivations | ✓ VERIFIED | `ADD COLUMN IF NOT EXISTS "output_learning_application" jsonb` against `adscale_app.derivations`. |
| `app/src/server/human-quality/corpus.ts` | `OutputLearningApplicationSnapshot` type extends `HumanQualityQualitySnapshot` | ✓ VERIFIED | Lines 45–60 define type and resolution enum; line 74 extends snapshot. |
| `app/src/app/api/campaigns/[id]/derivations/route.ts` | POST accepts optional bounded snapshot | ✓ VERIFIED | Zod-parse on body field; sanitize before passing identically into each batch `createDerivation` call. |
| `app/src/server/human-quality/impact/enrich.ts` | `resolveLearningApplied`, `buildImpactRow`, `buildImpactRows` | ✓ VERIFIED | All three exported; legacy resolution defaults to `not_recorded`. |
| `app/src/server/human-quality/service.ts` | Selection merges `derivation.outputLearningApplication` into qualitySnapshot | ✓ VERIFIED | Lines 27, 184–195. |
| `app/src/components/campaigns/OutputLearningRecommendationCard.tsx` | Accept passes applicationSnapshot to derivation flow | ✓ VERIFIED | Imports `buildApplicationSnapshotFromAccept`; emits `{ prefill, applicationSnapshot }` on accept. |
| `app/src/server/human-quality/impact/report.ts` | `buildLearningImpactReport`, `MIN_GLOBAL_IMPACT_ITEMS`, `MIN_ARM_SAMPLE` | ✓ VERIFIED | Constants and builder exported; status gates enforce nullable deltas when insufficient. |
| `app/src/server/human-quality/impact/aggregate.ts` | `partitionImpactSlices`, `computeArmMetrics`, `computeSliceComparison` | ✓ VERIFIED | Plus `computeGlobalVisualDelta`, `computeCohortMovement`. |
| `app/src/server/human-quality/impact/service.ts` | `runLearningImpact` orchestrates repo → enrich → report | ✓ VERIFIED | Calls `listEvaluatedCorpusWithEvaluations` (limit 500), `buildImpactRows`, `buildLearningImpactReport`. Returns `{ report }`. |
| `app/scripts/run-learning-impact.ts` | CLI evidence generation | ✓ VERIFIED | Flags `--out`, `--all-workspaces`, `--workspace-id`, `--cohort`; writes evidence JSON with `verifiedAt` + `requirements` array including all 4 IDs. |
| `app/scripts/check-learning-impact-evidence.mjs` | CI schema + honesty validator | ✓ VERIFIED | Validates schema, separated buckets, required requirement IDs, blended-field denylist, and insufficient_sample honesty gates. Optional `--skip-tests`. |
| `.planning/phases/131-learning-impact-measurement/131-EVIDENCE.template.json` | ok + insufficient_sample example shapes | ✓ VERIFIED | Both shapes present (root + `_schemaExamples.insufficient_sample`); passes checker. |
| `app/src/app/api/feedback/learning-impact/route.ts` | GET impact report | ✓ VERIFIED | `requireCalibrationAccess`, Zod query validation, MAX_API_ROWS=100 with `truncated`/`totalRowCount` flags. |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Impact tab | ✓ VERIFIED | Tab added at line 149; `ImpactReportView` subcomponent renders status, learned/non-learned counts, slice table, intent/visual/factual sections separately; insufficient-sample message replaces global-delta headline. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `derivations/route.ts` | `derivation.outputLearningApplication` | Zod parse + sanitize + createDerivation per batch | ✓ WIRED | Lines 32–41, 76–91, 218 in route; lines 55, 76 in `repositories/derivation.ts`. |
| `regenerate/route.ts` | `parent.outputLearningApplication` | Inherit parent on child create | ✓ WIRED | Lines 29, 139, 193–198, 215. |
| `OutputLearningRecommendationCard.tsx` | `derivations` POST | `useDerivationFlow.pendingOutputLearningApplication` → `useCampaignWorkspace` → `useCreateDerivations` body | ✓ WIRED | `OutputLearningRecommendationCard.tsx:125` → `page.tsx:347–348` → `use-derivation-flow.ts:20–22` → `use-campaign-workspace.ts:48–51,281–282` → `use-derivations.ts:131,138–139`. |
| `human-quality/service.ts` | `derivation.outputLearningApplication` | `selectDerivationForCorpus` merges into qualitySnapshot | ✓ WIRED | Lines 27, 184–195. |
| `impact/service.ts` | `listEvaluatedCorpusWithEvaluations` | repository join → enrich → aggregate → report | ✓ WIRED | Direct call (line 25); limit 500 matches calibration default. |
| `impact/report.ts` | `impact/aggregate.ts` | `buildLearningImpactReport` calls `partitionImpactSlices` and arm metrics | ✓ WIRED | Lines 1–8, 121–124. |
| `impact/aggregate.ts` | `ImpactEvaluatedRow.learningApplied` | arm split | ✓ WIRED | `computeSliceComparison` filters by `learningApplied===true/false` (lines 59–60). |
| `scripts/run-learning-impact.ts` | `runLearningImpact` | tsx CLI with flags | ✓ WIRED | Imports service; passes parsed flags; writes evidence JSON. |
| `HumanQualityCorpusPanel.tsx` | `/api/feedback/learning-impact` | `useQuery` keyed on workspaceId + cohortFilter | ✓ WIRED | Line 183 fetch; line 660 useQuery; tab rendered when active. |
| `check-learning-impact-evidence.mjs` | `131-EVIDENCE.template.json` | schema + honesty validation | ✓ WIRED | Default evidence path resolves to template; checker run produces "passed". |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `ImpactReportView` (HumanQualityCorpusPanel.tsx) | `report` (from `impactQuery.data`) | `apiFetch('/api/feedback/learning-impact')` (`HumanQualityCorpusPanel.tsx:183`) | Yes — API calls `runLearningImpact` which queries `listEvaluatedCorpusWithEvaluations` | ✓ FLOWING |
| `runLearningImpact` (impact/service.ts) | `evaluatedRows` | `listEvaluatedCorpusWithEvaluations` (real Drizzle repository, not stub) | Yes — real DB join | ✓ FLOWING |
| `selectDerivationForCorpus` (service.ts) | `outputLearningApplication` | `derivation.outputLearningApplication` (Drizzle row) | Yes — read from real jsonb column | ✓ FLOWING |
| `createDerivation` (repositories/derivation.ts) | `outputLearningApplication` write | `data.outputLearningApplication` (sanitized snapshot from route) | Yes — persisted to jsonb | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Impact unit suite | `npm test -- tests/unit/human-quality/impact` | 4 files, 34 tests passed | ✓ PASS |
| Impact API + Panel tests | `npm test -- src/app/api/feedback/learning-impact src/components/feedback/HumanQualityCorpusPanel.test.tsx` | 2 files, 13 tests passed | ✓ PASS |
| Derivations route attribution tests | `npm test -- 'src/app/api/campaigns/[id]/derivations/route.test.ts' -t outputLearningApplication` | 1 file, 4 tests passed | ✓ PASS |
| Evidence checker on template | `node app/scripts/check-learning-impact-evidence.mjs --evidence .planning/phases/131-learning-impact-measurement/131-EVIDENCE.template.json --skip-tests` | "Learning impact evidence check passed." | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| IMPACT-01   | 131-01, 131-02, 131-04 | System can measure whether v12.4 output-learning recommendation/prefill was applied for a generated sample | ✓ SATISFIED | Migration `0045`, snapshot schema + sanitizer, derivation create/regenerate threading, accept-flow wiring, corpus freeze, `resolveLearningApplied`. |
| IMPACT-02   | 131-03, 131-04 | Evaluation separates learned outputs from non-learned comparable outputs by client, mode and format | ✓ SATISFIED | `partitionImpactSlices` keys on `clientProfileId|generationMode|format`; arm split by `learningApplied`. |
| IMPACT-03   | 131-03, 131-04 | Impact report measures rejection/regeneration intent, human visual score movement and factual pass rate | ✓ SATISFIED | Separated `intentMetrics`, `visualMovementMetrics`, `factualMetrics` buckets enforced by checker denylist. |
| IMPACT-04   | 131-03, 131-04 | If evidence is insufficient, report returns honest insufficient-sample state instead of claiming improvement | ✓ SATISFIED | `MIN_GLOBAL_IMPACT_ITEMS=5`, `MIN_ARM_SAMPLE=3`, status gates null deltas, checker rejects non-null deltas + `improvementClaimed:true` when insufficient. |

REQUIREMENTS.md cross-check: all 4 IDs (IMPACT-01, IMPACT-02, IMPACT-03, IMPACT-04) are mapped to Phase 131 and are claimed by at least one PLAN (see source-plans column). No orphans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None blocking | — | No TODO/FIXME/HACK/PLACEHOLDER comments found in created/modified Plan 131 files; no static empty-array returns in routes; no `console.log`-only handlers; no hardcoded empty props at call sites for `ImpactReportView`. |

### Human Verification Required

1. **Live evidence generation on staging DB with ≥5 evaluated corpus items in both arms**
   - Run: `cd app && npx tsx scripts/run-learning-impact.ts --all-workspaces`
   - Expected: `131-EVIDENCE.json` shows `status: "ok"`, populated `learningImpactMetrics.slices`, non-null `globalVisualScoreDelta` and `deltaLearnedMinusNonLearned`. Then `node app/scripts/check-learning-impact-evidence.mjs --evidence .planning/phases/131-learning-impact-measurement/131-EVIDENCE.json --skip-tests` passes.
   - Why human: Requires staging DB credentials and seeded fixtures.

2. **End-to-end attribution flow**
   - Accept an output-learning recommendation on a campaign → generate derivations → add the resulting item to human-quality corpus → evaluate.
   - Expected: New corpus item shows `qualitySnapshot.outputLearningApplication.applied=true` with `resolution=recorded`; the next impact report row for that item shows `learningApplied=true`, `applicationResolution=recorded`. Performance-learning (NextExperimentRecommendationCard) accept must NOT set the snapshot — re-run and confirm corresponding row is `learningApplied=false`.
   - Why human: Requires running app with real recommendations and visual evaluation flow.

3. **Impact tab UI under platform-owner and workspace-admin sessions**
   - Open Feedback → HumanQualityCorpusPanel as a platform-owner; confirm Impact tab is visible alongside Queue and Calibration.
   - Confirm `ImpactReportView` renders: status badge, learned/non-learned/unlabeled counts, slice comparison table with comparability badges, and separate Intent / Visual movement / Factual sections.
   - When the report is `insufficient_sample`, the headline must show the amber insufficient-sample message and **not** a global delta number.
   - As a non-admin member of a workspace, confirm the entire panel is hidden only when queue, calibration AND impact APIs all return 403 (extended hide logic).
   - Why human: Visual layout, tab visibility under different auth scopes, and conditional rendering require human inspection.

### Gaps Summary

No blocking gaps. All 17 must-haves verified against the codebase (database migration, sanitization schema, end-to-end accept→persist→corpus→enrich→aggregate→report flow, CLI evidence generation, CI honesty checker, dual-auth API with row truncation, and Impact tab UI with separated metric sections and explicit insufficient-sample messaging). All 4 requirement IDs are satisfied by implementation evidence. Anti-pattern scan is clean. All automated test suites pass (34 impact unit tests, 13 API/panel tests, 4 derivations-route attribution tests, evidence checker on template).

The status is `human_needed` because three goal-critical behaviors cannot be verified without running the app:
- Live multi-workspace evidence generation against a real staging DB.
- The end-to-end accept→evaluate attribution flow (visual UX + real recommendation/evaluation cycle).
- Visual confirmation of the Impact tab layout, separated metric sections, insufficient-sample messaging, and the extended panel hide-when-forbidden logic under platform-owner/workspace-admin/non-admin sessions.

---

_Verified: 2026-06-17T13:25:00Z_
_Verifier: Claude (gsd-verifier)_
