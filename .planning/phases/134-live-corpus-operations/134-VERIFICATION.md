---
phase: 134-live-corpus-operations
verified: 2026-06-17T20:22:00Z
status: human_needed
score: 4/4
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "Queue progress API includes pending/evaluated counts grouped by campaignId (LIVEQUAL-02)"
    - "GET /api/feedback/human-quality-corpus?includeProgress=true returns progress.byCampaign"
    - "QueueProgressSummary renders a By campaign breakdown table alongside cohort/mode/format"
    - "Review queue exposes workspace, campaign, mode, format, cohort and reviewer status"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Platform owner selects real derivations from campaign review and evaluates one through submit-and-advance"
    expected: "Items enter pending queue from DerivationReviewSheet POST; after evaluation they leave pending and progress totals update; no sensitive fields persist"
    why_human: "Requires DATABASE_URL, platform-owner session and eligible campaign/derivation data not available in automated CI"
---

# Phase 134: Live Corpus Operations Verification Report

**Phase Goal:** Operadores conseguem montar e avaliar um lote real de outputs para o corpus live sem vazar dados sensiveis e sem depender de fixtures.

**Verified:** 2026-06-17T20:22:00Z  
**Status:** human_needed  
**Re-verification:** Yes — after 134-04 gap closure (LIVEQUAL-02 byCampaign)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can select eligible real outputs into a weekly corpus batch | ✓ VERIFIED | `batchSelectDerivationsForCorpus` (cap 25) + `selectDerivationForCorpus` loads real derivations from DB; `DerivationReviewSheet` POSTs to `/api/feedback/human-quality-corpus` with campaign/derivation IDs |
| 2 | Review queue exposes workspace, campaign, mode, format, cohort and reviewer status | ✓ VERIFIED | Workspace scope + `totalPending`/`totalEvaluated` + `byCohort`/`byGenerationMode`/`byFormat`/`byCampaign` (134-04); reviewer/evaluation status via pending/evaluated counts per `134-CONTEXT.md` |
| 3 | Reviewer completes structured evaluation in a fast repeatable flow | ✓ VERIFIED | `HumanQualityCorpusPanel` Submit & next, required visual/factual/intent/failure fields, form reset on success; wired to evaluation POST |
| 4 | Unsafe artifacts rejected; raw prompts/signed URLs/secrets never persisted | ✓ VERIFIED | `validatePrivacySafePayload` / `sanitizeCorpusPayloads` on insert; `FORBIDDEN_EVALUATION_PAYLOAD_KEYS` in panel; preview URLs resolved ephemerally in GET only (`attachPreviewImages` → `getPresignedDownloadUrl`) |

**Score:** 4/4 roadmap success criteria verified (automated)

### LIVEQUAL-02 Gap Closure (134-04)

