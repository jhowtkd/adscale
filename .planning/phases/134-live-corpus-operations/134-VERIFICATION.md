---
phase: 134-live-corpus-operations
verified: 2026-06-17T20:19:00Z
status: passed_automated_operator_data_pending
score: 4/4
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Queue progress missing campaign-dimensional breakdown required by LIVEQUAL-02"
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "Review queue exposes workspace, campaign, mode, format, cohort and reviewer status"
    status: closed
    closed_by: 134-04-PLAN.md
    reason: "byCampaign aggregation added in getCorpusOperationsProgress; exposed via includeProgress=true; rendered in QueueProgressSummary By campaign table"
human_verification:
  - test: "Platform owner selects real derivations from campaign review and evaluates one through submit-and-advance"
    expected: "Items enter pending queue from DerivationReviewSheet POST; after evaluation they leave pending and progress totals update; no sensitive fields persist"
    why_human: "Requires DATABASE_URL, platform-owner session and eligible campaign/derivation data not available in automated CI"
---

# Phase 134: Live Corpus Operations Verification Report

**Phase Goal:** Operadores conseguem montar e avaliar um lote real de outputs para o corpus live sem vazar dados sensiveis e sem depender de fixtures.

**Verified:** 2026-06-17T20:12:00Z  
**Status:** gaps_found  
**Re-verification:** Yes — independent goal-backward check (previous report had no structured `gaps:` frontmatter)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can select eligible real outputs into a weekly corpus batch | ✓ VERIFIED | `batchSelectDerivationsForCorpus` (cap 25) + single-item enqueue via `DerivationReviewSheet` → POST `/api/feedback/human-quality-corpus`; `selectDerivationForCorpus` loads real derivations from DB (`getDerivationById`, `getCampaignById`) |
| 2 | Review queue exposes workspace, campaign, mode, format, cohort and reviewer status | ✓ VERIFIED | Workspace scope + pending/evaluated totals + byCohort/byGenerationMode/byFormat/byCampaign ✓ (134-04); reviewer status via pending/evaluated counts |
| 3 | Reviewer completes structured evaluation in a fast repeatable flow | ✓ VERIFIED | `HumanQualityCorpusPanel` Submit & next, form reset on success, required fields enforced; wired to evaluation POST |
| 4 | Unsafe artifacts rejected; raw prompts/signed URLs/secrets never persisted | ✓ VERIFIED | `validatePrivacySafePayload` / `sanitizeCorpusPayloads` on insert; `FORBIDDEN_EVALUATION_PAYLOAD_KEYS` guard in panel; preview URLs resolved ephemerally in GET only |

