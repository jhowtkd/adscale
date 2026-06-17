---
phase: 125-canonical-output-learnings
plan: "01-03"
subsystem: database
tags: [postgres, output-learning, mem0, drizzle, aggregation]

requires:
  - phase: 124-output-signal-capture
    provides: output_decision_events canonical evidence store
provides:
  - client_output_learnings Postgres table and Drizzle schema
  - Evidence aggregation with confidence and supersession
  - recomputeClientOutputLearnings service and API
  - Mem0 projection for approved output learnings only
affects:
  - 126-next-generation-recommendation-application
  - 127-safety-boundaries-explainability

tech-stack:
  added: []
  patterns:
    - "Mirror client_performance_learnings sync/upsert/remove transaction"
    - "Best-effort recompute dispatch after evidence insert"
    - "Scoped learning identity by workspace/client/mode/format"

key-files:
  created:
    - app/drizzle/0042_client_output_learnings.sql
    - app/src/server/output-learning/types.ts
    - app/src/server/output-learning/variable-value.ts
    - app/src/server/output-learning/aggregate.ts
    - app/src/server/output-learning/confidence.ts
    - app/src/server/output-learning/service.ts
    - app/src/server/output-learning/dispatch.ts
    - app/src/server/repositories/client-output-learning.ts
    - app/src/server/memory/output-learning-projection.ts
    - app/src/app/api/client-profiles/[id]/output-learnings/route.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/output-learning/output-decision-recorder.ts
    - app/src/server/repositories/output-decision-event.ts

key-decisions:
  - "Learning identity scoped by scope_generation_mode and scope_format with empty-string sentinel"
  - "Five bounded variable keys: cta, generation_mode, format, style_policy, avoid_pattern"
  - "avoid_pattern uses negative/corrective actions as supporting evidence"
  - "Mem0 memoryType output_learning; only approved rows projected"

patterns-established:
  - "Output learning aggregation mirrors performance learning with event-strength weighting"
  - "Supersession when contradicting weighted evidence meets or exceeds supporting"

requirements-completed: [LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-05]

duration: 25min
completed: 2026-06-16
---

# Phase 125: Canonical Output Learnings Summary

**Output decision evidence aggregates into scoped Postgres learnings with confidence, supersession, and Mem0 projection for approved rows only.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-16T21:25:00Z
- **Completed:** 2026-06-16T21:32:00Z
- **Tasks:** 3/3
- **Files modified:** 28

## Accomplishments

- `client_output_learnings` table (migration 0042) with evidence packets, confidence, status lifecycle, and scoped unique identity
- Pure aggregation from `output_decision_events` with strength-weighted confidence and supersession when contradicted
- `recomputeClientOutputLearnings` service, GET/POST API, and best-effort dispatch after evidence capture
- Mem0 projection module projecting only `approved` learnings (`memoryType: output_learning`)

## Task Commits

1. **Task 1: Schema and bounded types** - `063229e1` (feat)
2. **Task 2: Aggregate, confidence, repository sync** - `30aa134e` (feat)
3. **Task 3: Service, Mem0, API, dispatch** - `c82d49a5` (feat)

## Files Created/Modified

- `app/drizzle/0042_client_output_learnings.sql` - Postgres migration
- `app/src/server/output-learning/aggregate.ts` - Event → learning draft aggregation
- `app/src/server/output-learning/confidence.ts` - Strength-weighted confidence and approval/supersession rules
- `app/src/server/repositories/client-output-learning.ts` - Sync upsert/remove transaction
- `app/src/server/output-learning/service.ts` - `recomputeClientOutputLearnings`
- `app/src/server/memory/output-learning-projection.ts` - Mem0 projection (approved only)
- `app/src/app/api/client-profiles/[id]/output-learnings/route.ts` - List and recompute API

## Deviations from Plan

None - plan executed as written. Phase 124 prerequisite files (0041 migration, output-decision-events) bundled in commit 1 because they were uncommitted on main.

## Verification

- `npm test -- --run tests/unit/output-learning/` — 32 passed
- `npm run lint` — 0 errors (pre-existing warnings only)
- `npm run build` — success; `/api/client-profiles/[id]/output-learnings` route registered

## Self-Check: PASSED

- FOUND: app/drizzle/0042_client_output_learnings.sql
- FOUND: app/src/server/output-learning/service.ts
- FOUND: app/src/server/memory/output-learning-projection.ts
- FOUND: commit 063229e1
- FOUND: commit 30aa134e
- FOUND: commit c82d49a5
