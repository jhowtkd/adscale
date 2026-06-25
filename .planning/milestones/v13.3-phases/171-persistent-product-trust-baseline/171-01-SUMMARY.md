---
phase: 171-persistent-product-trust-baseline
plan: 01
subsystem: api
tags: [drizzle, nextjs, vitest, r2, zod, workspace-auth]

requires: []
provides:
  - Additive user/workspaces schema columns for profile and workspace settings
  - GET/PATCH /api/user/profile with session auth and zod validation
  - POST /api/user/profile/avatar with R2 upload and magic-byte checks
  - GET/PATCH /api/workspace/settings with owner/admin PATCH guard
affects:
  - 171-02-PLAN.md
  - 171-03-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Session-scoped profile API mirroring /api/user/locale"
    - "Workspace settings via requireWorkspaceAccess + requireRole on PATCH"
    - "Avatar upload reuses brand-kit R2 + magic-byte validation"
    - "Slug conflict pre-check before workspace update"

key-files:
  created:
    - app/drizzle/0055_user_workspace_settings.sql
    - app/src/server/repositories/user-profile.ts
    - app/src/app/api/user/profile/route.ts
    - app/src/app/api/user/profile/avatar/route.ts
    - app/src/app/api/workspace/settings/route.ts
    - app/src/app/api/user/profile/route.test.ts
    - app/src/app/api/user/profile/avatar/route.test.ts
    - app/src/app/api/workspace/settings/route.test.ts
  modified:
    - app/src/server/db/schema.ts
    - app/src/server/repositories/workspace.ts

key-decisions:
  - "Profile email remains read-only; PATCH uses zod .strict() to reject email field"
  - "Workspace slug conflicts return 409 via pre-update lookup, not DB error parsing"
  - "Nullable DB columns serialize as empty strings in workspace settings GET responses"

patterns-established:
  - "User name split/join: first token → firstName, remainder → lastName"
  - "Route tests mock request.formData for File uploads in Vitest"

requirements-completed: [TRUST-01, TRUST-02, TRUST-04]

duration: 25min
completed: 2026-06-25
---

# Phase 171 Plan 01: Persistent Settings APIs Summary

**Additive Drizzle schema plus authenticated profile/workspace settings APIs with R2 avatar upload and role-guarded workspace PATCH**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-25T08:47:00Z
- **Completed:** 2026-06-25T08:52:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added nullable `bio`/`timezone` on `user` and `description`/`industry`/`website`/`timezone` on `workspaces` with migration `0055_user_workspace_settings.sql`
- Shipped profile GET/PATCH and avatar POST APIs with full Vitest route coverage (10 tests)
- Shipped workspace settings GET/PATCH with member read / owner-admin write and slug uniqueness guard (6 tests)
- `npm run build` and all 16 route tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add schema columns and Drizzle migration** - `12747f51` (feat)
2. **Task 2: Profile API and avatar upload** - `3efc4d4a` (test RED) + `c3ef3b73` (feat GREEN)
3. **Task 3: Workspace settings API with role guard** - `406f60e2` (test RED) + `3d89730a` (feat GREEN)

## Files Created/Modified

- `app/drizzle/0055_user_workspace_settings.sql` - Additive migration for new columns
- `app/src/server/db/schema.ts` - Drizzle column definitions
- `app/src/server/repositories/user-profile.ts` - Profile read/update/avatar helpers
- `app/src/server/repositories/workspace.ts` - Settings read/update + slug conflict error
- `app/src/app/api/user/profile/route.ts` - Profile GET/PATCH
- `app/src/app/api/user/profile/avatar/route.ts` - Avatar POST to R2
- `app/src/app/api/workspace/settings/route.ts` - Workspace settings GET/PATCH
- `app/src/app/api/user/profile/route.test.ts` - Profile route tests
- `app/src/app/api/user/profile/avatar/route.test.ts` - Avatar route tests
- `app/src/app/api/workspace/settings/route.test.ts` - Workspace settings route tests

## Decisions Made

- Profile PATCH rejects `email` via zod `.strict()` rather than silent ignore
- Workspace slug uniqueness checked before update for deterministic 409 responses
- Avatar server cap remains 10MB (brand-kit pattern); client ProfileTab keeps 5MB check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test] Avatar route tests mock formData**
- **Found during:** Task 2 (GREEN)
- **Issue:** Vitest `FormData` + `File` caused webidl assertion errors in Node
- **Fix:** Mirrored campaigns upload test pattern with `vi.spyOn(req, "formData")`
- **Files modified:** `app/src/app/api/user/profile/avatar/route.test.ts`
- **Committed in:** `c3ef3b73`

**2. [Rule 1 - Test] Workspace settings partial module mock**
- **Found during:** Task 3 (GREEN)
- **Issue:** Full workspace repository mock omitted `toWorkspaceSettingsResponse` export
- **Fix:** Used `importOriginal` partial mock preserving real helpers/errors
- **Files modified:** `app/src/app/api/workspace/settings/route.test.ts`
- **Committed in:** `3d89730a`

---

**Total deviations:** 2 auto-fixed (2 test fixes)
**Impact on plan:** Test infrastructure only; API behavior matches plan.

## Issues Encountered

None blocking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend persistence layer ready for Plan 02 (react-query hooks + settings tab wiring)
- UI still uses Zustand mock state until Plan 02/03
- Migration `0055` must be applied in deployed environments before columns are live

## Self-Check: PASSED

- FOUND: app/drizzle/0055_user_workspace_settings.sql
- FOUND: app/src/app/api/user/profile/route.ts
- FOUND: app/src/app/api/workspace/settings/route.ts
- FOUND: 12747f51, 3efc4d4a, c3ef3b73, 406f60e2, 3d89730a

---
*Phase: 171-persistent-product-trust-baseline*
*Completed: 2026-06-25*
