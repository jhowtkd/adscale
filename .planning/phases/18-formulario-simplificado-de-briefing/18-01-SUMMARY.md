---
phase: 18-formulario-simplificado-de-briefing
plan: "18-01"
subsystem: api
tags: [zod, nextjs, api, campaigns, typescript]

requires:
  - phase: 15-regua-de-criatividade
    provides: Campaign creation infrastructure and generation modes

provides:
  - Simplified campaign creation endpoint accepting only 3 required fields
  - API validation tests for simplified schema
  - Frontend hook updated to send minimal payload

affects:
  - 18-02 (simplified creation UI)
  - 19-01 (AI visual analysis)

tech-stack:
  added: []
  patterns:
    - "Required-but-nullable fields for optional references"
    - "Simplified DTOs with backward-compatible optional fields"

key-files:
  created: []
  modified:
    - app/src/app/api/campaigns/route.ts
    - app/src/app/api/campaigns/route.test.ts
    - app/src/components/campaigns/useCampaignsPage.ts
    - app/src/components/campaigns/NewCampaignModal.tsx
    - app/src/lib/hooks/use-campaigns.ts

key-decisions:
  - "Made client required (was optional) to align with simplified brief requirements"
  - "Made clientProfileId required-but-nullable instead of optional to enforce explicit choice"
  - "Preserved all other fields as optional for backward compatibility"
  - "Mocked api-response module in tests to avoid next-intl dependency issues"

patterns-established:
  - "Schema defaults (creativeLevel: balanced) are preserved in API payload"

requirements-completed:
  - BRIEF-01
  - BRIEF-03

duration: 9min
completed: 2026-05-26
---

# Phase 18 Plan 01: Backend API Simplification Summary

**Simplified POST /api/campaigns to accept only name, client, and clientProfileId as required fields, with all other fields optional. Updated frontend creation hook and modal to send minimal payload.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-26T18:24:00Z
- **Completed:** 2026-05-26T21:33:47Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments
- API schema updated: `client` now required, `clientProfileId` required-but-nullable
- All other campaign fields remain optional for backward compatibility
- API tests cover minimal creation, missing client rejection, missing name rejection
- Frontend hook simplified to only send name, client, clientProfileId
- NewCampaignModal updated to match new onSubmit signature

## Task Commits

Each task was committed atomically:

1. **Task 1: Update API schema** - `d245ba2` (feat)
2. **Task 2: Verify clientProfileId validation** - (no code changes, validation already existed)
3. **Task 3: Update API tests** - `7655cf2` (test)
4. **Task 4: Update frontend hook and modal** - `a014c71` (feat)

**Plan metadata:** `docs(18-01): complete plan` (pending)

## Files Created/Modified
- `app/src/app/api/campaigns/route.ts` - Updated createCampaignSchema (client required, clientProfileId required-but-nullable)
- `app/src/app/api/campaigns/route.test.ts` - Added POST validation tests with mocked api-response
- `app/src/components/campaigns/useCampaignsPage.ts` - Simplified handleCreateCampaign to accept/send only required fields
- `app/src/components/campaigns/NewCampaignModal.tsx` - Updated onSubmit prop and handleSubmit to match simplified payload
- `app/src/lib/hooks/use-campaigns.ts` - Updated createCampaign type to accept `string | null` for clientProfileId

## Decisions Made
- Made `client` required to align with BRIEF-01 requirement (name, client, clientProfileId are the only required fields)
- Made `clientProfileId` required-but-nullable to enforce explicit choice while allowing "no profile" selection
- Preserved all other fields as optional to maintain backward compatibility with existing integrations
- Mocked `@/lib/api-response` in tests to avoid next-intl `getTranslations` issues in test environment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] creativeLevel default included in parsed data**
- **Found during:** Task 3 (API test implementation)
- **Issue:** Test assertion expected only name/client/clientProfileId/status, but Zod schema adds `creativeLevel: "balanced"` as default
- **Fix:** Updated test assertion to include `creativeLevel: "balanced"` in expected createCampaign call
- **Files modified:** app/src/app/api/campaigns/route.test.ts
- **Verification:** Tests pass
- **Committed in:** 7655cf2 (Task 3 commit)

**2. [Rule 1 - Bug] next-intl getTranslations not available in test environment**
- **Found during:** Task 3 (Running API tests)
- **Issue:** `apiError` function uses `getTranslations` from next-intl which throws in test environment
- **Fix:** Mocked `@/lib/api-response` module in tests to return simple Response objects
- **Files modified:** app/src/app/api/campaigns/route.test.ts
- **Verification:** All POST validation tests pass
- **Committed in:** 7655cf2 (Task 3 commit)

**3. [Rule 3 - Blocking] Type mismatch between useCreateCampaign and simplified payload**
- **Found during:** Task 4 (TypeScript compilation check)
- **Issue:** `useCreateCampaign` hook expected `clientProfileId?: string` but simplified payload passes `string | null`
- **Fix:** Updated hook type to `clientProfileId?: string | null`
- **Files modified:** app/src/lib/hooks/use-campaigns.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** a014c71 (Task 4 commit)

**4. [Rule 3 - Blocking] NewCampaignModal onSubmit type mismatch**
- **Found during:** Task 4 (TypeScript compilation check)
- **Issue:** Modal's onSubmit prop expected old complex type, but handleCreateCampaign now accepts simplified type
- **Fix:** Updated NewCampaignModalProps interface and handleSubmit to use simplified payload
- **Files modified:** app/src/components/campaigns/NewCampaignModal.tsx
- **Verification:** TypeScript compilation passes
- **Committed in:** a014c71 (Task 4 commit)

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and type safety. No scope creep.

## Issues Encountered
None - plan executed as written with only expected type adjustments.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend API simplification complete
- Frontend ready for simplified creation UI (18-02)
- Type system aligned between API, hooks, and components

---
*Phase: 18-formulario-simplificado-de-briefing*
*Completed: 2026-05-26*
