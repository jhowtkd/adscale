---
phase: 58-scoring-and-qa-alignment
plan: "02"
subsystem: ai
tags: [quality-gate, i18n, review-ui, hard-failures]

requires:
  - phase: 58-scoring-and-qa-alignment
    provides: Taxonomy module and normalization from 58-01
provides:
  - Inherited CTA hard-failure classification
  - Score-issue promotion to hard failures
  - Localized hard-failure titles in review UI
affects: [59-regeneration, 60-fixtures]

tech-stack:
  added: []
  patterns:
    - promoteScoreIssuesToHardFailures bridge in gate classification
    - Localized code title + model note stacking in UI

key-files:
  modified:
    - app/src/server/ai/creative-quality-gate.ts
    - app/tests/unit/ai/creative-quality-gate.test.ts
    - app/messages/en.json
    - app/messages/pt-BR.json
    - app/src/components/workspace/DerivationReviewModal.tsx
    - app/src/components/workspace/DerivationCard.tsx

key-decisions:
  - "Inherited CTA ctaOffer failed only hard-fails when note matches CTA_DRIFT_NOTE_PATTERN"
  - "Contract-violation scoreIssues promote to hard failures; subjective issues stay polish"
  - "UI shows localized hardFailureCodes title with model message as secondary detail"

patterns-established:
  - "Gate: promoteScoreIssuesToHardFailures before polish collection"
  - "UI: tr(hardFailureCodes.{code}) primary + truncated failure.message secondary"

requirements-completed: [AIQ-03, AIQ-04, AIQ-05]

duration: 12min
completed: 2026-06-05
---

# Phase 58 Plan 02: Gate Alignment + i18n/UI Summary

**Inherited CTA and score-issue promotion close gate gaps; review UI shows localized blocking titles with model notes as detail.**

## Performance

- **Duration:** 12 min
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Extended `classifyCtaOfferFailed` for inherited CTA contracts with CTA drift note patterns
- Added `promoteScoreIssuesToHardFailures` to classify contract violations from scoreIssues
- Added EN/PT-BR `review.hardFailureCodes.*` keys and blocking/polish helper hints
- Updated DerivationReviewModal and DerivationCard to show localized titles with model note detail

## Task Commits

1. **Task 1: Gate hard failures and score-issue promotion** - `c7fdb2e` (feat)
2. **Task 2: PT-BR/EN hard-failure i18n keys** - `9bebcd5` (feat)
3. **Task 3: Review UI localized failure titles** - `d21bf57` (feat)

## Files Created/Modified

- `app/src/server/ai/creative-quality-gate.ts` - Inherited CTA + score promotion
- `app/tests/unit/ai/creative-quality-gate.test.ts` - Inherited CTA, promotion, high-score+invalid tests
- `app/messages/en.json`, `app/messages/pt-BR.json` - hardFailureCodes, helper hints
- `DerivationReviewModal.tsx`, `DerivationCard.tsx` - Localized title + note stacking

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- Gate tests pass (47 tests in gate + component suites)
- i18n validation: all 7 codes in EN and PT-BR
- Commits c7fdb2e, 9bebcd5, d21bf57: FOUND
