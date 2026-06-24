---
phase: 166-per-brand-evidence-gate
plan: 02
subsystem: ui
tags: [brand-taste, evidence-gate, react, vitest, tanstack-query]

requires:
  - phase: 166-per-brand-evidence-gate
    provides: GET .../evidence API and PerBrandEvidenceReport builder
provides:
  - BrandEvidencePanel with claims matrix and fixture caveat display
  - Evidência tab on OwnerCalibrationPanel
  - Component tests for fixture-only vs mixed-source withholding UI
affects:
  - 167-global-cross-client-promotion

tech-stack:
  added: []
  patterns:
    - TanStack Query fetchBrandEvidence mirroring profile panel pattern
    - PT-BR CLAIM_LABELS map for server claim keys
    - data-testid sections for allowed/blocked claims assertions

key-files:
  created:
    - app/src/components/admin/BrandEvidencePanel.tsx
    - app/src/components/admin/BrandEvidencePanel.test.tsx
  modified:
    - app/src/components/admin/OwnerCalibrationPanel.tsx
    - app/src/components/admin/OwnerCalibrationPanel.test.tsx
    - app/src/components/admin/BrandTasteProfilePanel.tsx
    - app/src/components/admin/BrandTasteProfilePanel.test.tsx

key-decisions:
  - "Dedicated fixture-caveat-banner testId separate from status row bannerText duplication"
  - "Exported SOURCE_LABELS from BrandTasteProfilePanel for evidence source table reuse"
  - "Customer-real blocked note shown when validated_against_customer_real in claimsBlocked"

patterns-established:
  - "Evidence tab consumes { report } envelope from owner evidence API via fetchBrandEvidence"
  - "Claims UI renders server claimsBlocked/claimsAllowed without client-side promotion"

requirements-completed: [EVIDENCE-04, EVIDENCE-05]

duration: 8min
completed: 2026-06-24
---

# Phase 166 Plan 02: Evidência Tab UI Summary

**BrandEvidencePanel with PT-BR claims matrix, fixture caveat banner, and Evidência tab wired on OwnerCalibrationPanel**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-24T14:38:00Z
- **Completed:** 2026-06-24T14:42:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `BrandEvidencePanel` fetches per-brand evidence report and renders level, sources, allowed/blocked claims, missing conditions
- Fixture-only brands show prominent `fixtureCaveat` banner plus status warning (EVIDENCE-04)
- `OwnerCalibrationPanel` Evidência tab mounts evidence panel; profile tab retains fixture banner test
- 17 component tests pass covering fixture vs mixed-source withholding (EVIDENCE-05 UI)

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: BrandEvidencePanel component** — `4fad6972` (test), `41059b86` (feat)
2. **Task 2: Wire Evidência tab + profile caveat reinforcement** — `ee569b3f` (feat)

## Files Created/Modified

- `app/src/components/admin/BrandEvidencePanel.tsx` — evidence display with claims matrix and fixture caveat
- `app/src/components/admin/BrandEvidencePanel.test.tsx` — 6 tests (fixture caveat, claims, 403)
- `app/src/components/admin/OwnerCalibrationPanel.tsx` — Evidência tab + BrandEvidencePanel render
- `app/src/components/admin/OwnerCalibrationPanel.test.tsx` — tab navigation tests
- `app/src/components/admin/BrandTasteProfilePanel.tsx` — export SOURCE_LABELS
- `app/src/components/admin/BrandTasteProfilePanel.test.tsx` — fixture banner assertion

## Decisions Made

- Dedicated `data-testid="fixture-caveat-banner"` for Evidência tab caveat (status row also shows bannerText from getCalibrationStatusDisplay)
- Exported SOURCE_LABELS rather than duplicating source label map
- Supplementary note when `validated_against_customer_real` blocked — no green customer-validated copy

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 166 complete — all EVIDENCE-01..05 satisfied
- Phase 167 can build on per-brand evidence honesty for global promotion gates

## Self-Check: PASSED

- FOUND: app/src/components/admin/BrandEvidencePanel.tsx
- FOUND: app/src/components/admin/BrandEvidencePanel.test.tsx
- FOUND: 4fad6972, 41059b86, ee569b3f

---
*Phase: 166-per-brand-evidence-gate*
*Completed: 2026-06-24*
