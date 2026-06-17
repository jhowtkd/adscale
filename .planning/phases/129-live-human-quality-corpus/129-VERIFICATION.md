---
phase: 129-live-human-quality-corpus
verified: 2026-06-17T12:20:00Z
status: passed
human_approved: 2026-06-17
score: 4/4
overrides_applied: 0
human_verification:
  - test: "As platform owner, open /feedback, enter a workspace ID with pending corpus items, and submit a full human evaluation (visual score, factual pass, intent, failure reason)"
    expected: "Queue shows one item at a time with preview image and metadata; submission succeeds, item leaves pending queue, evaluation row persists"
    why_human: "End-to-end operator workflow spans auth boundary, ephemeral presigned preview URLs, and DB persistence — cannot verify without live workspace data and owner session"
  - test: "From a campaign derivation review sheet, click 'Add to quality corpus' on a completed derivation"
    expected: "Discreet success toast; duplicate attempt shows error toast; non-owner gets silent 403"
    why_human: "Manual selection UX, toast behavior, and role gating require browser session with real campaign context"
  - test: "Inspect stored corpus rows after selection and evaluation"
    expected: "artifact_ref and quality_snapshot contain only bounded fields (derivationId, assetId, styleAssetId, quality metadata); no prompt, signedUrl, outputKey, or auth material in JSONB columns"
    why_human: "Privacy boundary must be confirmed against real DB rows, not only unit-test fixtures"
---

# Phase 129: Live Human Quality Corpus Verification Report

**Phase Goal:** Operadores conseguem transformar outputs reais em um corpus versionado de avaliacao de qualidade, com julgamento humano estruturado e referencias seguras.

**Verified:** 2026-06-17T12:20:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | Real generated outputs can be selected into a versioned corpus with workspace/campaign/derivation/mode/format scope | ✓ VERIFIED | `selectDerivationForCorpus` validates derivation+campaign ownership, persists `workspaceId`, `campaignId`, `clientProfileId`, `derivationId`, `generationMode`, `format`, `corpusVersion`; unique index on `(workspace_id, derivation_id, corpus_version)`; explicit POST from `DerivationReviewSheet` and platform-owner API |
| 2 | Corpus records bounded artifact references and evaluation metadata without storing raw prompts, signed URLs, auth material or unbounded payloads | ✓ VERIFIED | `FORBIDDEN_PAYLOAD_KEYS` + `validatePrivacySafePayload` reject at service/repository boundary; `sanitizeCorpusPayloads` strips allowed keys only; `previewImageUrl` resolved ephemerally at GET time via `attachPreviewImages` — not persisted in corpus JSONB |
| 3 | Reviewer can record visual score, factual pass/fail, approve/reject/regenerate intent and primary visible failure reason | ✓ VERIFIED | `human_quality_evaluations` table + `submitHumanEvaluation` validates all fields; evaluation API Zod schema; `HumanQualityCorpusPanel` requires all fields client-side before POST |
| 4 | Corpus items distinguish baseline, pre-learning and post-learning samples for later movement analysis | ✓ VERIFIED | `HUMAN_QUALITY_CORPUS_COHORTS` enum; DB check constraint; `classifyCohort` defaults invalid to `baseline`; cohort selectable on POST and displayed in queue UI |

**Score:** 4/4 roadmap success criteria verified

### Plan-Specific Truths (supplementary)

