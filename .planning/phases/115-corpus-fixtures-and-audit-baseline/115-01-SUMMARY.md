---
phase: 115-corpus-fixtures-and-audit-baseline
plan: "01"
subsystem: testing
tags: [vitest, creative-corpus, fixtures, manifest-index, preview-tier]

requires:
  - phase: 114
    provides: v12.2 visual foundation baseline (no code dependency)
provides:
  - CANONICAL_CAMPAIGNS registry with four audited campaign slugs
  - CORPUS_MANIFEST_INDEX with preview/final render tiers
  - CI-safe manifest metadata index (no secrets or absolute paths)
affects:
  - 115-02 corpus archetype fixtures
  - 116 canonical creative contract
  - 122 regression suite

tech-stack:
  added: []
  patterns:
    - "Slim manifest-index.json sidecar derived from export manifest"
    - "canonicalSlug | unmapped bucket for non-audit debug campaigns"

key-files:
  created:
    - app/src/server/ai/creative-corpus.ts
    - app/tests/fixtures/creative-corpus/manifest-index.json
    - app/tests/unit/ai/creative-corpus.test.ts
  modified: []

key-decisions:
  - "Teste_debuf and Teste 5 map to explicit unmapped bucket — outside four-campaign audit baseline"
  - "Smoke allowlist uses ADScale tech-smoke tokens only (no Acme demo product names)"
  - "Manifest index tests derive counts from live manifest.json, not hardcoded 34/10/24"

patterns-established:
  - "CorpusRenderTier maps manifest is_preview to preview | final"
  - "Corpus module imports slim JSON fixture — no R2 URLs or output_key in CI catalog"

requirements-completed: [FIXT-02, FIXT-03]

duration: 12min
completed: 2026-06-15
---

# Phase 115 Plan 01: Canonical Campaign Registry and Manifest Index Summary

**Typed corpus catalog freezing four audited campaigns and 33 export manifest entries with preview/final render tiers**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-15T13:23:00Z
- **Completed:** 2026-06-15T13:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `CANONICAL_CAMPAIGNS` registers smoke, nova-campanha, teste-3-nr1, and teste-campanha-nr1 with allowed entity allowlists excluding known hallucinations
- `CORPUS_MANIFEST_INDEX` indexes all 33 manifest exports with `renderTier` and `canonicalSlug` resolution
- Nine Vitest integrity tests verify catalog shape, tier mapping, unmapped debug campaigns, and CI safety (no `/Users/`, no R2 URLs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define corpus types and canonical campaign registry** - `515e60dc` (feat)
2. **Task 2: Build manifest index with preview/final tier** - `26d9bf94` (feat)

**Note:** `creative-corpus.ts` and `manifest-index.json` first landed in `3bf0dc1a` (115-02 test commit) during parallel wave execution; task 2 commit completes manifest-tier tests and smoke allowlist alignment.

**Plan metadata:** pending (this summary commit)

## Files Created/Modified

- `app/src/server/ai/creative-corpus.ts` - Types, `CANONICAL_CAMPAIGNS`, `CORPUS_MANIFEST_INDEX`, `isCorpusRefIdKnown`
- `app/tests/fixtures/creative-corpus/manifest-index.json` - Slim 33-entry index from export manifest
- `app/tests/unit/ai/creative-corpus.test.ts` - Registry and manifest integrity tests

## Decisions Made

- Debug campaigns `Teste_debuf` (4 entries) and `Teste 5` (1 entry) use `canonicalSlug: "unmapped"` rather than forcing into NR1 archetypes
- Tests compare index length against `app/exports/render-creatives/manifest.json` dynamically — corpus grew to 33 entries (11 preview, 22 final) since planning assumed 34/10/24

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Smoke campaign allowlist used Acme demo tokens**
- **Found during:** Task 2 (manifest index tests)
- **Issue:** `Widget Pro` / `Auditoria gratuita` belonged to fictional quality fixtures, not Smoke v11.6 CQA-02 audit baseline
- **Fix:** Replaced with ADScale tech-smoke claims (`smoke test`, `CQA-02`, `LGPD compliance check`)
- **Files modified:** `app/src/server/ai/creative-corpus.ts`
- **Committed in:** `26d9bf94`

**2. [Rule 1 - Bug] Plan counts stale vs live manifest**
- **Found during:** Task 2 verification
- **Issue:** Plan specified 34 entries / 10 preview / 24 final; live manifest has 33 / 11 / 22
- **Fix:** Tests assert against `sourceManifest.length` and tier consistency instead of hardcoded counts
- **Files modified:** `app/tests/unit/ai/creative-corpus.test.ts`
- **Committed in:** `26d9bf94`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Corrections align catalog with audited export reality. No scope creep.

## TDD Gate Compliance

- Task 1 marked `tdd="true"` but RED `test()` commit absent — implementation pre-existed from parallel 115-02 work (`3bf0dc1a`). GREEN coverage delivered in `515e60dc` + `26d9bf94`.

## Issues Encountered

- Parallel executor committed corpus module files under 115-02 plan ID before 115-01 task 2 completed — resolved by finishing manifest-tier tests under 115-01 commits

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 115-02 can consume `CANONICAL_CAMPAIGNS` and `CORPUS_MANIFEST_INDEX` for archetype fixture binding
- Plan 115-03 red baseline tests can reference `canonicalSlug` and `renderTier` dimensions

## Self-Check: PASSED

- FOUND: app/src/server/ai/creative-corpus.ts
- FOUND: app/tests/fixtures/creative-corpus/manifest-index.json
- FOUND: app/tests/unit/ai/creative-corpus.test.ts
- FOUND: 515e60dc
- FOUND: 26d9bf94

---
*Phase: 115-corpus-fixtures-and-audit-baseline*
*Completed: 2026-06-15*
