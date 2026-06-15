---
phase: 115-corpus-fixtures-and-audit-baseline
plan: "02"
subsystem: testing
tags: [vitest, quality-fixtures, creative-corpus, audit-archetypes]

requires:
  - phase: 115-corpus-fixtures-and-audit-baseline
    plan: "01"
    provides: CORPUS_MANIFEST_INDEX and canonical campaign registry
provides:
  - CORPUS_ARCHETYPE_FIXTURES with five June-audit failure archetypes
  - CorpusArchetype types and fictional-safe NR1/education contracts
  - Integrity tests linking fixtures to manifest id prefixes
affects:
  - 115-03 corpus-baseline red tests
  - 120 gate hardening (forward-reference failure codes)

tech-stack:
  added: []
  patterns:
    - Separate corpus-fixtures module from quality-fixtures to preserve six-fixture tests
    - CorpusTargetHardFailureCode union for Phase 120 forward references
    - baselineVerdict documents wrongful current gate behavior

key-files:
  created:
    - app/src/server/ai/corpus-fixtures.ts
    - app/tests/unit/ai/corpus-fixtures.test.ts
  modified: []

key-decisions:
  - "Kept corpus-fixtures separate from quality-fixtures per research — existing six-fixture count tests unchanged"
  - "Implemented creative-corpus prerequisite inline (Rule 3) because plan 115-01 was not yet executed"
  - "Used CorpusTargetHardFailureCode forward references for archetypes without v11.5 taxonomy codes"

patterns-established:
  - "Archetype fixtures: corpusRefIds + canonicalSlug + renderTier + baselineVerdict vs expectedVerdict"
  - "Fictional NR1/education contracts derived from canonical campaigns — audit athlete names only in synthetic QA notes"

requirements-completed: [FIXT-01]

duration: 12min
completed: 2026-06-15
---

# Phase 115 Plan 02: Audit Archetype Fixtures Summary

**Five corpus-linked quality fixtures covering June audit failure archetypes with fictional-safe contracts, synthetic QA JSON, and manifest id cross-references**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-15T10:22:00Z
- **Completed:** 2026-06-15T10:34:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Exported `CorpusArchetype`, `CorpusArchetypeFixture`, and `CORPUS_ARCHETYPE_FIXTURES` for all five audit archetypes
- Linked each fixture to manifest id prefixes (`27069645`, `8a2bebf9`, etc.) via `corpusRefIds`
- Crafted synthetic QA outputs mirroring audit observations (invented entities, overload, template aesthetic, campaign drift, restyling contamination)
- Eight integrity tests pass — archetype coverage, manifest links, preview/final tiers, baseline vs target verdicts

## Task Commits

Each task was committed atomically:

1. **Task 1: Define CorpusArchetype types and fixture scaffold** - `3bf0dc1a` (test RED) + `8625c16c` (feat GREEN)
2. **Task 2: Populate synthetic QA outputs mirroring audit observations** - `b004c3db` (feat)

## Files Created/Modified

- `app/src/server/ai/corpus-fixtures.ts` - Five archetype fixtures with contracts and synthetic QA JSON
- `app/tests/unit/ai/corpus-fixtures.test.ts` - Catalog integrity and FIXT-01 verification tests
- `app/src/server/ai/creative-corpus.ts` - Prerequisite corpus module (Rule 3)
- `app/tests/fixtures/creative-corpus/manifest-index.json` - Slim manifest index for CI-safe id lookups

## Decisions Made

- Separate module from `quality-fixtures.ts` to avoid breaking existing six-fixture pipeline tests
- Forward-reference archetype codes in `CorpusTargetHardFailureCode` until Phase 120 adds taxonomy entries
- `baselineVerdict` set to `acceptable` or `improvable` per archetype to document wrongful current gate behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Implemented plan 115-01 creative-corpus prerequisite**
- **Found during:** Task 1 (corpus-fixtures tests import CORPUS_MANIFEST_INDEX)
- **Issue:** `creative-corpus.ts` and `manifest-index.json` did not exist — plan 115-01 not yet executed
- **Fix:** Created `creative-corpus.ts`, generated `manifest-index.json` from export manifest, included in RED commit
- **Files modified:** `app/src/server/ai/creative-corpus.ts`, `app/tests/fixtures/creative-corpus/manifest-index.json`
- **Verification:** Manifest prefix lookup tests pass
- **Committed in:** `3bf0dc1a`

**2. [Rule 1 - Data mismatch] Manifest index has 33 entries not 34**
- **Found during:** manifest-index generation
- **Issue:** `app/exports/render-creatives/manifest.json` contains 33 items (research cited 34); 11 preview / 22 final
- **Fix:** Indexed all available entries; tests use prefix membership not count
- **Files modified:** `app/tests/fixtures/creative-corpus/manifest-index.json`
- **Committed in:** `3bf0dc1a`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 data mismatch)
**Impact on plan:** Prerequisite corpus module required for FIXT-01 manifest links. Count mismatch does not block archetype fixture goals.

## TDD Gate Compliance

- RED commit `3bf0dc1a` (test) precedes GREEN commit `8625c16c` (feat) — compliant

## Issues Encountered

- Brief `creative-corpus.ts` parse corruption from concurrent workspace edits — restored full module before task 2 verification

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FIXT-01 satisfied — ready for plan 115-03 red baseline tests (`corpus-baseline.test.ts`)
- Plan 115-01 should be reconciled: formalize `creative-corpus.test.ts` if not already executed separately

## Self-Check: PASSED

- FOUND: app/src/server/ai/corpus-fixtures.ts
- FOUND: app/tests/unit/ai/corpus-fixtures.test.ts
- FOUND: commit 3bf0dc1a
- FOUND: commit 8625c16c
- FOUND: commit b004c3db

---
*Phase: 115-corpus-fixtures-and-audit-baseline*
*Completed: 2026-06-15*