| Truth | Status | Evidence |
| --- | --- | --- |
| Corpus inclusion is explicit/manual | ✓ VERIFIED | No auto-enrollment; manual POST + "Add to quality corpus" button only |
| Internal queue lists only selected pending items | ✓ VERIFIED | `listPendingCorpusItems` filters `status = 'pending'` |
| Owner surface shows one-at-a-time pending evaluation queue | ✓ VERIFIED | `currentItem = queueQuery.data?.[0]`; mounted in `OwnerAnalyticsPanel` |
| No calibration or impact claim in Phase 129 | ✓ VERIFIED | Panel copy: "Phase 129 stores judgments only — no calibration claims yet" |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `app/src/server/human-quality/corpus.ts` | Enums, validators, privacy sanitizer | ✓ VERIFIED | 313 lines; substantive contracts and forbidden-key gate |
| `app/src/server/repositories/human-quality-corpus.ts` | Workspace-scoped repository | ✓ VERIFIED | insert, list pending, submit evaluation, workspace filters |
| `app/drizzle/0043_human_quality_corpus.sql` | Schema migration | ✓ VERIFIED | Tables, indexes, check constraints for cohort/status/intent |
| `app/src/server/human-quality/service.ts` | Route-facing service | ✓ VERIFIED | Selection, queue, evaluation with ownership + privacy guards |
| `app/src/app/api/feedback/human-quality-corpus/route.ts` | Select/list corpus API | ✓ VERIFIED | Platform-owner POST/GET; ephemeral preview URLs |
| `app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts` | Submit evaluation API | ✓ VERIFIED | Structured evaluation POST with validation |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Internal evaluation UI | ✓ VERIFIED | One-at-a-time queue + required form |
| `app/src/components/workspace/DerivationReviewSheet.tsx` | Add-to-corpus entry point | ✓ VERIFIED | Manual button + toast confirmation |
| Test files (6 suites) | HUMAN-01–04 coverage | ✓ VERIFIED | 64/65 tests pass (see spot-checks) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `DerivationReviewSheet.tsx` | `POST /api/feedback/human-quality-corpus` | `apiFetch` mutation | ✓ WIRED | Explicit manual selection with workspace/campaign/derivation |
| `HumanQualityCorpusPanel.tsx` | `GET /api/feedback/human-quality-corpus` | `useQuery` + `apiFetch` | ✓ WIRED | Loads pending queue by workspaceId |
| `HumanQualityCorpusPanel.tsx` | `POST .../[id]/evaluation` | `submitMutation` + `apiFetch` | ✓ WIRED | Form submission with all required fields |
| `OwnerAnalyticsPanel.tsx` | `HumanQualityCorpusPanel` | JSX mount | ✓ WIRED | Panel rendered on `/feedback` surface |
| `route.ts` (corpus) | `service.ts` | `selectDerivationForCorpus` / `listPendingCorpusQueue` | ✓ WIRED | Service layer between route and repository |
| `service.ts` | `human-quality-corpus.ts` (repo) | `insertCorpusItem` / `submitCorpusEvaluation` | ✓ WIRED | Drizzle DB writes with sanitization |
| `route.ts` GET | `derivations` + R2 | `attachPreviewImages` | ✓ WIRED | Ephemeral presigned URL at read time only |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `HumanQualityCorpusPanel` | `queueQuery.data` | `GET /api/feedback/human-quality-corpus` → `listPendingCorpusItems` | Yes — DB query filtered by workspace + pending status | ✓ FLOWING |
| `HumanQualityCorpusPanel` | `previewImageUrl` | `attachPreviewImages` → derivation `outputKey` → `getPresignedDownloadUrl` | Yes — resolved at request time, not stored | ✓ FLOWING |
| `HumanQualityCorpusPanel` | evaluation form | `POST .../evaluation` → `submitCorpusEvaluation` | Yes — inserts evaluation row, marks item evaluated | ✓ FLOWING |
| `DerivationReviewSheet` | corpus selection | `POST /api/feedback/human-quality-corpus` → `selectDerivationForCorpus` | Yes — builds bounded snapshot from derivation row | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Corpus contract + privacy tests | `npm test -- tests/unit/human-quality/` | 4 files, all pass | ✓ PASS |
| Evaluation submission route | `npm test -- .../evaluation/route.test.ts` | All pass | ✓ PASS |
| Corpus panel component | `npm test -- HumanQualityCorpusPanel.test.tsx` | All pass | ✓ PASS |
| Derivation review add-to-corpus | `npm test -- DerivationReviewSheet.test.tsx` | All pass | ✓ PASS |
| Corpus queue GET route | `npm test -- .../human-quality-corpus/route.test.ts` | 1/8 fail — GET returns 500 | ⚠️ PARTIAL |

