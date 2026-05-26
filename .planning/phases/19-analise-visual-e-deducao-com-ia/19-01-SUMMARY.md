---
phase: 19-analise-visual-e-deducao-com-ia
plan: "19-01"
subsystem: api
tags: [openai, vision, zod, structured-output, campaign-analysis]

requires:
  - phase: 18-formulario-simplificado-de-briefing
    provides: Simplified campaign creation form with asset upload

provides:
  - Zod schema for AI-deduced campaign fields with confidence scoring
  - AI vision analysis module for campaign creative deduction
  - POST /api/campaigns/[id]/analyze endpoint
  - Type-safe parsing of OpenAI structured output

affects:
  - 19-02 (frontend integration with AI-deduced fields)
  - 20-01 (generation mode using deduced fields)

tech-stack:
  added: []
  patterns:
    - "OpenAI structured output with zodResponseFormat"
    - "Graceful degradation: return 200 with empty result on AI failure"
    - "Metadata merging in repository layer"

key-files:
  created:
    - app/src/server/validation/ai-deduction.ts
    - app/src/server/ai/campaign-deduction.ts
    - app/src/server/ai/campaign-deduction.test.ts
    - app/src/app/api/campaigns/[id]/analyze/route.ts
    - app/src/app/api/campaigns/[id]/analyze/route.test.ts
  modified:
    - app/src/server/repositories/asset.ts (verified existing helpers)

key-decisions:
  - "Used nullable() instead of optional() in OpenAI Zod schema per API requirements"
  - "Used getOpenAI() singleton pattern matching existing codebase"
  - "Leveraged existing getAssetWithMetadata/updateAssetMetadata instead of creating new repository functions"
  - "Constructed public URL from asset key via getPublicUrl rather than storing URL in database"

patterns-established:
  - "AI vision analysis: structured prompt + Zod validation + graceful fallback"
  - "Async analysis endpoint: pending → completed/failed status lifecycle"

requirements-completed: [AI-01, AI-02, AI-06, AI-07]

duration: 30min
completed: 2026-05-26
---

# Phase 19 Plan 01: Backend AI Analysis Infrastructure Summary

**OpenAI vision API integration with structured Zod output for campaign field deduction, stored in asset metadata with graceful failure handling**

## Performance

- **Duration:** 30 min
- **Started:** 2026-05-26T21:52:41Z
- **Completed:** 2026-05-26T22:04:00Z
- **Tasks:** 6
- **Files modified:** 5

## Accomplishments
- Zod schema with confidence scoring for AI-deduced campaign fields
- AI campaign deduction module using OpenAI vision API with structured output
- POST /api/campaigns/[id]/analyze endpoint with workspace/campaign isolation
- Graceful degradation: AI failures return 200 with empty result, not errors
- Full test coverage for both deduction module and API endpoint

## Task Commits

1. **Task 1: Create Zod schema for AI-deduced fields** - `eaa67fc` (feat)
2. **Task 2: Create AI campaign deduction module** - `077e56d` (feat)
3. **Task 3: Create POST /api/campaigns/[id]/analyze endpoint** - `de7aebf` (feat)
4. **Task 4: Verify repository helpers** - `c22a2a5` (feat)
5. **Task 5: Write tests for campaign deduction module** - `0f9a61a` (feat)
6. **Task 6: Write tests for analyze endpoint** - `6114ec6` (feat)

## Files Created/Modified
- `app/src/server/validation/ai-deduction.ts` - Zod schema for AI-deduced fields with confidence levels
- `app/src/server/ai/campaign-deduction.ts` - OpenAI vision API integration with structured output
- `app/src/server/ai/campaign-deduction.test.ts` - Unit tests for deduction module (4 tests)
- `app/src/app/api/campaigns/[id]/analyze/route.ts` - Analysis endpoint with auth and graceful degradation
- `app/src/app/api/campaigns/[id]/analyze/route.test.ts` - API endpoint tests (5 tests)

