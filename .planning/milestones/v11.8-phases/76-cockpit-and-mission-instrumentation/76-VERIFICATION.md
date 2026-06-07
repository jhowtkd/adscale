---
phase: 76-cockpit-and-mission-instrumentation
verified: 2026-06-07T10:21:00Z
status: human_needed
score: 4/5
overrides_applied: 0
human_verification:
  - test: "Manual DB smoke before Phase 77 operator session 1"
    expected: "After exercising one server path (e.g. preflight POST or export POST) and one client path (cockpit panel stage event) with `x-beta-session-id` / sessionStorage set to a real `beta_sessions` row, query `beta_analytics_events` and confirm ≥2 rows with matching `session_id` and expected `event_key` values"
    why_human: "Roadmap SC5 and 76-VALIDATION.md require live DB visibility; all automated tests mock `insertBetaAnalyticsEvent` / `db.insert` and cannot prove rows land in a running database"
---

# Phase 76: Cockpit and Mission Instrumentation Verification Report

**Phase Goal:** Emit authoritative funnel signals across cockpit stages, missions, and credit boundaries.

**Verified:** 2026-06-07T10:21:00Z  
**Status:** human_needed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap success criteria (primary contract) plus plan-level must-haves verified goal-backward against the codebase.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Server records events on readiness block, credit spend, and mission completion | ✓ VERIFIED | `preflight/route.ts` emits `readiness_blocked` / `readiness_completed`; `credits.ts` emits `credit_spend` / `credit_blocked` via `recordUsage`; `exports/route.ts`, `share/route.ts`, `derivations/[id]/review/route.ts` emit `mission_completed` with `source: "server"` |
| 2 | Client records briefing, recipe, and preview gate complete/abandon transitions | ✓ VERIFIED | `GuidedBriefingPanel`, `StrategyRecipePanel`, `PreviewGatePanel` wire `useRecordBetaEvent` for `cockpit_stage_entered` / `_completed` / `_abandoned`; component tests assert all three transitions per panel |
| 3 | Events can be grouped under an active `beta_session` for the target workspace | ✓ VERIFIED | `record.ts` validates `sessionId` via `getBetaSessionById`; client hook reads `BETA_SESSION_STORAGE_KEY`; server routes merge `x-beta-session-id`; integration + repository tests assert `sessionId` on insert and list filter |
| 4 | Integration tests prove events on readiness block and mission completion paths | ✓ VERIFIED | `instrumentation.integration.test.ts` covers `readiness_blocked`, `readiness_completed`, `mission_completed` (export/share); 15/15 integration + repository tests pass |
| 5 | Instrumentation smoke shows events in DB before operator session 1 | ? NEEDS HUMAN | Automated smoke uses mocked inserts per 76-04-SUMMARY key-decision; live DB query required per 76-VALIDATION.md before Phase 77 |

**Score:** 4/5 roadmap truths verified (1 requires human DB smoke)

#### Plan-level truths (all verified)