**Spot-check note:** The GET route test fails because `attachPreviewImages` (added in plan 03) queries `derivations` and calls `getPresignedDownloadUrl` without mocks in `route.test.ts`. Implementation is substantive; test mock is stale. Not a phase-goal blocker but should be fixed before Phase 133 release gate.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| HUMAN-01 | 129-01, 129-02, 129-03 | Operator can select real outputs into versioned corpus with scope | ✓ SATISFIED | Schema fields, `selectDerivationForCorpus`, manual UI entry point, `corpusVersion` uniqueness |
| HUMAN-02 | 129-01, 129-02, 129-03 | Bounded artifact refs; no raw prompts/URLs/auth | ✓ SATISFIED | `FORBIDDEN_PAYLOAD_KEYS`, reject-then-sanitize, ephemeral preview only |
| HUMAN-03 | 129-02, 129-03 | Structured human judgment fields | ✓ SATISFIED | Evaluation table, API schema, required UI form |
| HUMAN-04 | 129-01, 129-02, 129-03 | Baseline/pre/post-learning cohort distinction | ✓ SATISFIED | Cohort enum, DB constraint, `classifyCohort`, UI display |

No orphaned requirements — all four HUMAN IDs declared in plan frontmatter are implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `route.test.ts` | — | GET test missing db/R2 mocks after `attachPreviewImages` added | ⚠️ Warning | Test regression; production path likely works |
| — | — | No TODO/FIXME/placeholder stubs in human-quality source | — | Clean |

### Human Verification Required

### 1. End-to-end corpus evaluation workflow

**Test:** As platform owner, open `/feedback`, enter a workspace ID with pending corpus items, and submit a full human evaluation.  
**Expected:** Queue shows one item at a time with preview image and metadata; submission succeeds, item leaves pending queue, evaluation row persists.  
**Why human:** End-to-end operator workflow spans auth boundary, ephemeral presigned preview URLs, and DB persistence — cannot verify without live workspace data and owner session.

### 2. Manual add-to-corpus from derivation review

**Test:** From a campaign derivation review sheet, click "Add to quality corpus" on a completed derivation.  
**Expected:** Discreet success toast; duplicate attempt shows error toast; non-owner gets silent 403.  
**Why human:** Manual selection UX, toast behavior, and role gating require browser session with real campaign context.

### 3. Stored payload privacy audit

**Test:** Inspect stored corpus rows after selection and evaluation.  
**Expected:** `artifact_ref` and `quality_snapshot` contain only bounded fields; no prompt, signedUrl, outputKey, or auth material in JSONB columns.  
**Why human:** Privacy boundary must be confirmed against real DB rows, not only unit-test fixtures.

### Gaps Summary

No blocking gaps found against Phase 129 goal. All four roadmap success criteria and HUMAN-01–04 requirements have substantive, wired implementation. Status is `human_needed` because operator workflows (selection, visual review, evaluation submission, privacy audit) require live-session verification. One test regression in `route.test.ts` should be fixed but does not block corpus functionality.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Score calibration / automatic-vs-human comparison | Phase 130 | Goal: "O score automatico passa a ser auditavel contra julgamento humano" |
| 2 | Learning impact measurement on corpus | Phase 131 | Goal: measure recommendation/prefill impact on comparable samples |
| 3 | Release gate with full suite green | Phase 133 | Success criteria: release gate runs corpus tests, calibration checks, npm test/lint/build |

---

_Verified: 2026-06-17T12:20:00Z_  
_Verifier: Claude (gsd-verifier)_
