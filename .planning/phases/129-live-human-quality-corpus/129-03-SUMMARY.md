---
phase: 129-live-human-quality-corpus
plan: "03"
subsystem: ui
tags: [react, human-quality, corpus, feedback-ui, owner-panel]

requires:
  - phase: 129-01
    provides: Corpus schema, privacy sanitization, repository
  - phase: 129-02
    provides: Platform-owner corpus API and queue service
provides:
  - One-at-a-time internal human quality evaluation panel
  - Explicit add-to-corpus action in derivation review sheet
  - Phase 129 focused verification (tests, lint, build)
affects:
  - 130-calibration

tech-stack:
  added: []
  patterns:
    - "Owner feedback surface hosts corpus queue; review sheet only selects"
    - "Ephemeral previewImageUrl on queue GET for human review without corpus storage"
    - "Discreet toast confirmation for manual corpus inclusion"

key-files:
  created:
    - app/src/components/feedback/HumanQualityCorpusPanel.tsx
    - app/src/components/feedback/HumanQualityCorpusPanel.test.tsx
  modified:
    - app/src/components/feedback/OwnerAnalyticsPanel.tsx
    - app/src/components/workspace/DerivationReviewSheet.tsx
    - app/src/components/workspace/DerivationReviewSheet.test.tsx
    - app/src/app/(dashboard)/campaigns/[id]/page.tsx
    - app/src/app/api/feedback/human-quality-corpus/route.ts
    - app/src/lib/hooks/use-campaign-workspace.ts
    - app/src/server/human-quality/service.ts
    - app/src/server/repositories/human-quality-corpus.ts

key-decisions:
  - "Mount HumanQualityCorpusPanel from OwnerAnalyticsPanel on feedback page"
  - "Resolve preview URLs at queue GET time; do not persist signed URLs in corpus rows"
  - "Review sheet triggers selection only; full evaluation stays in owner panel"

patterns-established:
  - "Required human form fields enforced client-side before evaluation POST"
  - "403 on corpus POST from review sheet is silent; success/error uses discreet toasts"

requirements-completed: [HUMAN-01, HUMAN-02, HUMAN-03, HUMAN-04]

duration: 18min
completed: 2026-06-17
---

# Phase 129 Plan 03: Owner Evaluation UI and Phase Verification Summary

**Internal one-at-a-time corpus evaluation UI on the feedback surface plus manual add-to-corpus from derivation review, with Phase 129 test/lint/build verification**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-17T10:08:00Z
- **Completed:** 2026-06-17T10:26:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `HumanQualityCorpusPanel` with pending queue, artifact/quality context, cohort/version metadata, and required evaluation form (visual score, factual pass, intent, failure reason)
- Integrated panel into owner analytics on `/feedback` for platform-owner reviewers
- Added discreet "Add to quality corpus" action in `DerivationReviewSheet` with toast confirmation and duplicate handling
- Enriched corpus queue GET with ephemeral `previewImageUrl` for visual review without storing signed URLs in corpus payloads
- Passed focused Phase 129 suite (50 tests), lint (warnings only), and production build

## Task Commits

Each task was committed atomically:

1. **Task 1: Create one-at-a-time internal evaluation queue UI** - `a68f82ce` (feat)
2. **Task 2: Add explicit add-to-corpus entry point and discreet confirmation** - `eeeaf752` (feat)
3. **Task 3: Run focused phase verification and update planning state** - `7c031971` (fix)

**Plan metadata:** `3984aad0` (docs)

## Files Created/Modified

- `app/src/components/feedback/HumanQualityCorpusPanel.tsx` - Internal evaluation queue UI and form
- `app/src/components/feedback/HumanQualityCorpusPanel.test.tsx` - Queue, form validation, and submission tests
- `app/src/components/feedback/OwnerAnalyticsPanel.tsx` - Hosts corpus panel below beta analytics
- `app/src/components/workspace/DerivationReviewSheet.tsx` - Manual corpus selection action
- `app/src/app/api/feedback/human-quality-corpus/route.ts` - Ephemeral preview URLs on queue list
- `app/src/lib/hooks/use-campaign-workspace.ts` - Exposes `workspaceId` for corpus API calls

## Decisions Made

- Evaluation remains in owner/feedback; review sheet only enqueues selections
- Queue GET attaches presigned preview URLs at read time to satisfy visual review without violating corpus storage boundaries
- Non-owner corpus POST attempts from review sheet fail silently (403); owners get discreet success/error toasts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Ephemeral preview URLs on queue GET**
- **Found during:** Task 1 (evaluation panel image context)
- **Issue:** Corpus rows intentionally omit image URLs; panel could not show visual context for human judgment
- **Fix:** Resolve derivation `outputKey` to `previewImageUrl` in platform-owner queue GET handler
- **Files modified:** `app/src/app/api/feedback/human-quality-corpus/route.ts`
- **Committed in:** `a68f82ce`

**2. [Rule 3 - Blocking] workspaceId not available on campaign page campaign object**
- **Found during:** Task 3 (production build)
- **Issue:** `campaign` UI shape lacks `workspaceId`; TypeScript build failed
- **Fix:** Export `workspaceId` from `useCampaignWorkspace` via derivations data
- **Files modified:** `app/src/lib/hooks/use-campaign-workspace.ts`, `app/src/app/(dashboard)/campaigns/[id]/page.tsx`
- **Committed in:** `7c031971`

**3. [Rule 3 - Blocking] Human-quality TypeScript build errors**
- **Found during:** Task 3 (production build)
- **Issue:** `InsertCorpusItemInput` and `buildQualitySnapshotFromDerivation` return types incompatible with strict build
- **Fix:** Omit typed JSON fields from insert interface extension; cast snapshot to `Record<string, unknown>`
- **Files modified:** `app/src/server/repositories/human-quality-corpus.ts`, `app/src/server/human-quality/service.ts`
- **Committed in:** `7c031971`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** Required for correct human review UX and green verification; no scope creep beyond Phase 129 boundaries.

## Issues Encountered

None beyond auto-fixed build/type issues documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 129 complete: manual corpus selection, internal queue, structured human evaluations, and privacy-safe payloads are in place
- Phase 130 can calibrate automatic `qualityScore` against stored human visual scores
- No calibration or learning-impact claims were made in this phase

## Self-Check: PASSED

- FOUND: `.planning/phases/129-live-human-quality-corpus/129-03-SUMMARY.md`
- FOUND: `app/src/components/feedback/HumanQualityCorpusPanel.tsx`
- FOUND: commit `a68f82ce`
- FOUND: commit `eeeaf752`
- FOUND: commit `7c031971`

---
*Phase: 129-live-human-quality-corpus*
*Completed: 2026-06-17*
