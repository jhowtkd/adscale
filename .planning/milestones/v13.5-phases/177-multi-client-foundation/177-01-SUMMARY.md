---
phase: 177-multi-client-foundation
plan: 01
subsystem: database
tags: [postgres, drizzle, client-profiles, brand-kit, mem0, multi-tenant]

requires: []
provides:
  - Multiple client_profiles per workspace without workspace_id uniqueness
  - Profile-aware brand kit read/write/delete/logo flows with ambiguity guards
  - Client-profile-scoped brand memory user ids and metadata filters
  - Deterministic campaign client profile resolution with regression tests
affects:
  - 178-conversation-persistence
  - 179-model-adapter-and-tool-policy
  - 181-assistant-surface

tech-stack:
  added: []
  patterns:
    - "Resolve brand kit by explicit clientProfileId or sole workspace profile; 409 on ambiguity"
    - "Scope mem0 user ids as prefix_workspaceId_clientProfileId when profile known"
    - "Resolve campaign brand context via resolveCampaignClientProfileId before brand kit fetch"

key-files:
  created:
    - app/drizzle/0056_client_profiles_multi_workspace.sql
    - app/src/server/db/repositories/brand-kit.test.ts
    - app/src/app/api/workspace/brand-kit/route.test.ts
    - app/src/app/api/workspace/brand-kit/logo/route.test.ts
    - app/src/server/memory/output-learning-projection.test.ts
    - app/src/server/repositories/client-learning.test.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/db/repositories/brand-kit.ts
    - app/src/server/memory/mem0-client.ts
    - app/src/server/memory/brand-memory-context.ts
    - app/src/server/jobs/derivation.ts

key-decisions:
  - "Brand kit ambiguity returns HTTP 409 instead of mutating an arbitrary profile"
  - "Mem0 isolation uses profile-suffixed user ids plus metadata filters on search"
  - "Legacy workspace brand-kit endpoints accept optional clientProfileId query/body field"

patterns-established:
  - "Profile resolution order: explicit id → exact name match → sole profile → null"
  - "Write paths require clientProfileId when a workspace has multiple profiles"

requirements-completed: [CLIENT-01, CLIENT-02, CLIENT-03]

duration: 11min
completed: 2026-06-25
---

# Phase 177 Plan 01: Multi-Client Foundation Summary

**Dropped the one-profile-per-workspace DB constraint and made brand kit plus learned memory resolve and isolate by `clientProfileId`.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-25T14:24:44Z
- **Completed:** 2026-06-25T14:35:30Z
- **Tasks:** 5
- **Files modified:** 24

## Accomplishments

- Migration `0056` removes `client_profiles_workspace_id_unique` while keeping the workspace index; Drizzle schema no longer marks `workspace_id` unique.
- Brand kit repository and API routes target a specific profile or the sole workspace profile; ambiguous multi-profile writes return 409.
- Mem0 user scope, ingestion, retrieval, and projection paths include `clientProfileId` isolation with regression tests.
- Derivation and copy-variant flows resolve campaign brand kit through `resolveCampaignClientProfileId`.

## Task Commits

1. **Task 1: Finalize multi-profile database shape** - `9542be56` (feat)
2. **Task 2: Lock client-profile creation and campaign resolution semantics** - `378e253e` (test)
3. **Task 3: Make brand kit profile-aware** - `a37fcc9e` (feat)
4. **Task 4: Enforce client-profile memory isolation** - `98ed100d` (feat)
5. **Task 5: Run cross-client regression sweep** - `295b1351` (test)

## Files Created/Modified

- `app/drizzle/0056_client_profiles_multi_workspace.sql` - Drops workspace uniqueness; ensures index remains
- `app/src/server/db/repositories/brand-kit.ts` - Profile-aware brand kit helpers and ambiguity errors
- `app/src/server/memory/mem0-client.ts` - Profile-scoped mem0 user ids
- `app/src/app/api/workspace/brand-kit/route.ts` - Optional `clientProfileId` and 409 ambiguity handling
- `app/src/server/jobs/derivation.ts` - Campaign-resolved brand kit and profile-scoped memory fetch

## Decisions Made

- Ambiguous brand-kit mutations return `brandKitAmbiguous` (409) rather than picking the first profile.
- First-time brand kit creation still inserts a profile when none exist (legacy single-workspace onboarding).
- Mem0 uses both profile-suffixed user ids and metadata filters for defense in depth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered missing drizzle journal entries for 0055/0056**
- **Found during:** Task 1 (drizzle-kit check)
- **Issue:** `0055_user_workspace_settings.sql` and new `0056` were not tracked in `_journal.json`
- **Fix:** Added journal entries so migration ordering is consistent
- **Files modified:** `app/drizzle/meta/_journal.json`
- **Committed in:** `9542be56`

**2. [Rule 1 - Bug] Updated derivation and copy-variant tests for new brand kit API**
- **Found during:** Task 5 (full test sweep)
- **Issue:** Tests mocked `getBrandKitByWorkspace` / omitted `resolveCampaignClientProfileId`
- **Fix:** Adjusted mocks and expectations for profile-aware resolution
- **Files modified:** `app/src/server/jobs/derivation.test.ts`, `app/src/app/api/derivations/[id]/copy-variants/route.test.ts`
- **Committed in:** `295b1351`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Required for migration consistency and test correctness; no scope creep.

## Issues Encountered

- Full `npm test` still reports unrelated pre-existing failures in human-quality calibration and UI fixture tests; all phase-177 targeted tests, build, and `drizzle-kit check` pass.

## Deferred Issues

| Area | Notes |
|------|-------|
| Unrelated suite failures | `calibration-evaluated-repository`, `corpus-learning-loop`, `BrandTasteProfilePanel`, `mode-format-regression` — pre-existing outside phase scope |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 178 can persist assistant threads scoped by `clientProfileId` on top of the multi-profile foundation.
- Run migration `0056` on live/staging databases before creating a second profile in production workspaces.

## Self-Check: PASSED

- FOUND: `.planning/milestones/v13.5-phases/177-multi-client-foundation/177-01-SUMMARY.md`
- FOUND: `9542be56`, `378e253e`, `a37fcc9e`, `98ed100d`, `295b1351`

---
*Phase: 177-multi-client-foundation*
*Completed: 2026-06-25*
