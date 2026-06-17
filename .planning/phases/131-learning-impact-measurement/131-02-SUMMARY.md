---
phase: 131-learning-impact-measurement
plan: "02"
subsystem: api
tags: [output-learning, human-quality, corpus, react-hooks, impact-enrichment]

requires:
  - phase: 131-learning-impact-measurement
    plan: "01"
    provides: OutputLearningApplicationSnapshot schema, derivations jsonb persistence, API POST threading
provides:
  - Accept flow threads bounded application snapshot from OutputLearningRecommendationCard to derivations POST
  - Corpus selection freezes sanitized outputLearningApplication into qualitySnapshot
  - impact/enrich.ts resolveLearningApplied and buildImpactRow for per-row attribution
affects:
  - 131-03 impact report engine
  - 131-04 evidence CLI and Impact UI tab

tech-stack:
  added: []
  patterns:
    - "Pending application snapshot on useDerivationFlow cleared on closeFlow"
    - "Only output-learning accept path sets application snapshot — not performance-learning card"
    - "Corpus selection merges sanitized derivation.outputLearningApplication into frozen qualitySnapshot"
    - "Legacy rows without application metadata resolve to learningApplied false and not_recorded"

key-files:
  created:
    - app/src/server/human-quality/impact/enrich.ts
    - app/tests/unit/human-quality/impact/enrich.test.ts
  modified:
    - app/src/lib/hooks/use-derivation-flow.ts
    - app/src/lib/hooks/use-derivations.ts
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/components/campaigns/OutputLearningRecommendationCard.tsx
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/src/server/human-quality/service.ts

key-decisions:
  - "Edit-before-generate from output-learning card does not set application snapshot — only accept path"
  - "sanitizeOutputLearningApplication runs at corpus freeze when derivation has stored application"
  - "resolveLearningApplied returns true only when snapshot.applied===true"

patterns-established:
  - "buildApplicationSnapshotFromAccept at card accept → pending state → useCreateDerivations POST body"
  - "buildImpactRow maps applicationResolution from frozen qualitySnapshot with not_recorded legacy default"

requirements-completed: [IMPACT-01]

duration: 14min
completed: 2026-06-17
---

# Phase 131 Plan 02: Accept Flow, Corpus Freeze and Enrichment Summary

**Output-learning accept threads bounded application metadata through derivation hooks to POST, corpus selection freezes sanitized snapshots, and enrich helpers resolve learningApplied per evaluated row.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-17T09:58:00Z
- **Completed:** 2026-06-17T10:03:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- OutputLearningRecommendationCard accept builds snapshot via `buildApplicationSnapshotFromAccept` and sets pending state on derivation flow
- `useCreateDerivations` and `useCampaignWorkspace` pass `outputLearningApplication` in batch derivations POST when pending
- `selectDerivationForCorpus` merges sanitized `derivation.outputLearningApplication` into frozen `qualitySnapshot`
- `impact/enrich.ts` provides `resolveLearningApplied` and `buildImpactRow` with honest `not_recorded` legacy default

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread accept flow through derivation hooks** - `6fe1011b` (feat)
2. **Task 2: Freeze snapshot at corpus selection and enrich helpers** - `890916dc` (test), `4305be6b` (feat)

## Files Created/Modified

- `app/src/lib/hooks/use-derivation-flow.ts` - Pending application state cleared on closeFlow
- `app/src/lib/hooks/use-derivations.ts` - POST body includes optional outputLearningApplication
- `app/src/lib/hooks/use-campaign-workspace.ts` - Passes pending snapshot to createDerivations mutate
- `app/src/components/campaigns/OutputLearningRecommendationCard.tsx` - Accept payload with applicationSnapshot
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` - Separate accept/edit handlers for output-learning card
- `app/src/server/human-quality/service.ts` - Corpus freeze merges sanitized application into qualitySnapshot
- `app/src/server/human-quality/impact/enrich.ts` - resolveLearningApplied and buildImpactRow
- `app/tests/unit/human-quality/impact/enrich.test.ts` - Applied true/false, legacy not_recorded, buildImpactRow mapping

## Decisions Made

- Edit-before-generate does not set application snapshot — only explicit accept records attribution
- Legacy corpus rows without application metadata honestly report `learningApplied: false` and `not_recorded`
- Performance-learning card (NextExperimentRecommendationCard) unchanged — does not set application snapshot

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 131-03 can build impact report engine using `buildImpactRow` enriched rows
- End-to-end path: accept → derivations POST persist → corpus freeze → enrich resolves learningApplied

## Self-Check: PASSED

- FOUND: app/src/server/human-quality/impact/enrich.ts
- FOUND: app/tests/unit/human-quality/impact/enrich.test.ts
- FOUND: commit 6fe1011b
- FOUND: commit 890916dc
- FOUND: commit 4305be6b

---
*Phase: 131-learning-impact-measurement*
*Completed: 2026-06-17*
