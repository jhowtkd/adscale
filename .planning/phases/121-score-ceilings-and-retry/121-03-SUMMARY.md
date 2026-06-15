---
phase: 121-score-ceilings-and-retry
plan: 03
subsystem: ai
tags: [regeneration, correction-brief, restyling, scr-05, hard-failures]

requires:
  - phase: 117-factual-vs-visual-separation
    provides: RESTYLING FACTUAL-SOURCE RULE locked prose
  - phase: 120-gate-hardening
    provides: CreativeHardFailureCode taxonomy and normalizeHardFailureCode
provides:
  - FAILURE_CORRECTION_DIRECTIVES map with per-code imperatives
  - Correction directives section prepended before hard-failure trace list
  - buildRestylingFactualSourceRuleSection shared export in prompt-builder
  - Restyling correction brief injects factual-source rule before char cap
affects:
  - 121-score-ceilings-and-retry (plans 01-02 auto-retry consumers)
  - derivation-auto-retry (inherits via correctionFeedback from brief)

tech-stack:
  added: []
  patterns:
    - "Per-code imperative directives deduped before generic hard-failure list"
    - "Single injection point for restyling factual-source rule in brief builder"

key-files:
  created: []
  modified:
    - app/src/server/ai/regeneration-correction-brief.ts
    - app/src/server/ai/prompt-builder.ts
    - app/tests/unit/ai/regeneration-correction-brief.test.ts

key-decisions:
  - "Brief builder is sole injection point for RESTYLING FACTUAL-SOURCE RULE (derivation-auto-retry unchanged)"
  - "buildRestylingFactualSourceRuleSection extracted to prompt-builder to lock Phase 117 prose"

patterns-established:
  - "getFailureCorrectionDirectives normalizes codes and dedupes directive text"
  - "Restyling mode always appends factual-source rule to correction brief, not only on contamination"

requirements-completed: [SCR-05]

duration: 4min
completed: 2026-06-15
---

# Phase 121 Plan 03: Failure-Specific Correction Directives Summary

**Per-code SCR-05 imperatives in regeneration briefs plus shared restyling factual-source rule injection before the 1800-char cap**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-15T19:42:00Z
- **Completed:** 2026-06-15T19:45:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `FAILURE_CORRECTION_DIRECTIVES` maps ten hard-failure codes to imperative correction lines
- `formatIssueSections` prepends a `Correction directives:` block before the traceable `Hard failures:` list
- `buildRestylingFactualSourceRuleSection()` centralizes Phase 117 locked prose in `prompt-builder.ts`
- Restyling correction briefs append `RESTYLING FACTUAL-SOURCE RULE` before char cap so `buildHardFailureRegenerationSuggestion` and job `correctionFeedback` both inherit it

## Task Commits

Each task was committed atomically (TDD RED + GREEN):

1. **Task 1: Per-code correction directives map** — `15179a79` (test), `4632bd1b` (feat)
2. **Task 2: Restyling factual-source rule on auto-retry prompt** — `54fb6404` (test), `c8397266` (feat)

**Plan metadata:** pending (docs commit)

## Files Created/Modified

- `app/src/server/ai/regeneration-correction-brief.ts` — directives map, `getFailureCorrectionDirectives`, restyling rule append
- `app/src/server/ai/prompt-builder.ts` — `buildRestylingFactualSourceRuleSection()` export; derivation prompt refactored to use it
- `app/tests/unit/ai/regeneration-correction-brief.test.ts` — 12 new SCR-05 and restyling tests

## Decisions Made

- Brief builder chosen as single injection point for factual-source rule; `derivation-auto-retry.ts` left unchanged because `correctionFeedback` already flows from the brief
- Directive deduplication by text so `wrong_brand` and `unauthorized_brand_or_ip` share one line without repetition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SCR-05 correction specificity complete; `buildHardFailureRegenerationSuggestion` inherits via existing `buildRegenerationCorrectionBrief` path
- Ready for remaining Phase 121 plans (score ceilings, auto-retry asset selection) to consume enriched correction feedback

## Self-Check: PASSED

- `app/src/server/ai/regeneration-correction-brief.ts` — FOUND
- `app/tests/unit/ai/regeneration-correction-brief.test.ts` — FOUND
- Commits `15179a79`, `4632bd1b`, `54fb6404`, `c8397266` — FOUND in git log
- `cd app && npm test -- tests/unit/ai/regeneration-correction-brief.test.ts` — 21/21 passed

---
*Phase: 121-score-ceilings-and-retry*
*Completed: 2026-06-15*
