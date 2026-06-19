---
phase: 146
slug: evidence-refresh-and-claims-gate
status: planning
created: 2026-06-19
---

# Phase 146 - Research

## Inputs Reviewed

| Source | What It Proves |
|--------|----------------|
| `.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-VERIFICATION.md` | Phase 145 is technically complete but `human_needed`; decisions were not fabricated. |
| `.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISION-RUN.md` | Decision workflow exists, but `decisionCount=0`, `missingHumanDecisionCount=2`. |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json` | Live calibration artifact is the canonical source for Phase 146 evidence refresh. |
| `.planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md` | 2 rows are reviewable and pending Jhonatan decisions. |
| `app/src/server/olhar-calibration/olhar-release-evidence.ts` | Release evidence builder already separates art-direction and factual/export metrics. |
| `app/scripts/check-olhar-release-evidence.mjs` | Release checker enforces status vocabulary and rejects claims blocked by sample guidance. |
| `app/src/server/olhar-calibration/olhar-release-evidence.test.ts` | Unit tests cover insufficient sample, sufficient sample, metric separation and `human_needed`. |

## Current Evidence Model

The release evidence contract has the right shape:

- `artDirectionMetrics`: agreement, mismatch and human decision status.
- `factualExportMetrics`: export blockers, approved-invalid prevention, sem-opiniao detection and package eligibility.
- `sampleGuidance`: global and bucket-level thresholds for claims.
- `requirements`: mapped to `CLAIM-01..04`.
- `status`: supports `human_needed`, `insufficient_sample`, `tech_debt` and `ok`.

The missing piece is operational: Phase 146 needs a repeatable way to build the refreshed evidence JSON from the latest live calibration artifact and then audit the milestone wording around it.

## Expected Status If Executed Now

If Phase 146 is executed before Jhonatan fills `145-DECISIONS.json`, the correct release state is:

- status: `human_needed`.
- `agreementRate`: `null`.
- `artDirectionMetrics.humanDecisionCount`: `0`.
- `artDirectionMetrics.missingHumanDecisionCount`: `2`.
- `artDirectionMetrics.comparableCount`: `0`.
- `sampleGuidance.calibration_global.current`: `0`.
- `sampleGuidance.calibration_global.additionalNeeded`: `5`.
- quality/agreement claims: withheld.

That outcome should be considered a successful gate if the artifacts make the blocker explicit.

## Implementation Notes

- Prefer adding a small builder CLI if no current script writes a live `142-EVIDENCE.json`.
- Keep `app/scripts/check-olhar-release-evidence.mjs` as the validator of the evidence artifact.
- Use `142-EVIDENCE.json` as the live generated evidence path; keep `142-EVIDENCE.template.json` as historical/template evidence.
- Write the Phase 146 audit in the Phase 146 directory, then sync milestone/project state.
- Use the source caveat `synthetic_fixture` in every final claim artifact.

## Risks

| Risk | Mitigation |
|------|------------|
| A passing checker is interpreted as quality pass | Audit must say green technical gate is not agreement evidence. |
| `human_needed` is treated as incomplete execution | Phase verification must define it as valid release state when decisions are absent. |
| v12.7 tech debt is closed too broadly | Close only infrastructure/live-run portions; carry forward Jhonatan decisions and sample sufficiency. |
| Template evidence stays canonical | Generated `142-EVIDENCE.json` must be the canonical refreshed artifact for v12.8. |