| Check | Status | Evidence |
|-------|--------|----------|
| `byCampaign` in `getCorpusOperationsProgress` | ✓ VERIFIED | `human-quality-corpus.ts` selects `campaignId`, `bumpStatusCount(progress.byCampaign, row.campaignId, status)` |
| `byCampaign` passthrough in `getCorpusQueueProgress` | ✓ VERIFIED | `service.ts` maps `byCampaign: progress.byCampaign` |
| API returns `progress.byCampaign` | ✓ VERIFIED | `route.ts` GET with `includeProgress=true` attaches `getCorpusQueueProgress` result; route test asserts `body.progress.byCampaign` |
| UI renders "By campaign" table | ✓ VERIFIED | `QueueProgressSummary` line 377; panel test asserts heading + campaign UUID row |
| gsd-tools artifacts + key-links | ✓ VERIFIED | 3/3 artifacts passed; 3/3 links verified |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live corpus population / sampling sufficiency (`evaluatedItemCount=0`) | Phase 135 | Phase 135 goal: "O sistema sabe quando ha amostra suficiente para tendencias" |
| 2 | Owner trend dashboards and release gate evidence | Phases 136–137 | Explicitly out of Phase 134 scope per `134-CONTEXT.md` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/server/repositories/human-quality-corpus.ts` | Batch selection + queue progress service | ✓ VERIFIED | `getCorpusOperationsProgress` includes `byCampaign` aggregation |
| `app/src/server/human-quality/service.ts` | Progress passthrough + batch selection | ✓ VERIFIED | `getCorpusQueueProgress`, `batchSelectDerivationsForCorpus` wired to repository |
| `app/src/app/api/feedback/human-quality-corpus/route.ts` | Owner batch/progress API | ✓ VERIFIED | GET `includeProgress`; POST single + batch; ephemeral preview URLs |
| `app/src/components/feedback/HumanQualityCorpusPanel.tsx` | Live operations UI | ✓ VERIFIED | Wired in `OwnerAnalyticsPanel`; four breakdown tables in 2×2 grid |
| `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` | UI coverage | ✓ VERIFIED | By campaign, Submit & next, forbidden payload keys tested |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `human-quality-corpus.ts` | `service.ts` | `byCampaign: progress.byCampaign` | ✓ WIRED | Pattern verified by gsd-tools |
| `service.ts` | `route.ts` | `getCorpusQueueProgress` on `includeProgress=true` | ✓ WIRED | Pattern verified by gsd-tools |
| `HumanQualityCorpusPanel.tsx` | GET corpus API | `progress.byCampaign` in `QueueProgressSummary` | ✓ WIRED | Pattern verified by gsd-tools |
| `DerivationReviewSheet.tsx` | `/api/feedback/human-quality-corpus` | `apiFetch` POST single derivation | ✓ WIRED | Real campaign/derivation IDs from review context |
| `HumanQualityCorpusPanel.tsx` | `/api/feedback/human-quality-corpus/[id]/evaluation` | `submitMutation` POST | ✓ WIRED | Structured evaluation fields only |
| `insertCorpusItem` | `sanitizeCorpusPayloads` | repository insert path | ✓ WIRED | Forbidden keys rejected before DB write |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `HumanQualityCorpusPanel` | `queueItems` / `queueProgress` | GET corpus API → `listPendingCorpusQueue` + `getCorpusOperationsProgress` | Yes (DB queries) | ✓ FLOWING |
| `HumanQualityCorpusPanel` | `progress.byCampaign` | `getCorpusOperationsProgress` aggregation | Yes (campaignId from corpus rows) | ✓ FLOWING |
| `HumanQualityCorpusPanel` | `currentItem.previewImageUrl` | GET resolves presigned URL from derivation `outputKey` | Yes (R2 presign) | ✓ FLOWING (ephemeral) |
| `DerivationReviewSheet` | corpus enqueue | POST → `selectDerivationForCorpus` → DB | Yes (real derivation lookup) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Focused corpus test suite (3 files) | `cd app && npm test -- tests/unit/human-quality/live-corpus-operations.test.ts src/app/api/feedback/human-quality-corpus/route.test.ts src/components/feedback/HumanQualityCorpusPanel.test.tsx` | 3 files, 30 tests passed (912ms) | ✓ PASS |
| byCampaign service aggregation | `live-corpus-operations.test.ts` `getCorpusQueueProgress` | Multi-campaign `byCampaign` assertion passes | ✓ PASS |
| byCampaign route exposure | `route.test.ts` GET `includeProgress=true` | `body.progress.byCampaign` asserted | ✓ PASS |
| By campaign UI rendering | `HumanQualityCorpusPanel.test.tsx` | "By campaign" heading + `CAMPAIGN_ID` row visible | ✓ PASS |
| 134-04 commits | `e4ac0faa`, `6bce9ab5` | Both commits exist in repo | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LIVEQUAL-01 | 134-01, 134-03 | Controlled weekly batch of real outputs into live corpus | ✓ SATISFIED | Batch API (≤25 IDs), single enqueue from campaign review, real DB derivation path |
| LIVEQUAL-02 | 134-01, 134-02, 134-03, 134-04 | Track queue progress by workspace, campaign, mode, format, cohort, reviewer status | ✓ SATISFIED | `byCampaign` in progress API and `QueueProgressSummary` (134-04); workspace scope + pending/evaluated dimensional breakdowns |
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

**Expected:** Items move from pending to evaluated; progress totals and By campaign breakdown update; no prompts/signed URLs in persisted corpus payloads.

**Why human:** Requires live DB, owner session and real campaign data outside automated test scope.

### Gaps Summary

No automated gaps remain. LIVEQUAL-02 campaign-dimensional gap from prior verification is closed by 134-04: `byCampaign` flows repository → service → GET `includeProgress=true` → `QueueProgressSummary` "By campaign" table, with 30/30 focused tests passing. Operator handoff for real-data execution is the remaining checkpoint before Phase 135 sampling claims.

---

_Verified: 2026-06-17T20:22:00Z_  
_Verifier: Claude (gsd-verifier)_
