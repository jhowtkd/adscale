---
phase: 148
slug: sample-sufficiency-expansion
status: planning
created: 2026-06-19
---

# Phase 148 - Research

## Inputs Reviewed

| Source | What It Proves |
|--------|----------------|
| `.planning/phases/147-operator-decision-session-and-calibration-rerun/147-VERIFICATION.md` | Phase 147 complete with `human_needed`; operator decisions remain absent and sample is 0/5. |
| `.planning/phases/147-operator-decision-session-and-calibration-rerun/147-CALIBRATION-RUN.md` | Calibration rerun worked; metrics remain `decisionCount=0`, `missingHumanDecisionCount=2`, `agreementRate=null`. |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-EVIDENCE.json` | Release evidence status is `human_needed`; sample guidance requires 5 more decisions. |
| `.planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun/144-CORPUS-RUN.md` | Current seed path produced 2 `synthetic_fixture` rows and documented source-label caveats. |
| `app/scripts/seed-cenbrap-calibration-corpus.ts` | Existing seed/inspect script can be reused or extended; current fixtures are fixed at 2 rows. |
| `app/scripts/run-cenbrap-calibration.ts` | Canonical calibration runner writes `142-CENBRAP-CALIBRATION.json` and contact sheet. |
| `app/scripts/build-olhar-release-evidence.ts` | Canonical evidence builder writes `142-EVIDENCE.json`. |

## Current Gap

The current system has enough infrastructure to run the loop but not enough human sample:

- 2 reviewable rows exist.
- 0 operator decisions are recorded.
- 5 decisions are required for the `calibration_global` gate.
- Therefore the minimum path is not just adding 3 rows; it is getting 5 rows with actual Jhonatan decisions.

## Expansion Options

| Option | Use When | Evidence Strength | Caveat |
|--------|----------|-------------------|--------|
| Fill decisions for existing 2 rows | Jhonatan can decide current contact sheet now | Starts human sample | Still 2/5; insufficient |
| Add 3 more synthetic fixtures | Need operational sample quickly | Tests loop and agreement math | Not customer-real proof |
| Operator-import real Cenbrap rows | Real campaign assets are available but not in DB | Stronger than fixture, if source is clear | Must avoid signed URLs/prompts |
| Wait for customer-real campaigns | No safe import source exists | Honest blocker | Keeps sample insufficient |

## Validation Architecture

Phase 148 validation should prove:

1. Current source inventory is known.
2. At least 5 rows are reviewable with dual verdicts, or blocker says exactly why not.
3. Jhonatan decisions are recorded for rows that count toward sample sufficiency.
4. Calibration/evidence rerun keeps `agreementRate=null` until `additionalNeeded=0`.
5. Source composition appears in the sample audit and cannot be hidden in claims.

## Implementation Notes

- Reuse `inspectCenbrapCorpus()` for pre/post counts.
- If extending seed data, update `seed-cenbrap-calibration-corpus.ts` or create a Phase 148-specific import script only if that keeps source labels clearer.
- Do not mutate `144-CORPUS-MANIFEST.json` silently; create a Phase 148 manifest/audit that records additional rows and source labels.
- Keep `145-DECISIONS.json` as the operator decision input unless a new 148 decision artifact is necessary to cover additional rows.
- Any row without a real decision must remain `manual_pending` and cannot count toward the 5-decision threshold.

## Risks

| Risk | Mitigation |
|------|------------|
| Counting reviewable rows as decisions | Validation must inspect `humanDecisionCount`, not only row count. |
| Creating synthetic rows and calling them proof | Source composition table must separate fixture/import/customer-real. |
| Unlocking `agreementRate` too early | Evidence checker and explicit spot-check must enforce `additionalNeeded=0`. |
| Broadening into customer-real corpus prematurely | Phase 149 owns customer-real replacement; Phase 148 only records source and blocker truth. |
