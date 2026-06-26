---
phase: 190-guided-journey-telemetry
plan: 01
subsystem: api
tags: [telemetry, guided-flow, drizzle, assistant]
requires:
  - phase: 184-guided-flow-state
    provides: guided flow persistence and scoped repository
provides:
  - assistant_guided_flow_events table and repository
  - safe event contract and metadata sanitizer
  - server-side lifecycle instrumentation on guided-flow routes
affects:
  - 191-operational-funnel-surface
  - 194-operational-release-gate
tech-stack:
  added: []
  patterns:
    - "Dedicated telemetry table with scope indexes mirroring guided-flow isolation"
    - "Fire-and-forget emitGuidedFlowTelemetry that logs failures without blocking journeys"
key-files:
  created:
    - app/drizzle/0059_assistant_guided_flow_events.sql
    - app/src/server/repositories/guided-flow-telemetry.ts
    - app/src/server/assistant/guided-flow-telemetry.ts
    - app/src/server/assistant/guided-flow-telemetry-lifecycle.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/app/api/assistant/threads/[threadId]/guided-flow/route.ts
    - app/src/app/api/assistant/threads/[threadId]/guided-flow/select-creative/route.ts
    - app/src/app/api/assistant/threads/[threadId]/guided-flow/from-zero/route.ts
key-decisions:
  - "Dedicated assistant_guided_flow_events table instead of beta_analytics_events"
  - "Metadata allowlist with PERSISTENCE_DENYLIST enforcement"
  - "Server-side instrumentation only; no client ingest endpoint"
requirements-completed: [TEL-01, TEL-02, TEL-03, TEL-04]
duration: 25min
completed: 2026-06-26
---

# Phase 190: Guided Journey Telemetry Summary

**Safe guided-flow lifecycle telemetry with scoped repository, metadata sanitizer and server-side route instrumentation.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-26
- **Tasks:** 4/4
- **Files modified:** 14

## Accomplishments

- Added migration `0059_assistant_guided_flow_events` with workspace/client/path/thread indexes.
- Implemented repository insert/list with cross-workspace isolation.
- Defined event keys, blocker categories and metadata sanitizer with non-blocking recording.
- Instrumented guided-flow PATCH and path-specific routes for lifecycle, input and blocker events.

## Task Commits

1. **Schema and repository** - `35855365` (feat)
2. **Telemetry contract and sanitizer** - `41a80dd5` (feat)
3. **Route instrumentation** - `63993e5c` (feat)

## Files Created/Modified

- `app/drizzle/0059_assistant_guided_flow_events.sql` — telemetry table migration
- `app/src/server/repositories/guided-flow-telemetry.ts` — scoped insert/query
- `app/src/server/assistant/guided-flow-telemetry.ts` — event contract and safe recording
- `app/src/server/assistant/guided-flow-telemetry-lifecycle.ts` — PATCH lifecycle helper
- Guided-flow API routes — emit telemetry on mutations

## Verification

- 18 tests passed across repository, sanitizer and route suites
- `npm run build` passed
- Migration journal includes `0059_assistant_guided_flow_events`

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- SUMMARY references commits `35855365`, `41a80dd5`, `63993e5c`
- Migration file exists at `app/drizzle/0059_assistant_guided_flow_events.sql`
