---
phase: 59-feedback-informed-regeneration
plan: "02"
subsystem: api
tags: [regeneration, drizzle, creative-contract, inngest]
requires:
  - phase: 59-feedback-informed-regeneration
    provides: buildRegenerationCorrectionBrief from plan 59-01
provides:
  - regeneration_correction_brief jsonb persistence
  - Regenerate route brief merge and parent contract inheritance
affects: [59-04]
tech-stack:
  added: []
  patterns: [child derivations inherit parent creativeContract through job]
key-files:
  created:
    - app/drizzle/0028_regeneration_correction_brief.sql
  modified:
    - app/src/app/api/derivations/[id]/regenerate/route.ts
    - app/src/server/jobs/derivation.ts
    - app/src/server/repositories/derivation.ts
    - app/src/server/repositories/feedback.ts
key-decisions:
  - "User POST feedback wraps as Additional notes after machine brief sections"
  - "Open feedback report contributes category label only, never message body"
patterns-established:
  - "resolveRegenerationBrief loads parent creativeContract before fallback CTA semantics"
requirements-completed: [AIR-02, AIR-04]
duration: 20min
completed: 2026-06-05
---

# Phase 59 Plan 02: Regenerate Route Persistence Summary

**Regenerate API builds merged correction briefs, persists structured brief JSON on children, and keeps parent creative contracts through the derivation job.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added `regeneration_correction_brief` migration and repository support
- Replaced feedback replacement with `mergeUserRegenerationNotes` on POST `/regenerate`
- Derivation job prefers child-stored `creativeContract` for brand/product/offer preservation

## Task Commits

1. **Task 1: Column and repository** - `1cba975`
2. **Task 2: Regenerate route** - `a0b71a7`
3. **Task 3: Job contract inheritance** - `d71d8e0`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/drizzle/0028_regeneration_correction_brief.sql
- FOUND: app/src/app/api/derivations/[id]/regenerate/route.ts
- FOUND: 1cba975, a0b71a7, d71d8e0
