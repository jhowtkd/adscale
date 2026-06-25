---
phase: 172-operational-evidence-ui-and-release-gate
plan: 01
subsystem: ui
tags: [react, tanstack-query, factual-alerts, owner-quality, vitest]

requires:
  - phase: 172-operational-evidence-ui-and-release-gate
    provides: factual-alerts API route and FactualIssueAlert types (pre-existing backend)
provides:
  - FactualAlertsPanel client component with fetchFactualAlerts helper
  - Read-only factual issue alerts table with sanitized evidence links
  - Unit tests proving list render, 403/empty states, links, and no action buttons
affects:
  - 172-02-PLAN.md (panel mounting in HumanQualityCorpusPanel and OwnerCalibrationPanel)
  - 172-03-PLAN.md (release gate UI evidence checks)

tech-stack:
  added: []
  patterns:
    - "apiFetch + useQuery with 403 → null → restricted message (mirrors LearningProposalsTab)"
    - "Read-only warning-bordered section separate from proposal accept/reject flow"

key-files:
  created:
    - app/src/components/feedback/FactualAlertsPanel.tsx
    - app/src/components/feedback/FactualAlertsPanel.test.tsx
  modified: []

key-decisions:
  - "Stats displayed with labeled rows (count:, meanSignedDelta:, etc.) for operator clarity"
  - "Corpus items link to /feedback with id as link text; artifacts show count-only string"
  - "Component standalone — mounting deferred to Plan 02 per D-01"

patterns-established:
  - "Factual guard section uses amber warning border/badge distinct from proposal table"
  - "Forbidden evidence fields (artifactRef, storageKey, evaluationNotes) never rendered from API payload"

requirements-completed: [ALERT-01, ALERT-02, ALERT-03]

duration: 4min
completed: 2026-06-25
---

# Phase 172 Plan 01: FactualAlertsPanel Summary

**Read-only factual issue alerts panel fetching owner-gated API with sanitized brand/corpus links and zero rule-creation actions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-25T09:07:00Z
- **Completed:** 2026-06-25T09:11:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `FactualAlertsPanel` + `fetchFactualAlerts` export with workspace/brand variant headings and factual-guard warning copy
- TanStack Query fetch to `GET /api/admin/quality/learning/factual-alerts` with optional `workspaceId` / `clientProfileId` filters
- Table rendering sliceKey, workspaceId, brand link, rationale, aggregate stats, corpus item links, and artifact count-only
- 10 Vitest tests covering loading/403/empty, scoped fetch URL, evidence links, forbidden field absence, and no Accept/Reject/Generate buttons

## Task Commits

1. **Task 1 RED:** `4462988a` — test(172-01): add failing tests for FactualAlertsPanel shell
2. **Task 1 GREEN:** `3706afb9` — feat(172-01): implement FactualAlertsPanel fetch and section shell
3. **Task 2 RED:** `6edd9e9b` — test(172-01): add failing tests for evidence links and stats
4. **Task 2 GREEN:** `669dd818` — feat(172-01): add sanitized evidence links and stats to alerts panel

## Files Created/Modified

- `app/src/components/feedback/FactualAlertsPanel.tsx` — Read-only alerts section with API fetch and sanitized evidence table
- `app/src/components/feedback/FactualAlertsPanel.test.tsx` — Unit tests for shell, links, stats, and read-only guard

## Decisions Made

- Stats use labeled inline rows for scanability in ops context
- Corpus deep-link uses `/feedback` with visible corpus item id (conservative D-02 fallback)
- Explanatory copy may mention "prompt rules" but API payload fields like `artifactRef` are never rendered

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stats test matchers updated for labeled stat display**
- **Found during:** Task 2 GREEN
- **Issue:** `getByText("4")` failed because stats render as `count: 4` not bare numbers
- **Fix:** Updated tests to use regex matchers on labeled stat strings
- **Files modified:** `app/src/components/feedback/FactualAlertsPanel.test.tsx`
- **Committed in:** `669dd818`

---

**Total deviations:** 1 auto-fixed (1 bug/test alignment)
**Impact on plan:** Test adjustment only; behavior matches plan intent.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Panel component ready for mounting in Plan 02 (`HumanQualityCorpusPanel` Learning tab and `OwnerCalibrationPanel` Propostas tab)
- API route tests remain green (`factual-alerts/route.test.ts` — 5 passed)

## Self-Check: PASSED

- FOUND: app/src/components/feedback/FactualAlertsPanel.tsx
- FOUND: app/src/components/feedback/FactualAlertsPanel.test.tsx
- FOUND: .planning/phases/172-operational-evidence-ui-and-release-gate/172-01-SUMMARY.md
- FOUND: 4462988a, 3706afb9, 6edd9e9b, 669dd818

---
*Phase: 172-operational-evidence-ui-and-release-gate*
*Completed: 2026-06-25*
