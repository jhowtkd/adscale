---
phase: 140-advisor-and-generation-direction
plan: "01"
subsystem: api
tags: [olhar, preflight, creative-qa, art-direction, dual-verdict]

requires:
  - phase: 138-olhar-constitution-and-cenbrap-voice
    provides: Olhar vocabulary and art-direction failure mapping
  - phase: 139-dual-verdict-and-export-validator
    provides: OlharVerdictPayload contracts and export separation
provides:
  - BaseCreativeReading contract for preflight Leitura do base
  - Passagem Olhar QA helper building OlharVerdictPayload from gate evidence
  - Preflight and QA prompts reframed around art-direction judgment
affects:
  - 140-02 generation direction and score demotion
  - 141 workspace UI reprioritization

tech-stack:
  added: []
  patterns:
    - "Creative reading layer optional on PreflightResult for backward compatibility"
    - "Olhar verdict built only from art-direction failures; export failures return null"
    - "QA prompt split into Passagem Olhar vs Exportacao passes"

key-files:
  created:
    - app/src/server/ai/olhar/base-reading.ts
    - app/src/server/ai/olhar/base-reading.test.ts
    - app/src/server/ai/olhar/olhar-qa.ts
    - app/src/server/ai/olhar/olhar-qa.test.ts
  modified:
    - app/src/server/ai/preflight-analysis.ts
    - app/src/server/ai/creative-qa.ts
    - app/src/server/ai/creative-qa.test.ts
    - app/src/app/api/derivations/[id]/qa/route.ts

key-decisions:
  - "Keep legacy preflight score fields; baseReading is optional on normalized results"
  - "buildPassagemOlharVerdict returns null for export-only failures (conservative)"
  - "QA route persists olharVerdict via updateDerivationDualVerdict when available"

patterns-established:
  - "Leitura do base precedes compatibility scores in preflight prompt language"
  - "Passagem Olhar notes derive axes from QA checklist with conservative min scoring"

requirements-completed: [ADVISOR-01, ADVISOR-02]

duration: 4min
completed: 2026-06-19
---

# Phase 140 Plan 01: Leitura do Base and Passagem Olhar Summary

**Preflight gains Leitura do base creative reading and final QA gains a Passagem Olhar layer that builds OlharVerdictPayload without collapsing export compliance into art-direction judgment.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-19T12:07:18Z
- **Completed:** 2026-06-19T12:11:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `BaseCreativeReading` with normalization, risk cap at two, and prompt section builder
- Reframed preflight vision prompt around Leitura do base while preserving score breakdown compatibility
- Added `buildPassagemOlharVerdict` helper reusing Phase 139 dual-verdict contracts
- Split creative QA prompt into Passagem Olhar and Exportacao passes
- Wired QA route to persist optional `olharVerdict` without breaking legacy response fields

## Task Commits

Each task was committed atomically:

1. **Task 140-01-01: Add BaseCreativeReading and reframe preflight** - `cd7bed58` (feat)
2. **Task 140-01-02: Add Passagem Olhar QA helper** - `618e626a` (feat)

## Files Created/Modified

- `app/src/server/ai/olhar/base-reading.ts` - BaseCreativeReading types, normalizer, prompt section
- `app/src/server/ai/olhar/base-reading.test.ts` - Normalization and prompt section tests
- `app/src/server/ai/olhar/olhar-qa.ts` - Passagem Olhar verdict builder from QA/gate evidence
- `app/src/server/ai/olhar/olhar-qa.test.ts` - Art-direction vs export-only verdict tests
- `app/src/server/ai/preflight-analysis.ts` - Leitura do base prompt and optional baseReading field
- `app/src/server/ai/creative-qa.ts` - Passagem Olhar / Exportacao prompt split
- `app/src/app/api/derivations/[id]/qa/route.ts` - Persist and return optional olharVerdict

## Decisions Made

- Kept `overallScore` and dimension breakdown on preflight for existing readiness consumers
- Returned null Olhar verdict when only export/compliance failures are present
- Derived Olhar axes from QA checklist with conservative min scoring per axis

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 140-02 can add generation direction paragraph and score demotion using base reading and Olhar QA outputs
- Cenbrap voice injection remains gated on 138-VOICE-REVIEW approval

---
*Phase: 140-advisor-and-generation-direction*
*Completed: 2026-06-19*

## Self-Check: PASSED

- FOUND: .planning/phases/140-advisor-and-generation-direction/140-01-SUMMARY.md
- FOUND: app/src/server/ai/olhar/base-reading.ts
- FOUND: app/src/server/ai/olhar/olhar-qa.ts
- FOUND: commit cd7bed58
- FOUND: commit 618e626a