**Score:** 4/4 roadmap success criteria verified (automated); operator live-data execution remains human checkpoint

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live corpus population / sampling sufficiency (`evaluatedItemCount=0`) | Phase 135 | Phase 135 goal: "O sistema sabe quando ha amostra suficiente para tendencias" |
| 2 | Owner trend dashboards and release gate evidence | Phases 136–137 | Explicitly out of Phase 134 scope per `134-CONTEXT.md` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/server/human-quality/service.ts` | Batch selection + queue progress service | ✓ VERIFIED | 434 lines; `batchSelectDerivationsForCorpus`, `getCorpusQueueProgress` wired to repository |
| `app/src/server/repositories/human-quality-corpus.ts` | Progress summary queries | ✓ VERIFIED | `getCorpusOperationsProgress` includes byCampaign (134-04) |
| `app/src/app/api/feedback/human-quality-corpus/route.ts` | Owner batch/progress API | ✓ VERIFIED | GET with `includeProgress`; POST single + batch payloads; preview URLs ephemeral |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Live operations UI | ✓ VERIFIED | Wired in `OwnerAnalyticsPanel`; progress + fast review flow |
| `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | UI coverage | ✓ VERIFIED | Submit & next, progress, forbidden payload keys tested |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DerivationReviewSheet.tsx` | `/api/feedback/human-quality-corpus` | `apiFetch` POST single derivation | ✓ WIRED | Real campaign/derivation IDs from review context |
| `HumanQualityCorpusPanel.tsx` | `/api/feedback/human-quality-corpus` | `apiFetch` GET `includeProgress=true` | ✓ WIRED | Queue + progress loaded together |
| `HumanQualityCorpusPanel.tsx` | `/api/feedback/human-quality-corpus/[id]/evaluation` | `submitMutation` POST | ✓ WIRED | Structured evaluation fields only |
| `route.ts` GET | `getPresignedDownloadUrl` | `attachPreviewImages` | ✓ WIRED | Ephemeral preview; not stored in corpus rows |
| `insertCorpusItem` | `sanitizeCorpusPayloads` | repository insert path | ✓ WIRED | Forbidden keys rejected before DB write |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `HumanQualityCorpusPanel` | `queueItems` / `queueProgress` | GET corpus API → `listPendingCorpusQueue` + `getCorpusOperationsProgress` | Yes (DB queries) | ✓ FLOWING |
| `HumanQualityCorpusPanel` | `currentItem.previewImageUrl` | GET resolves presigned URL from derivation `outputKey` | Yes (R2 presign) | ✓ FLOWING (ephemeral) |
| `DerivationReviewSheet` | corpus enqueue | POST → `selectDerivationForCorpus` → DB | Yes (real derivation lookup) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Focused corpus test suite | `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | 17 files, 152 tests passed (2.50s) | ✓ PASS |
| Next.js build gate | `cd app && npm run build` | Compile + TypeScript success; 68 static pages | ✓ PASS |
| Batch service exports | `batchSelectDerivationsForCorpus` in service.ts | Function exists, per-item outcomes | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LIVEQUAL-01 | 134-01, 134-03 | Controlled weekly batch of real outputs into live corpus | ✓ SATISFIED | Batch API (≤25 IDs), single enqueue from campaign review, real DB derivation path |
| LIVEQUAL-02 | 134-01, 134-02, 134-03, 134-04 | Track queue progress by workspace, campaign, mode, format, cohort, reviewer status | ✓ SATISFIED | byCampaign in progress API and QueueProgressSummary (134-04) |
| LIVEQUAL-03 | 134-02, 134-03 | Fast repeatable evaluation with structured fields | ✓ SATISFIED | Visual score, factual pass, intent, failure reason enforced; Submit & next |
| LIVEQUAL-04 | 134-01, 134-02, 134-03 | Reject unsafe artifacts; never persist sensitive payloads | ✓ SATISFIED | `FORBIDDEN_PAYLOAD_KEYS`, `sanitizeCorpusPayloads`, evaluation payload guards |

All four requirement IDs from plan frontmatter are accounted for. No orphaned LIVEQUAL IDs mapped to Phase 134 in `REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No blocker stubs in phase artifacts | — | — |

### Human Verification Required

### 1. Real-operator batch and evaluation loop

**Test:** Sign in as platform owner with `DATABASE_URL` pointed at a workspace with eligible derivations. From campaign review, add derivations to corpus; open Feedback → Human Quality Corpus; evaluate at least one item via Submit & next.

**Expected:** Items move from pending to evaluated; progress totals update; no prompts/signed URLs in persisted corpus payloads.

**Why human:** Requires live DB, owner session and real campaign data outside automated test scope.

### Gaps Summary

Phase 134 delivers a substantive live-corpus operations loop: real derivation selection (not fixtures), batch API contracts, privacy-safe persistence, fast reviewer UX, and campaign-dimensional queue progress (134-04 gap closure). Automated verification: 4/4 truths. Operator handoff for real data execution remains data-dependent (documented in `134-VALIDATION.md`); sampling sufficiency claims stay deferred to Phase 135.

---

_Verified: 2026-06-17T20:19:00Z_  
_Verifier: Claude (gsd-verifier)_
