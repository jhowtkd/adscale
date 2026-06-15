---
phase: 116-canonical-creative-contract
plan: "03"
subsystem: api
tags: [prompt-builder, creative-contract, tier-aware-preservation, CONT-03]

requires:
  - phase: 116-01
    provides: canonical contract prompt section with RULE PRECEDENCE and content tiers
  - phase: 116-02
    provides: integrity injection (VISUAL HIERARCHY + ANTI-HALLUCINATION before MODE)
provides:
  - Tier-aware art_variation MODE block referencing mandatory/condensable/decorative tiers
  - format_adaptation copy-vs-prominence split (verbatim facts, hierarchical layout)
  - bold/extreme creativity templates with mandatory-tier INVIOLABLE vs condensable consolidation
  - CONT-03 negative regression tests for preserve-all conflicts
affects: [117-factual-visual-separation, 118-per-mode-rules]

tech-stack:
  added: []
  patterns:
    - "MODE blocks defer to RULE PRECEDENCE when preservation conflicts with hierarchy"
    - "format_adaptation preserves copy verbatim while visual prominence follows three zones"

key-files:
  created: []
  modified:
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/prompt-builder.test.ts
    - app/tests/unit/ai/quality-prompt-regression.test.ts
    - app/tests/unit/prompt-builder.test.ts
    - app/tests/unit/prompt-parser.test.ts

key-decisions:
  - "art_variation uses mandatory tier language instead of preserve-every-important-piece"
  - "format_adaptation splits PRESERVE COPY AND FACTS VERBATIM from VISUAL PROMINENCE"
  - "bold/extreme INVIOLABLE applies to mandatory tier spelling; consolidation limited to condensable modules"

patterns-established:
  - "Negative regression: no undifferentiated preserve-all without tier qualification in MODE sections"

requirements-completed: [CONT-03]

duration: 6min
completed: 2026-06-15
---

# Phase 116 Plan 03: Resolve Preserve-All vs Hierarchy Conflicts Summary

**Tier-aware MODE blocks and creativity templates so RULE PRECEDENCE governs preservation vs hierarchy conflicts (CONT-03)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-15T14:09:38Z
- **Completed:** 2026-06-15T14:15:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Replaced art_variation preserve-every-important-piece with mandatory/condensable/decorative tier language
- Split format_adaptation into verbatim copy preservation vs three-zone visual prominence
- Updated bold/extreme creativity templates to scope INVIOLABLE to mandatory tier
- Added precedence and no-preserve-all conflict regression tests; updated format snapshots

## Task Commits

Each task was committed atomically:

1. **Task 1: Edit art_variation MODE and creativity templates** — `f6a2557d` (test RED), `ae81cafe` (feat GREEN)
2. **Task 2: Edit format_adaptation MODE for factual vs visual prominence split** — `5468c1a9` (feat)

## Files Created/Modified

- `app/src/server/ai/prompt-builder.ts` — Tier-aware art_variation, format_adaptation, bold/extreme templates, reference paragraph
- `app/src/server/ai/prompt-builder.test.ts` — precedence, no preserve-all, updated art_variation contract asserts
- `app/tests/unit/ai/quality-prompt-regression.test.ts` — format_adaptation tier/hierarchy asserts and snapshot
- `app/tests/unit/prompt-builder.test.ts` — verbatim copy preservation assert (replaces PRESERVE EXACTLY)
- `app/tests/unit/prompt-parser.test.ts` — same legacy test alignment

## Decisions Made

- art_variation anti-cropping and rearrangement rules now scope to mandatory-tier content
- format_adaptation keeps legal/CTA/headline verbatim preservation while allowing decorative chrome to yield visual weight
- Reference asset paragraph aligns with three-zone hierarchy instead of preserve-all critical copy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated legacy unit tests expecting PRESERVE EXACTLY**
- **Found during:** Task 2 verification (full test suite)
- **Issue:** `tests/unit/prompt-builder.test.ts` and `prompt-parser.test.ts` still asserted removed PRESERVE EXACTLY string
- **Fix:** Updated assertions to PRESERVE COPY AND FACTS VERBATIM + VISUAL PROMINENCE
- **Files modified:** app/tests/unit/prompt-builder.test.ts, app/tests/unit/prompt-parser.test.ts
- **Committed in:** 5468c1a9

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Required for phase gate; no scope creep.

## TDD Gate Compliance

- RED: `f6a2557d` — test(116-03) precedence and preserve-all conflict tests
- GREEN: `ae81cafe`, `5468c1a9` — feat implementations

## Issues Encountered

None beyond legacy test alignment caught by full suite run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 116 plan 03 complete; phase 116 (3/3 plans) ready for verification
- Phase 117 factual/visual separation can build on tier-aware MODE language

## Self-Check: PASSED

- FOUND: .planning/phases/116-canonical-creative-contract/116-03-SUMMARY.md
- FOUND: f6a2557d, ae81cafe, 5468c1a9

---
*Phase: 116-canonical-creative-contract*
*Completed: 2026-06-15*
