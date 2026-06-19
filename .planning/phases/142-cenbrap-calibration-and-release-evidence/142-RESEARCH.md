---
phase: 142
slug: cenbrap-calibration-and-release-evidence
status: planning
created: 2026-06-19
---

# Phase 142 - Research

## Code Map

| Area | Files | Current Capability | Phase 142 Use |
| --- | --- | --- | --- |
| Campaign lookup | `app/src/server/repositories/campaign.ts` | Campaign rows include client/profile fields and list pagination/search | Select real Cenbrap campaigns conservatively |
| Derivation lookup | `app/src/server/repositories/derivation.ts` | Campaign derivations include status, outputKey, `olharVerdict`, `exportStatus` | Build calibration corpus and contact-sheet rows |
| Human decisions | `app/src/server/repositories/output-decision-event.ts` | Filter by workspace, campaign, derivation, client profile, action, time | Read Jhonatan/operator decisions |
| Decision snapshot | `app/src/server/output-learning/output-decision-events.ts` | Sanitized snapshot can include reason, verdict refs, override flag | Compute mismatch/agreement without exposing prompt/media secrets |
| Approval package | `app/src/server/ai/client-approval-package.ts` | Package eligibility uses dual verdicts and override markers | Evidence approved-invalid prevention and override handling |
| Sampling honesty | `app/src/server/human-quality/sampling/*`, `app/scripts/lib/evidence-honesty.mjs` | Shared thresholds and `sampleGuidance` validators | Keep small Cenbrap sample honest |
| Release evidence | `app/scripts/check-real-quality-release-evidence.mjs`, `run-real-quality-release-gate.mjs`, operational gate scripts | Prior release gates separate technical vs operational evidence | Mirror pattern for v12.7 audit |

## Existing Building Blocks

- `SAMPLE_GLOBAL_MIN = 5`, `SAMPLE_SLICE_MIN = 3`, `SAMPLE_ARM_MIN = 3`.
- `validateSampleGuidanceArray` and `rejectClaimsWhenGuidanceBlocked` already encode the "no claim with insufficient sample" rule.
- `output_decision_events` has actor/campaign/derivation/context and is append-only.
- `olharVerdict.value` and `exportStatus.value` are persisted on derivations and snapshots.
- `overrideApproved` exists in output-decision snapshots and package item metadata.

## Missing Pieces

1. No v12.7-specific calibration evidence schema exists.
2. No script selects Cenbrap campaigns and emits contact-sheet/evidence artifacts.
3. No metric aggregator compares system verdicts against Jhonatan decisions.
4. No v12.7 release gate/audit exists to close the milestone honestly.
5. No canonical artifact records which real campaigns were reviewed and which claims are blocked by sample size.

## Suggested Data Shape

`142-CENBRAP-CALIBRATION.json`:

- `schemaVersion`
- `capturedAt`
- `client: "Cenbrap"`
- `campaigns[]`
  - campaign metadata
  - derivation rows
  - image/output refs as safe keys or redacted IDs, not signed URLs
  - `olharVerdict`
  - `exportStatus`
  - package eligibility
  - decision event refs
- `operatorDecisions[]`
  - `derivationId`
  - system verdict refs
  - human decision: `entra | quase | nao_entra`
  - mismatch reason
  - override marker
- `metrics`
  - evaluatedCampaignCount
  - evaluatedDerivationCount
  - decisionCount
  - agreementRate or null
  - mismatchReasonCounts
  - approvedInvalidPreventedCount
  - semOpiniaoDetectionCount
  - exportBlockSeparationCount
- `sampleGuidance[]`
- `status: ok | insufficient_sample`

`142-CONTACT-SHEET.md`:

- one section per campaign;
- compact table of outputs, system verdicts, export status, package eligibility, Jhonatan decision, mismatch reason;
- image references only when safe/local artifacts are available.

`142-EVIDENCE.json`:

- release-facing summary of technical checks, calibration status, factual/export status, art-direction agreement, sample guidance and accepted gaps.

## Metrics Definitions

- Agreement: human decision compatible with system verdict.
  - `entra` agrees with `pronta` or approved `quase` when export is not `bloqueado`.
  - `quase` agrees with system `quase` or blocked-but-salvageable verdict with corrective reason.
  - `nao_entra` agrees with `sem_opiniao`, `confusa`, or export `bloqueado`.
- Mismatch: human decision contradicts system verdict or export status.
- Approved-invalid prevention: normal approval blocked by `assertDerivationApprovable` / package eligibility instead of silently entering package.
- Sem-opiniao detection: count of rows where system flagged `sem_opiniao` and human did not mark `entra` without override.
- Export-block separation: rows where `exportStatus: bloqueado` is counted separately from art-direction failure.

## Risks

- Real DB may have fewer than two Cenbrap campaigns or fewer than five reviewed derivations.
- Old derivations may lack `olharVerdict` / `exportStatus`; evidence must classify them as `missing_dual_verdict`, not silently infer.
- Jhonatan decisions may not exist in `output_decision_events`; Phase 142 must produce a manual review artifact instead of pretending agreement.
- Contact sheets can accidentally expose signed URLs or prompt text; artifacts should avoid secrets and signed media URLs.
- Closing the milestone with "quality improved" from insufficient sample would violate v12.5/v12.6 evidence rules.

## Recommended Implementation Shape

1. Add a small v12.7 calibration module under `app/src/server/olhar-calibration` or similar.
2. Add a script `app/scripts/run-cenbrap-calibration.ts` that can:
   - select campaigns by client/clientProfile/name containing Cenbrap;
   - emit a template when DB/data is unavailable;
   - write JSON + contact-sheet markdown artifacts under `.planning/phases/142-*`.
3. Add checker `app/scripts/check-olhar-release-evidence.mjs`.
4. Add an npm script alias if useful for repeatability.
5. Create milestone audit `.planning/milestones/v12.7-MILESTONE-AUDIT.md` only after evidence exists.

## Validation Architecture

Automated:

- unit tests for agreement/mismatch metric functions;
- script/checker tests or fixture-driven tests for insufficient sample guidance;
- smoke command for evidence checker;
- release gate/audit check that fails on blended factual/art-direction/sample claims.

Manual:

- Jhonatan reviews at least two Cenbrap contact-sheet sections when available;
- Jhonatan records `entra`, `quase`, `nao entra` decisions and mismatch reasons;
- if not enough data exists, operator accepts explicit tech-debt/accepted-gap wording.
