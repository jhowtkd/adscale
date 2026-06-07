---
phase: 75-event-schema-and-ingest-foundation
plan: 01
subsystem: database
tags: [drizzle, postgres, beta-analytics, vitest]

requires: []
provides:
  - beta_sessions and beta_analytics_events Drizzle models + migration 0033
  - Repository insert/list/getSession helpers for workspace-scoped event storage
affects:
  - 75-02-beta-analytics-sanitize
  - 75-03-ingest-api

tech-stack:
  added: []
  patterns:
    - "Append-only beta_analytics_events with nullable session_id FK (onDelete set null)"
    - "Repository list filters mirroring feedback.ts eq/and/gte/lte pattern"

key-files:
  created:
    - app/drizzle/0033_beta_analytics.sql
    - app/src/server/repositories/beta-analytics.ts
    - app/src/server/repositories/beta-analytics.test.ts
  modified:
    - app/src/server/db/schema.ts
    - app/drizzle/meta/_journal.json

key-decisions:
  - "Used beta_analytics_events and beta_sessions per CONTEXT D-01/D-02 (not product_events)"
  - "Added source column defaulting to client for Phase 78 client/server attribution"
  - "campaign_id and derivation_id as nullable UUID columns matching feedback_reports"

patterns-established:
  - "Beta analytics repository: workspaceId always required in list filters"
  - "getBetaSessionById enforces workspace match for cross-workspace session rejection"

requirements-completed: [INST-01]

duration: 12min
completed: 2026-06-07
---

# Phase 75 Plan 01: Event Schema and Ingest Foundation Summary

**Append-only `beta_analytics_events` + `beta_sessions` schema with workspace-scoped repository insert/list/session lookup**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-07T10:00:00Z
- **Completed:** 2026-06-07T10:12:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `beta_sessions` and `beta_analytics_events` tables added to Drizzle schema with correct FKs and indexes
- Migration `0033_beta_analytics.sql` created with journal entry
- Repository exports `insertBetaAnalyticsEvent`, `listBetaAnalyticsEvents`, `getBetaSessionById`
- Five unit tests pass (workspace scope, combined filters, cross-workspace session rejection)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add beta_sessions and beta_analytics_events to Drizzle schema + migration** - `3fd4392e` (feat)
2. **Task 2: Implement beta-analytics repository** - `84662f4d` (test RED) + `54b70167` (feat GREEN)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `app/src/server/db/schema.ts` - `betaSessions`, `betaAnalyticsEvents` table definitions and inferred types
- `app/drizzle/0033_beta_analytics.sql` - DDL for both tables, FKs, and indexes
- `app/drizzle/meta/_journal.json` - Migration journal entry idx 33
- `app/src/server/repositories/beta-analytics.ts` - Insert, list, and session lookup helpers
- `app/src/server/repositories/beta-analytics.test.ts` - Mocked Vitest coverage

## Decisions Made

- Followed CONTEXT lock on `beta_analytics_events` naming (zero `product_events` in schema)
- `source` text column with default `'client'` per research open-question resolution
- No session CRUD routes (D-03) — DDL and lookup only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run db:generate` requires `DATABASE_URL` — migration written manually to match Drizzle conventions; schema matches SQL file.

## User Setup Required

None - no external service configuration required. Operator must apply migration `0033` on deploy (`npm run db:migrate`).

## Next Phase Readiness

- INST-01 storage/query foundation ready for Plan 02 (sanitize) and Plan 03 (ingest API)
- `getBetaSessionById` available for session FK validation at ingest time

## Self-Check: PASSED

- FOUND: app/drizzle/0033_beta_analytics.sql
- FOUND: app/src/server/repositories/beta-analytics.ts
- FOUND: 3fd4392e, 84662f4d, 54b70167

---
*Phase: 75-event-schema-and-ingest-foundation*
*Completed: 2026-06-07*
