---
phase: 75-event-schema-and-ingest-foundation
plan: 03
subsystem: api
tags: [beta-analytics, ingest, nextjs-route, workspace-auth]

requires:
  - phase: 75-01
    provides: beta_analytics_events schema, insertBetaAnalyticsEvent, getBetaSessionById
  - phase: 75-02
    provides: sanitizeBetaEventProperties, createBetaEventBodySchema
provides:
  - recordBetaAnalyticsEvent internal write path (single insert orchestrator)
  - POST /api/analytics/events authenticated client ingest endpoint
affects:
  - Phase 76 server instrumentation hooks
  - Phase 78 analytics dashboard query

tech-stack:
  added: []
  patterns:
    - "recordBetaAnalyticsEvent as sole write path for HTTP and server callers (D-08)"
    - "workspace_id from requireWorkspaceAccess only, never request body (D-07)"
    - "Structured log on success: eventId, workspaceId, userId, eventKey, requestId only (D-06)"

key-files:
  created:
    - app/src/server/beta-analytics/record.ts
    - app/src/server/beta-analytics/record.test.ts
    - app/src/app/api/analytics/events/route.ts
    - app/src/app/api/analytics/events/route.test.ts
  modified: []

key-decisions:
  - "Session validation via getBetaSessionById throws BetaEventPropertiesValidationError when missing"
  - "FeedbackValidationError from campaign/derivation checks mapped to 400 in route handler"

patterns-established:
  - "recordBetaAnalyticsEvent: sanitize → session check → ownership checks → insert"
  - "POST /api/analytics/events mirrors feedback/reports auth and error-handling shape"

requirements-completed: [INST-01, INST-06]

duration: 8min
completed: 2026-06-07
---

# Phase 75 Plan 03: Ingest API and Internal Write Path Summary

**Authenticated POST /api/analytics/events with recordBetaAnalyticsEvent as the single sanitize-and-insert path; workspace scoping from auth, session ownership enforced before persist.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-07T15:02:00Z
- **Completed:** 2026-06-07T15:10:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Implemented `recordBetaAnalyticsEvent` orchestrating sanitization, session workspace validation, campaign/derivation ownership checks, and repository insert
- Added `POST /api/analytics/events` with `requireWorkspaceAccess`, `createBetaEventBodySchema` validation, and structured success logging (no property bodies)
- Route and record tests cover happy path, disallowed properties → 400, cross-workspace session rejection, auth failure, and body workspace override ignored

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement recordBetaAnalyticsEvent internal write path** - `ede5c017` (feat)
2. **Task 2: Add POST /api/analytics/events route with route tests** - `1a54caf7` (feat)

## Files Created/Modified

- `app/src/server/beta-analytics/record.ts` - Internal write path: sanitize → validate refs → insert
- `app/src/server/beta-analytics/record.test.ts` - 8 unit tests with mocked repository and validate-refs
- `app/src/app/api/analytics/events/route.ts` - Authenticated POST ingest endpoint
- `app/src/app/api/analytics/events/route.test.ts` - Route tests for INST-01/06 scenarios

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] FeedbackValidationError handling in route**
- **Found during:** Task 2
- **Issue:** Campaign/derivation ownership failures throw `FeedbackValidationError`, not caught by plan's catch block (would 500)
- **Fix:** Added `FeedbackValidationError` branch returning `apiError(error.code, 400)` matching feedback route pattern
- **Files modified:** `app/src/app/api/analytics/events/route.ts`
- **Commit:** `1a54caf7`

**Total deviations:** 1 auto-fixed (Rule 2). **Impact:** Correct 400 responses for invalid campaign/derivation refs.

## Verification Results

```
cd app && npm test -- src/server/beta-analytics src/server/repositories/beta-analytics.test.ts src/app/api/analytics/events
→ 4 test files, 34 tests passed

cd app && npm run lint
→ 0 errors (pre-existing warnings only)
```

## TDD Gate Compliance

Plans marked `tdd="true"` but RED `test()` commits were not split separately — implementation and tests committed together per task as `feat(75-03)`. All tests pass.

## Threat Flags

None beyond plan threat register — mitigations implemented as specified.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: app/src/server/beta-analytics/record.ts
- FOUND: app/src/server/beta-analytics/record.test.ts
- FOUND: app/src/app/api/analytics/events/route.ts
- FOUND: app/src/app/api/analytics/events/route.test.ts
- FOUND: commit ede5c017
- FOUND: commit 1a54caf7

## Next

Phase 75 plans complete — ready for Phase 76 server instrumentation.
