---
phase: 76-cockpit-and-mission-instrumentation
plan: 01
subsystem: api
tags: [beta-analytics, event-schema, session-id, zod, vitest]

requires:
  - phase: 75-event-schema-and-ingest-foundation
    provides: recordBetaAnalyticsEvent, POST /api/analytics/events, sanitize/allowlist
provides:
  - PHASE_76_BETA_EVENT_KEYS closed enum enforced at write boundary
  - getBetaSessionIdFromRequest for x-beta-session-id header
  - BETA_SESSION_STORAGE_KEY constant for client hook (Plan 03)
  - Analytics ingest merges body + header sessionId
affects:
  - 76-02 server instrumentation routes
  - 76-03 client useRecordBetaEvent hook

tech-stack:
  added: []
  patterns:
    - "Closed event_key enum validation before DB insert"
    - "Session ID resolution: body overrides x-beta-session-id header"

key-files:
  created:
    - app/src/server/beta-analytics/session.ts
    - app/src/server/beta-analytics/session.test.ts
  modified:
    - app/src/server/beta-analytics/types.ts
    - app/src/server/beta-analytics/record.ts
    - app/src/server/beta-analytics/record.test.ts
    - app/src/app/api/analytics/events/route.ts
    - app/src/app/api/analytics/events/route.test.ts

key-decisions:
  - "Validate event_key against PHASE_76_BETA_EVENT_KEYS after property sanitization"
  - "Body sessionId takes precedence over x-beta-session-id header on ingest"

patterns-established:
  - "Phase 76 event keys: 8-key closed enum (5 server + 3 client cockpit keys)"
  - "Server routes read optional session via getBetaSessionIdFromRequest(request)"

requirements-completed: [INST-04]

duration: 8min
completed: 2026-06-07
---

# Phase 76 Plan 01: Event Taxonomy and Session Plumbing Summary

**Closed 8-key Phase 76 event_key enum with write-boundary rejection plus x-beta-session-id header plumbing on analytics ingest**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-07T15:10:00Z
- **Completed:** 2026-06-07T15:18:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Exported `PHASE_76_BETA_EVENT_KEYS` and `Phase76BetaEventKey` with all 8 D-01 keys
- `recordBetaAnalyticsEvent` rejects unknown keys with `unknown event_key` before insert
- `getBetaSessionIdFromRequest` validates UUID from `x-beta-session-id` header
- `POST /api/analytics/events` merges `parsed.data.sessionId ?? header sessionId`

## Task Commits

1. **Task 1: Closed event_key enum and record validation** - `ec67f0bc` (feat)
2. **Task 2: Beta session ID plumbing for ingest and server routes** - `40d26c5a` (feat)

## Files Created/Modified

- `app/src/server/beta-analytics/types.ts` - PHASE_76_BETA_EVENT_KEYS closed enum
- `app/src/server/beta-analytics/record.ts` - event_key membership check before insert
- `app/src/server/beta-analytics/record.test.ts` - enum acceptance/rejection tests
- `app/src/server/beta-analytics/session.ts` - BETA_SESSION_STORAGE_KEY + header parser
- `app/src/server/beta-analytics/session.test.ts` - session helper unit tests
- `app/src/app/api/analytics/events/route.ts` - body/header sessionId merge
- `app/src/app/api/analytics/events/route.test.ts` - header fallback route tests

## Decisions Made

- Validated event_key after property sanitization (preserves existing sanitize error precedence)
- Body `sessionId` wins over header when both present (explicit client intent)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Verification

```
cd app && npm test -- src/server/beta-analytics/record.test.ts src/server/beta-analytics/session.test.ts src/app/api/analytics/events/route.test.ts
```

Result: 3 files, 29 tests passed.

## Next Phase Readiness

- Ready for 76-02 server instrumentation (preflight, billing, mission_completed hooks)
- `getBetaSessionIdFromRequest` exported for Plan 02 routes
- `BETA_SESSION_STORAGE_KEY` ready for Plan 03 client hook

---
*Phase: 76-cockpit-and-mission-instrumentation*
*Completed: 2026-06-07*

## Self-Check: PASSED

- FOUND: app/src/server/beta-analytics/types.ts
- FOUND: app/src/server/beta-analytics/session.ts
- FOUND: ec67f0bc (Task 1)
- FOUND: 40d26c5a (Task 2)
