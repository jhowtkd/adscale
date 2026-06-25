---
phase: 171-persistent-product-trust-baseline
plan: 02
subsystem: ui
tags: [react-query, vitest, nextjs, profile-settings]

requires:
  - phase: 171-01
    provides: GET/PATCH /api/user/profile and POST /api/user/profile/avatar
provides:
  - useUserProfile / useUpdateUserProfile / useUploadProfileAvatar hooks
  - API-backed ProfileTab with BrandKit save pattern
affects:
  - 171-03-PLAN.md
  - 171-04-PLAN.md

tech-stack:
  added: []
  patterns:
    - "Profile react-query hooks mirroring use-brand-kit structure"
    - "ProfileTab saveState idle/saving/saved without artificial delay"
    - "Avatar upload deferred to Save with local FileReader preview only"

key-files:
  created:
    - app/src/lib/hooks/use-user-profile.ts
    - app/src/lib/hooks/use-user-profile.test.tsx
  modified:
    - app/src/components/settings/ProfileTab.tsx

key-decisions:
  - "pendingAvatarFile tracked as state (not ref) so Save button reacts to avatar selection"
  - "Email field readOnly+disabled; session email from API only"
  - "Zustand updateProfile left in store; ProfileTab no longer calls it"

patterns-established:
  - "User profile query key: [\"user-profile\"] with STALE_TIME.STATIC"
  - "Profile save uploads avatar first, then PATCHes text fields when both changed"

requirements-completed: [TRUST-01, TRUST-04]

duration: 12min
completed: 2026-06-25
---

# Phase 171 Plan 02: Profile UI API Wiring Summary

**React-query profile hooks and ProfileTab wired to persistent GET/PATCH/avatar APIs with BrandKit-style save states and no fake delay**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-25T08:53:00Z
- **Completed:** 2026-06-25T08:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `use-user-profile` hooks with 4 Vitest tests (fetch, error, PATCH, avatar FormData)
- Rewired ProfileTab to load from API with skeleton, read-only email, and deterministic save
- Removed 800ms fake delay and Zustand `updateProfile` usage from ProfileTab
- `npm run build` and hook tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing hook tests** - `7fb8f434` (test)
2. **Task 1 GREEN: use-user-profile hooks** - `5c863010` (feat)
3. **Task 2: ProfileTab API wiring** - `751c00ba` (feat)

## Files Created/Modified

- `app/src/lib/hooks/use-user-profile.ts` - Profile fetch, PATCH, and avatar upload mutations
- `app/src/lib/hooks/use-user-profile.test.tsx` - Hook unit tests with mocked apiFetch
- `app/src/components/settings/ProfileTab.tsx` - API-backed profile settings UI

## Decisions Made

- `pendingAvatarFile` uses React state so `hasChanges` re-renders when user picks a file
- Avatar uploads on Save (not inline); FileReader used for preview-only until persist
- Store `updateProfile` retained for potential other consumers; ProfileTab no longer uses it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pendingAvatarFile reactivity for Save button**
- **Found during:** Task 2 (ProfileTab rewire)
- **Issue:** Ref-based `pendingAvatarFile` did not trigger re-render; Save stayed disabled after avatar pick
- **Fix:** Switched to `useState<File | null>` for pending avatar tracking
- **Files modified:** `app/src/components/settings/ProfileTab.tsx`
- **Committed in:** `751c00ba`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor UX fix; behavior matches plan intent.

## Issues Encountered

- Concurrent `next build` lock required retry; build succeeded on second attempt

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Profile tab ready for end-to-end verification with migration `0055` applied
- Plan 03 can wire workspace settings tab using same hook/save pattern
- Store profile mock state may still exist for other surfaces until Plan 03/04

## Self-Check: PASSED

- FOUND: app/src/lib/hooks/use-user-profile.ts
- FOUND: app/src/lib/hooks/use-user-profile.test.tsx
- FOUND: app/src/components/settings/ProfileTab.tsx
- FOUND: 7fb8f434, 5c863010, 751c00ba

---
*Phase: 171-persistent-product-trust-baseline*
*Completed: 2026-06-25*
