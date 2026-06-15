---
phase: 117-factual-vs-visual-separation
plan: "04"
subsystem: api
tags: [creative-quality-gate, creative-corpus, factual-visual-separation, invented_factual_entity, vitest, SEP-04]

requires:
  - phase: 117-factual-vs-visual-separation
    plan: "01"
    provides: factual-visual-separation module and CONTAMINATION_FAILURE_CODES lineage set
  - phase: 117-factual-vs-visual-separation
    plan: "02"
    provides: visual reference transfer rules and restyling factual-source guard
provides:
  - matchCanonicalCampaignSlug and resolveAllowedEntitiesForCampaign on CANONICAL_CAMPAIGNS
  - ALLOWED ENTITIES prompt block injected after input classification
  - invented_factual_entity CreativeHardFailureCode with gate promotion from QA notes
  - corpus-invented-factual-entity baseline test flipped from red to green
affects:
  - 118-per-mode-rules
  - 120-gate-hardening

tech-stack:
  added: []
  patterns:
    - "Campaign slug matcher resolves allowedEntities from CANONICAL_CAMPAIGNS displayNames"
    - "INVENTED_ENTITY_PATTERN promotes briefMatch/creativeRisk notes to invented_factual_entity hard failure"
    - "Allowed entities injected in derivation prompts and cited in creative QA instructions"

key-files:
  created: []
  modified:
    - app/src/server/ai/creative-corpus.ts
    - app/src/server/ai/factual-visual-separation.ts
    - app/src/server/ai/canonical-creative-contract.ts
    - app/src/server/ai/prompt-builder.ts
    - app/src/server/ai/creative-quality-gate.ts
    - app/src/server/ai/creative-quality-taxonomy.ts
    - app/src/server/ai/creative-qa.ts
    - app/src/server/ai/corpus-fixtures.ts
    - app/tests/unit/ai/creative-corpus.test.ts
    - app/tests/unit/ai/creative-quality-gate.test.ts
    - app/tests/unit/ai/corpus-baseline.test.ts
    - app/src/server/ai/prompt-builder.test.ts

key-decisions:
  - "invented_factual_entity added to CONTAMINATION_FAILURE_CODES for lineage firewall compatibility"
  - "STYLE_REFERENCE_CONTAMINATION_PATTERN maps creativeRisk notes to copied_style_reference_facts alias"
  - "corpus-invented-factual-entity baselineVerdict updated to invalid after SEP-04 flip"

patterns-established:
  - "ALLOWED ENTITIES block lists people, brands, products, claims from registry when campaign slug matches"

requirements-completed: [SEP-04]

duration: 4min
completed: 2026-06-15
---

# Phase 117 Plan 04: Allowed Entities Registry and Gate Promotion Summary

**invented_factual_entity hard failure with CANONICAL_CAMPAIGNS allowed-entities prompt injection — corpus Cantona baseline flipped green**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-15T16:24:14Z
- **Completed:** 2026-06-15T16:28:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added `matchCanonicalCampaignSlug` and `resolveAllowedEntitiesForCampaign` wiring CENBRAP NR1 and other audit campaigns to `allowedEntities`
- Injected `ALLOWED ENTITIES` prompt section after input classification; populated canonical `invariantIdentity` from registry
- Promoted QA notes matching `INVENTED_ENTITY_PATTERN` to `invented_factual_entity` hard failure in `briefMatch` and `creativeRisk`
- Flipped `corpus-invented-factual-entity` baseline from `it.fails` to passing green test; `BASELINE_GAP_COUNT` now 4

## Task Commits

1. **Task 1 RED: Campaign slug matcher tests** — `20217175` (test)
2. **Task 1 GREEN: Allowed entities registry and prompts** — `05b29966` (feat)
3. **Task 2 RED: invented_factual_entity gate tests** — `6e54e25f` (test)
4. **Task 2 GREEN: Gate promotion and corpus flip** — `d06bd99f` (feat)

## Files Created/Modified

- `app/src/server/ai/creative-corpus.ts` — Slug matcher and `resolveAllowedEntitiesForCampaign`
- `app/src/server/ai/factual-visual-separation.ts` — `buildAllowedEntitiesPromptSection`; `invented_factual_entity` in contamination set
- `app/src/server/ai/canonical-creative-contract.ts` — Registry-driven `invariantIdentity.people/brands`
- `app/src/server/ai/prompt-builder.ts` — Allowed entities injection after classification
- `app/src/server/ai/creative-quality-gate.ts` — `invented_factual_entity` code and promotion logic
- `app/src/server/ai/creative-quality-taxonomy.ts` — `INVENTED_ENTITY_PATTERN`, contamination patterns
- `app/src/server/ai/creative-qa.ts` — Allowed entity registry guidance in QA prompt
- `app/src/server/ai/corpus-fixtures.ts` — `baselineVerdict: invalid` for invented entity archetype

## Decisions Made

- `STYLE_REFERENCE_CONTAMINATION_PATTERN` aliases style contamination notes to existing `copied_style_reference_facts` (no duplicate code per RESEARCH)
- `baselineVerdict` updated to `invalid` for invented entity fixture so snapshot test documents post-SEP-04 behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated corpus fixture baselineVerdict after gate flip**
- **Found during:** Task 2 verification
- **Issue:** `baseline-snapshot` test still expected `acceptable` for invented entity fixture after gate now returns `invalid`
- **Fix:** Set `baselineVerdict: "invalid"` on `corpus-invented-factual-entity` fixture
- **Files modified:** `app/src/server/ai/corpus-fixtures.ts`
- **Committed in:** `d06bd99f`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Required for corpus baseline suite consistency after SEP-04 flip.

## TDD Gate Compliance

- RED `test(117-04)` commits: `20217175`, `6e54e25f`
- GREEN `feat(117-04)` commits: `05b29966`, `d06bd99f`
- Gate sequence verified in git log

## Issues Encountered

None beyond baseline snapshot expectation update documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SEP-04 complete; four corpus archetypes remain red until Phase 120 gate hardening
- Phase 118 per-mode rules can rely on allowed entity prompts and `invented_factual_entity` blocking

## Self-Check: PASSED

- FOUND: app/src/server/ai/creative-corpus.ts
- FOUND: app/src/server/ai/creative-quality-gate.ts
- FOUND: .planning/phases/117-factual-vs-visual-separation/117-04-SUMMARY.md
- FOUND: commit 20217175
- FOUND: commit 05b29966
- FOUND: commit 6e54e25f
- FOUND: commit d06bd99f

---
*Phase: 117-factual-vs-visual-separation*
*Completed: 2026-06-15*