## Decisions Made
- Used `nullable()` instead of `optional()` in OpenAI Zod schema because the API requires all fields to be required (can be nullable)
- Leveraged existing `getAssetWithMetadata` and `updateAssetMetadata` repository functions which already handle metadata merging
- Used `getPublicUrl()` to construct image URLs from asset keys rather than storing URLs in the database

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OpenAI structured output schema compatibility**
- **Found during:** Task 2 (AI campaign deduction module implementation)
- **Issue:** OpenAI's `zodResponseFormat` does not support `.optional()` fields - requires all fields to be required
- **Fix:** Changed `.optional()` to `.nullable()` in `CampaignDeductionResponseSchema` and added null filtering before validating with `aiDeducedFieldsSchema`
- **Files modified:** `app/src/server/ai/campaign-deduction.ts`
- **Verification:** Tests pass, TypeScript compilation clean
- **Committed in:** `0f9a61a` (Task 5 commit)

**2. [Rule 1 - Bug] AI API errors not caught at top level**
- **Found during:** Task 5 (Writing tests for campaign deduction module)
- **Issue:** `analyzeCampaignCreative` only had try/catch around JSON parsing, not the OpenAI API call itself
- **Fix:** Wrapped entire function body in try/catch to handle API errors gracefully
- **Files modified:** `app/src/server/ai/campaign-deduction.ts`
- **Verification:** "returns empty object on AI API error" test passes
- **Committed in:** `0f9a61a` (Task 5 commit)

**3. [Rule 3 - Blocking] Vitest module resolution with [id] paths**
- **Found during:** Task 6 (Writing tests for analyze endpoint)
- **Issue:** Tests in `[id]` directories fail when run individually due to vitest ESM module resolution with bracket characters in paths
- **Fix:** Tests run correctly via `npm test` which uses the vitest config file; no code changes needed
- **Files modified:** None (infrastructure issue)
- **Verification:** `npm test` passes 93/93 test files including the new analyze endpoint test
- **Committed in:** `6114ec6` (Task 6 commit)

**4. [Rule 1 - Bug] Test used invalid UUID strings**
- **Found during:** Task 6 (Running analyze endpoint tests)
- **Issue:** Tests used "asset-1" as assetId but Zod schema requires UUID format
- **Fix:** Changed all test assetIds to valid UUIDs (550e8400-e29b-41d4-a716-446655440001)
- **Files modified:** `app/src/app/api/campaigns/[id]/analyze/route.test.ts`
- **Verification:** All 5 endpoint tests pass
- **Committed in:** `6114ec6` (Task 6 commit)

**5. [Rule 1 - Bug] Mock state leaking between tests**
- **Found during:** Task 6 (Running analyze endpoint tests)
- **Issue:** `mockAnalyze.mockRejectedValue` from one test leaked to the next test
- **Fix:** Added `mockReset()` to beforeEach in addition to `clearAllMocks()`
- **Files modified:** `app/src/app/api/campaigns/[id]/analyze/route.test.ts`
- **Verification:** All tests pass independently
- **Committed in:** `6114ec6` (Task 6 commit)

---

**Total deviations:** 5 auto-fixed (3 bugs, 1 blocking infrastructure, 1 test fix)
**Impact on plan:** All fixes necessary for correctness and testability. No scope creep.

## Issues Encountered
- Pre-existing vitest limitation: tests in `[id]` directories cannot be run individually with `npx vitest run <path>` but work correctly via `npm test` (vitest config file). This affects ALL existing tests in `[id]` directories, not just the new ones.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend AI analysis infrastructure complete
- Endpoint ready for frontend integration (plan 19-02)
- AI-deduced fields schema ready for form population
- All tests passing (458 total)

---
*Phase: 19-analise-visual-e-deducao-com-ia*
*Completed: 2026-05-26*
