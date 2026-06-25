---
phase: 169-real-corpus-and-claim-gates
status: complete
created: 2026-06-25
---

# Phase 169 Research: Real Corpus and Claim Gates

## Objective

Plan how to make real/operator corpus evidence usable for any client profile and ensure claims remain blocked unless the active brand sample is source- and sample-sufficient.

## Existing Implementation Facts

### Candidate capture and promotion

- `app/src/server/human-quality/candidate-capture.ts` captures candidates from completed derivations and assigns `sourceLabel` through `resolveAutoCaptureSourceLabel`.
- `resolveAutoCaptureSourceLabel` returns `synthetic_fixture` for configured synthetic workspace ids and `real_customer` otherwise.
- `resolveOperatorImportedSourceLabel` exists, but the current promotion route does not expose an explicit operator-import path.
- `promoteCorpusCandidateToQueue` rejects candidates without `clientProfileId`, reuses an existing corpus item when present and creates queue items for pending review.
- Candidate listing exposes `clientProfileId`, `sourceLabel`, workspace/campaign/derivation ids and preview metadata.

### Evidence and claim gates

- `runGlobalCorpusEvidence` currently accepts `cohort` and uses `countFeedbackArtifactsBySourceLabel`, `runSampleCoverage`, `getCorpusOperationsProgress` and `listEvaluatedCorpusWithEvaluations`.
- `countFeedbackArtifactsBySourceLabel` supports `workspaceId` and `cohort`, but not `clientProfileId`.
- `GlobalCorpusEvidenceReport` includes `sourceComposition`, `fixtureOnly`, `claimsAllowed`, `claimsBlocked`, `withheldClaims`, `dependsOnOperator` and `brandTasteClientScopes`.
- `isFixtureOnlySourceComposition` returns true when `real_customer === 0`, which correctly blocks customer-real proof even if operator-imported evidence exists.
- Existing release evidence tests already enforce the principle that technical green and operational insufficiency are separate statuses.

### What Phase 168 changed

- Owner corpus evaluations now write canonical decision/output evidence and calibration signals for generic `clientProfileId` rows.
- The owner queue exposes profile/source context and fixture-safe copy.
- Cenbrap remains fixture/seed only in planning and verification.

## Recommended Implementation Shape

### 1. Make source-labeled corpus intake explicit

Keep the candidate path generic and extend only the smallest necessary API/service seams:

- Add a source selection to candidate promotion only for owner/operator import flows, allowing `operator_imported` and `real_customer` when explicitly supplied by an owner route.
- Continue to default auto-captured derivations through `resolveAutoCaptureSourceLabel`.
- Preserve `clientProfileId`, `workspaceId`, `campaignId`, `derivationId`, `sourceLabel` and source caveats when the candidate becomes a corpus item.
- Reject promotion if `clientProfileId` is missing or if the requested source label is invalid for the path.

Do not add a customer-name branch. If Cenbrap rows are promoted, they must pass through the same generic route and label checks as every other client.

### 2. Add active-scope evidence gates

Extend evidence APIs/services so claim gates can be evaluated for an active brand/profile:

- Add optional `workspaceId` and `clientProfileId` filters to global evidence route/service where owner access already applies.
- Add `clientProfileId` filtering to source composition counts by joining artifacts to corpus items if needed.
- Make sample coverage and evaluated-row scopes align with the same active filters, or explicitly report any unsupported scope as `claim_withheld`.
- Keep `operator_imported` distinct from `real_customer`; operator rows may support operational readiness but must not unlock `validated_against_customer_real`.

### 3. Release an evidence artifact that reports both truths

Use or extend the existing release evidence pattern:

- Technical status: tests/build/regression status.
- Operational evidence status: selected active brand sample count, source composition, claims allowed/blocked and next operator actions.
- Accepted status examples: `ok`, `insufficient_sample`, `insufficient_source`, `claim_withheld`, `blocked`.

The artifact should make it impossible to read a technical pass as a customer-real claim.

## Validation Architecture

### Test infrastructure

- Framework: Vitest via `npm test -- --run ...`
- Existing config: `app/config/vitest.config.ts`
- Candidate path command:
  - `cd app && npm test -- --run tests/unit/human-quality/candidate-capture.test.ts tests/unit/human-quality/candidate-promotion.test.ts 'src/app/api/feedback/human-quality-corpus/candidates/route.test.ts' 'src/app/api/feedback/human-quality-corpus/candidates/[id]/promote/route.test.ts'`
- Evidence path command:
  - `cd app && npm test -- --run tests/unit/human-quality/global-evidence.test.ts src/app/api/feedback/global-corpus-evidence/route.test.ts tests/unit/brand-taste/calibration-evidence.test.ts`
- Release path command:
  - `cd app && npm test -- --run tests/unit/release/real-quality-release-evidence.test.ts tests/unit/release/operational-quality-release-evidence.test.ts`

### Required automated coverage

- SOURCE-01: promote/import tests prove explicit source label and `clientProfileId` are required/preserved.
- SOURCE-02: evidence tests prove all three source labels remain separate in reports.
- SOURCE-03: claim tests prove customer-real, agreement-rate and quality-improvement claims are withheld until the active scope is sufficient.
- SOURCE-04: fixture-only and operator-only reports never unlock customer-real claims.
- SOURCE-05: release evidence tests prove technical status and operational evidence status are separate fields.

### Manual verification

No browser UAT is required for initial Phase 169 execution unless UI is added beyond existing owner/admin surfaces. If a visible import/promote control is added, perform a quick owner UI smoke after automated tests pass.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Treating operator-imported rows as real-customer proof | Keep source-label gates explicit and test operator-only reports |
| Global evidence overclaims across profiles | Add active `clientProfileId` filters and tests with two profiles |
| Auto-captured fixture workspaces unlock claims | Preserve `synthetic_fixture` source and block when `real_customer === 0` |
| Technical release pass is read as customer validation | Release artifact must separate technical and operational status |
| Source overrides corrupt candidate history | Allow overrides only through owner/operator import path and keep defaults for auto-capture |

## Open Questions

- Whether Phase 169 should add a minimal owner UI control for explicit source selection during promotion, or only expose API/service support and tests. Recommendation: include the control only if existing component wiring is small; otherwise keep UI to Phase 172 evidence surfaces.
- Whether agreement-rate claims should use global evidence only or per-brand calibration evidence. Recommendation: per active brand/profile, with global report only summarizing scopes.

---

## RESEARCH COMPLETE

Phase 169 should be planned as source-labeled generic corpus intake, active-scope claim gates and release evidence that separates technical pass from operational/customer-real proof.