| Area | Truth | Status |
|------|-------|--------|
| 76-01 | Unknown `event_key` rejected before DB insert | ✓ `record.ts` checks `PHASE_76_BETA_EVENT_KEYS` |
| 76-01 | Closed enum documents all Phase 76 keys (8 keys) | ✓ `types.ts` |
| 76-01 | Client ingest reads `sessionId` from body / sessionStorage contract | ✓ `use-record-beta-event.ts` + `analytics/events/route.ts` |
| 76-01 | Server routes read `sessionId` from `x-beta-session-id` | ✓ `session.ts`; used in preflight, exports, share, derivations review |
| 76-02 | `credit_blocked` on gate rejection | ✓ Emitted from `credits.ts` `recordUsage` (gates delegates); `gates.test.ts` forwards `userId` |
| 76-03 | Analytics failures swallowed silently | ✓ `fetch(...).catch(() => {})` + test |
| 76-03 | `CreativeReadinessPanel` client stage events (bonus) | ✓ Enter/complete/abandon wired + tested |
| 76-04 | Server + client paths through `recordBetaAnalyticsEvent` | ✓ Integration describe blocks for server + client sources |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/server/beta-analytics/types.ts` | Phase 76 closed enum | ✓ VERIFIED | 8 event keys, allowlisted properties |
| `app/src/server/beta-analytics/session.ts` | Session ID extraction | ✓ VERIFIED | UUID validation on header |
| `app/src/server/beta-analytics/record.ts` | Validated write path | ✓ VERIFIED | Enum + session FK + ownership checks |
| `app/src/app/api/campaigns/.../preflight/route.ts` | Readiness events | ✓ VERIFIED | Wired after readiness computed |
| `app/src/server/billing/credits.ts` | Credit spend/block events | ✓ VERIFIED | `emitCreditSpendAnalytics` / `emitCreditBlockedAnalytics` |
| `app/src/server/billing/gates.ts` | Credit gate boundary | ✓ VERIFIED | Delegates to `recordUsage` (analytics in credits layer) |
| `app/src/app/api/exports/route.ts` | `mission_completed` export | ✓ VERIFIED | |
| `app/src/app/api/share/route.ts` | `mission_completed` share | ✓ VERIFIED | |
| `app/src/lib/hooks/use-record-beta-event.ts` | Fire-and-forget client hook | ✓ VERIFIED | |
| `app/src/components/workspace/GuidedBriefingPanel.tsx` | Briefing stage events | ✓ VERIFIED | |
| `app/src/components/workspace/StrategyRecipePanel.tsx` | Recipe stage events | ✓ VERIFIED | |
| `app/src/components/workspace/PreviewGatePanel.tsx` | Preview gate events | ✓ VERIFIED | |
| `app/src/components/workspace/CreativeReadinessPanel.tsx` | Readiness stage events | ✓ VERIFIED | |
| `app/src/server/beta-analytics/instrumentation.integration.test.ts` | QA-01 coverage | ✓ VERIFIED | |
| `app/src/server/repositories/beta-analytics.test.ts` | Session FK persistence | ✓ VERIFIED | |

gsd-tools artifact check: **15/15 passed** across plans 76-01–76-04.

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `record.ts` | `types.ts` | `PHASE_76_BETA_EVENT_KEYS` | ✓ WIRED | gsd-tools verified |
| `analytics/events/route.ts` | `session.ts` | header merge | ✓ WIRED | gsd-tools verified |
| `preflight/route.ts` | `record.ts` | readiness analytics | ✓ WIRED | gsd-tools verified |
| `gates.ts` | `record.ts` | `credit_blocked` pattern | ⚠️ INDIRECT | `credit_blocked` emitted in `credits.ts` via `recordUsage`; gates forwards `userId` — truth satisfied, link path differs from plan |
| `exports/route.ts` | `record.ts` | `mission_completed` | ✓ WIRED | gsd-tools verified |
| `use-record-beta-event.ts` | `/api/analytics/events` | fetch POST | ✓ WIRED | gsd-tools verified |
| `GuidedBriefingPanel.tsx` | `use-record-beta-event.ts` | lifecycle hooks | ✓ WIRED | gsd-tools verified |
| `instrumentation.integration.test.ts` | `record.ts` | mocked insert assertions | ✓ WIRED | gsd-tools verified |
| `instrumentation.integration.test.ts` | `beta-analytics.ts` repo | session fixture | ✓ WIRED | Covered in INST-04 describe via `getBetaSessionById` mock + `insertBetaAnalyticsEvent` assertions; separate repo test file validates insert |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `GuidedBriefingPanel` | `recordEvent(...)` | `useRecordBetaEvent` → POST body | Dynamic stage/missionKey props | ✓ FLOWING |
| `preflight/route.ts` | `readiness` | `readinessFromPreflight(asset, campaign)` | Computed blocking count + status | ✓ FLOWING |
| `credits.ts` | `check` | `canSpend` / ledger | Actual credits + reasonCode | ✓ FLOWING |
| `record.ts` | `sessionId` | `getBetaSessionById(workspaceId, sessionId)` | FK validated against workspace | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 76 targeted test suite | `npm test -- src/server/beta-analytics ... credits.ts` | 19 files, 131 tests passed | ✓ PASS |
| QA-01 integration file | `npm test -- instrumentation.integration.test.ts` | 9 tests passed | ✓ PASS |
| Repository session_id | `npm test -- beta-analytics.test.ts` | 6 tests passed | ✓ PASS |
| Closed enum rejects unknown key | `record.test.ts` + integration regression | Covered in suite | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INST-02 | 76-02 | Server authoritative events on readiness, credit, mission boundaries | ✓ SATISFIED | Preflight, credits, exports, share, derivation review |
| INST-03 | 76-03 | Client stage events for briefing, recipe, preview gate | ✓ SATISFIED | Three panels + hook; readiness panel adds client funnel signal |
| INST-04 | 76-01, 76-04 | Events groupable under `beta_session` | ✓ SATISFIED | Session validation + sessionId on insert/list |
| QA-01 | 76-04 | Integration tests on readiness block + mission completion | ✓ SATISFIED | `instrumentation.integration.test.ts` |

No orphaned requirements mapped to Phase 76 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None blocking | — | No TODO/FIXME/placeholder stubs in instrumentation paths |

### Human Verification Required

### 1. Live DB instrumentation smoke (Roadmap SC5)

**Test:** In a dev/staging environment with a real `beta_sessions` row for the target workspace, trigger one server event (e.g. preflight POST with `x-beta-session-id`) and one client event (open a cockpit panel with sessionStorage set). Query `beta_analytics_events` filtered by `session_id`.

**Expected:** ≥2 rows with correct `event_key`, `source`, `workspace_id`, and shared `session_id`.

**Why human:** All automated tests mock the persistence layer; 76-VALIDATION.md explicitly schedules this check before Phase 77 operator session 1.

### Gaps Summary

No code gaps block Phase 76 instrumentation delivery. Automated verification is complete: taxonomy, server/client emission, session grouping contracts, and integration tests all pass (131/131 targeted tests).

One operational gate remains: **live database smoke** (Roadmap SC5) before Phase 77 operator sessions. This is intentional per 76-04-SUMMARY ("mocked beta_sessions fixture; no operator session APIs until Phase 77").

**Implementation note:** `credit_blocked` analytics live in `credits.ts` (called by `gates.ts` via `recordUsage`), not directly in `gates.ts` — behavior matches INST-02 intent.

---

_Verified: 2026-06-07T10:21:00Z_  
_Verifier: Claude (gsd-verifier)_
