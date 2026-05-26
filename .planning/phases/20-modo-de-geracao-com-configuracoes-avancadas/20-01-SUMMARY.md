---
phase: 20-modo-de-geracao-com-configuracoes-avancadas
plan: 20-01
subsystem: api
 tags: [openai, zod, cta, creativity-profile, ai-suggestions]

# Dependency graph
requires:
  - phase: 19-analise-visual-e-deducao-com-ia
    provides: AI analysis infrastructure, asset metadata storage
provides:
  - Extended AI deduction schema with creativity profile and CTA suggestions
  - AI-powered creativity level suggestion (conservative/balanced/bold) based on visual analysis
  - AI-powered CTA suggestion endpoint returning 3 contextual CTAs in Portuguese
  - CTA suggestion caching in campaign platformSpecificNotes
affects:
  - 20-02-generation-mode-ui
  - 20-03-flow-integration

# Tech tracking
tech-stack:
  added: []
  patterns:
    - OpenAI structured output with zodResponseFormat for suggestion generation
    - Campaign metadata caching via platformSpecificNotes for CTA suggestions

key-files:
  created:
    - app/src/app/api/campaigns/[id]/suggest-ctas/route.ts
    - app/src/app/api/campaigns/[id]/suggest-ctas/route.test.ts
  modified:
    - app/src/server/validation/ai-deduction.ts
    - app/src/server/ai/campaign-deduction.ts
    - app/src/server/ai/campaign-deduction.test.ts
    - app/src/components/workspace/CreativeDiagnosisCard.tsx

key-decisions:
  - Used platformSpecificNotes as metadata cache for CTA suggestions (no schema migration needed)
  - CTAs generated in Portuguese (Brazilian) targeting the local market
  - Default fallback suggestions provided when AI fails or returns empty

patterns-established:
  - "AI suggestions: Structured output schema extends existing deduction response"
  - "Caching: Campaign metadata reused for suggestion caching without new fields"

requirements-completed:
  - GEN-05
  - GEN-06

# Metrics
duration: 45min
completed: 2026-05-26
---

# Phase 20 Plan 01: Backend AI Suggestions for Generation Mode Summary

**Extended AI analysis infrastructure to suggest creativity profiles and CTAs based on visual analysis and campaign context, with dedicated CTA generation endpoint and caching**

## Performance

- **Duration:** 52 min
- **Started:** 2026-05-26T19:20:00Z
- **Completed:** 2026-05-26T20:12:00Z
- **Tasks:** 5
- **Files modified:** 6

## Accomplishments
- Extended AI deduction schema with `suggestedCreativeLevel` and `suggestedCtas` fields
- Updated campaign deduction AI to analyze visual complexity and suggest creativity profiles
- Updated campaign deduction AI to suggest up to 3 contextual CTAs in Portuguese
- Created new `/api/campaigns/[id]/suggest-ctas` POST endpoint with input validation
- Implemented CTA suggestion caching via campaign `platformSpecificNotes`
- Added comprehensive tests for new suggestion logic and endpoint behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend AI Deduction Schema** - `a57a291` (feat)
2. **Task 2: Update Campaign Deduction AI** - `cbffa63` (feat)
3. **Task 3: Update Analyze Endpoint** - No changes needed (backward compatible)
4. **Task 4: Create CTA Suggestions Endpoint** - `0864760` (feat)
5. **Task 5: Add Tests** - `1e3889d` (test)
6. **Build Fix** - `71aefc4` (fix) — Fixed pre-existing TypeScript error in CreativeDiagnosisCard

## Files Created/Modified
- `app/src/server/validation/ai-deduction.ts` - Added `aiSuggestionSchema` with creative level and CTA fields
- `app/src/server/ai/campaign-deduction.ts` - Extended prompt and schema for suggestions
- `app/src/app/api/campaigns/[id]/suggest-ctas/route.ts` - New CTA suggestions endpoint
- `app/src/server/ai/campaign-deduction.test.ts` - Tests for creativity profile and CTA suggestions
- `app/src/app/api/campaigns/[id]/suggest-ctas/route.test.ts` - Tests for CTA endpoint
- `app/src/components/workspace/CreativeDiagnosisCard.tsx` - Fixed missing props in component interface

## Decisions Made
- Used `platformSpecificNotes` JSONB field for CTA caching to avoid schema migration
- Portuguese CTAs target the Brazilian market as primary user base
- Default fallback CTAs ensure endpoint always returns useful suggestions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing TypeScript error in CreativeDiagnosisCard**
- **Found during:** Build verification after Task 4
- **Issue:** `BriefingStep.tsx` passed `canGenerate` and `generateDisabledReason` props to `CreativeDiagnosisCard`, but the component interface didn't include them, causing a TypeScript build failure
- **Fix:** Added `canGenerate` and `generateDisabledReason` optional props to `CreativeDiagnosisCardProps` interface, destructured them in the component, and used them to disable the generate button with a reason message
- **Files modified:** `app/src/components/workspace/CreativeDiagnosisCard.tsx`
- **Verification:** `npm run build` passes after fix
- **Committed in:** `71aefc4`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal — fix for pre-existing type mismatch from plan 19-02, required for build to pass. No scope creep.

## Issues Encountered
- Pre-existing `as any` patterns in test files caused lint errors; these are legacy patterns across the test suite and were not introduced by this plan
- Pre-existing TypeScript prop mismatch in `CreativeDiagnosisCard` from plan 19-02 blocked build; fixed as deviation

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend AI suggestion infrastructure complete
- Ready for 20-02: Generation Mode UI to consume suggestion endpoints
- Ready for 20-03: Flow Integration to wire suggestions into generation flow

---
*Phase: 20-modo-de-geracao-com-configuracoes-avancadas*
*Completed: 2026-05-26*
