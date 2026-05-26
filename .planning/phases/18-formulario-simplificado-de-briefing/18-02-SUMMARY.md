---
phase: 18-formulario-simplificado-de-briefing
plan: "18-02"
subsystem: ui
tags: [react, next-intl, shadcn-ui, typescript]

# Dependency graph
requires:
  - phase: 18-01
    provides: Simplified campaign creation API (POST accepts only name, client, clientProfileId)
provides:
  - Single-page campaign creation modal with 3 required fields
  - Client profile selector using useClientProfiles hook
  - Optional key creative upload zone
  - i18n translations for simplified form (PT-BR and EN)
affects:
  - Phase 19 (AI visual analysis will use the upload zone)
  - Phase 21 (Briefing Doctor removal will clean up old wizard code)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Simplified form state: 3 required fields only"
    - "Optional upload zone with visual feedback (no actual upload in modal)"
    - "Client profile dropdown with loading state"

key-files:
  created: []
  modified:
    - app/src/components/campaigns/NewCampaignModal.tsx
    - app/src/components/campaigns/useCampaignsPage.ts
    - app/src/app/(dashboard)/campaigns/page.tsx
    - app/messages/pt-BR.json
    - app/messages/en.json

key-decisions:
  - "Upload zone is visual-only in creation modal; actual upload happens in campaign workspace"
  - "Client profile selector uses native select element with ChevronDown icon for consistency"
  - "Removed template selector, generation mode cards, target format buttons, constraints/notes fields"
  - "Placeholders use existing briefing namespace keys (namePlaceholder, clientPlaceholder)"

patterns-established:
  - "Simplified creation form: only name, client, clientProfileId required"
  - "Optional upload indicator: shows upload zone without blocking submission"
  - "Form validation clears field errors on re-entry after touch"

requirements-completed: [BRIEF-01, BRIEF-02, BRIEF-03, BRIEF-04]

# Metrics
duration: 25min
completed: 2026-05-26T21:42:00Z
---

# Phase 18 Plan 02: Frontend Simplified Creation Form Summary

**Single-page campaign creation modal with exactly 3 required fields (name, client, clientProfileId) and optional key creative upload zone, fully i18n-ready**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-26T21:17:00Z
- **Completed:** 2026-05-26T21:42:00Z
- **Tasks:** 6 (Tasks 1-3 combined in modal refactor; Tasks 4-6 verified existing)
- **Files modified:** 5

## Accomplishments
- Replaced multi-step wizard with minimal single-page creation form
- Added client profile dropdown populated from useClientProfiles hook
- Added optional file upload zone with visual feedback (select, display, remove)
- Added complete i18n translations for PT-BR and EN
- Verified campaigns page and creation hook already compatible with simplified payload

## Task Commits

Each task was committed atomically:

1. **Task 1-3: Simplify modal form, add client profile selector, add upload zone** - `6d496d5` (feat)
2. **Task 5: Add i18n translations for simplified form** - `6d2b357` (feat)

**Plan metadata:** `6d2b357` (feat: complete plan)

_Note: Tasks 4 and 6 required no changes — campaigns/page.tsx and useCampaignsPage.ts were already updated in plan 18-01 to use the simplified payload._

## Files Created/Modified
- `app/src/components/campaigns/NewCampaignModal.tsx` - Simplified to 3-field form with client profile selector and optional upload
- `app/messages/pt-BR.json` - Added PT-BR translations for new form fields
- `app/messages/en.json` - Added EN translations for new form fields
- `app/src/app/(dashboard)/campaigns/page.tsx` - Verified no changes needed (already uses simplified modal)
- `app/src/components/campaigns/useCampaignsPage.ts` - Verified no changes needed (already accepts simplified payload)

## Decisions Made
- Upload zone is visual-only in creation modal; actual upload happens after campaign creation in workspace
- Used native `<select>` element instead of custom dropdown for client profile (simpler, accessible)
- Removed all old wizard elements: template selector, generation mode cards, target format buttons, constraints/notes textareas
- Preserved existing form validation pattern (clear errors on re-entry after touch)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `namePlaceholder` and `clientPlaceholder` keys exist under `briefing` namespace, not `campaign` — corrected modal to use `tBriefing()` instead of `tCampaign()` for placeholders
- Pre-existing TypeScript errors in test files (unrelated to this plan)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 18 is complete (both plans 18-01 and 18-02 done)
- Ready for Phase 19: AI Visual Analysis and Deduction
- Campaign creation now supports the simplified flow end-to-end

---
*Phase: 18-formulario-simplificado-de-briefing*
*Completed: 2026-05-26*
