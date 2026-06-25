---
phase: 168-client-agnostic-human-decision-intake
status: complete
created: 2026-06-25
---

# Phase 168 Research: Client-Agnostic Human Decision Intake

## Objective

Plan how to implement Phase 168 so owner human judgments become canonical calibration evidence for any brand/profile, without preserving Cenbrap as the product model.

## Existing Implementation Facts

### Corpus review path

- `app/src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.ts` requires platform owner access and calls `submitHumanEvaluation`.
- The route supports global mode by omitting browser-supplied `workspaceId`; the service resolves workspace from the corpus item.
- `HumanQualityCorpusPanel` submits `visualScore`, `factualPass`, `intent`, `primaryFailureReason`, optional text and notes.
- Queue filters already support `clientProfileId` at the parser/repository level, but the panel queue state currently exposes cohort, generation mode, format, source and status, not a client profile filter.

### Evidence write path

- `submitHumanEvaluation` validates fields, loads the corpus item, writes `human_quality_evaluations`, resolves source label from candidate metadata, builds a feedback artifact and returns `{ item, evaluation, feedbackArtifact }`.
- `recordOutputDecisionEvidence` writes canonical `output_decision_events` and already accepts `clientProfileId`.
- `recordCalibrationSignalFromOutputDecisionEvent` converts an output decision event into `calibration_signals`.
- Per-brand evidence reports consume `calibration_signals`, not raw corpus evaluations.

### Data/source constraints

- Canonical source labels are `synthetic_fixture`, `operator_imported`, `real_customer`.
- `calibration_signals` source labels use the same three labels.
- Existing evidence copy says fixture/operator evidence is not customer-real validation; Phase 168 should strengthen this by avoiding customer-name-specific proof language.

## Recommended Implementation Shape

### 1. Add a generic evaluation-to-decision bridge

Create a small server helper, for example:

- `app/src/server/human-quality/human-decision-calibration.ts`

Responsibilities:

- Map `HumanQualityIntent` to `OutputDecisionAction`: `approve -> approved`, `reject -> rejected`, `regenerate -> regenerated`.
- Build a sanitized output decision snapshot from the corpus item's quality snapshot plus reviewer reason metadata.
- Preserve `workspaceId`, `clientProfileId`, `campaignId`, `derivationId`, reviewer id, source label and reviewed timestamp.
- Call `recordOutputDecisionEvidence` first, then `recordCalibrationSignalFromOutputDecisionEvent`.
- Use deterministic idempotency keys tied to evaluation id or corpus item id so retries do not duplicate signals.
- Return the output decision event and calibration signal status.

Wire the helper from `submitHumanEvaluation` after feedback artifact insertion, because the evaluation id and final source label are available there.

### 2. Keep global queue evaluation generic

Do not add a Cenbrap-only route or script. If UI polish is needed, put it in `HumanQualityCorpusPanel`:

- Expose current item `clientProfileId` in the metadata block.
- Add a client profile filter if practical using the existing `clientProfileId` query filter.
- Replace raw source label display with explicit fixture-safe copy.
- Add a warning when source is `synthetic_fixture`: this row teaches workflow/calibration mechanics but does not prove customer-real claims.

### 3. Prove evidence updates and isolation

Tests should cover:

- Service writes feedback artifact plus output decision event plus calibration signal.
- Global mode resolves workspace from the corpus item.
- Source label from candidate is preserved into calibration signal.
- `synthetic_fixture` produces fixture-safe copy.
- Two different `clientProfileId` values remain isolated when building evidence/profile reports.

## Validation Architecture

### Test infrastructure

- Framework: Vitest via `npm test -- --run ...`
- Existing config: `app/config/vitest.config.ts`
- Quick run command:
  - `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts app/src/components/feedback/HumanQualityCorpusPanel.test.tsx tests/unit/brand-taste/calibration-evidence.test.ts`
- API route run command:
  - `cd app && npm test -- --run 'src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts'`
- Final phase command:
  - `cd app && npm test -- --run tests/unit/human-quality/human-quality-service.test.ts app/src/components/feedback/HumanQualityCorpusPanel.test.tsx tests/unit/brand-taste/calibration-evidence.test.ts 'src/app/api/feedback/human-quality-corpus/[id]/evaluation/route.test.ts'`

### Required automated coverage

- DECISION-01: component/API route can submit evaluation in global mode and optional filtered mode.
- DECISION-02: service-level test asserts output decision and calibration signal payload include workspace, clientProfileId, source label, reviewer, reviewedAt, verdict and rationale.
- DECISION-03: component/unit copy test asserts fixture-safe text and no customer-specific proof wording.
- DECISION-04: evidence test asserts generic signals update report/profile counts.
- DECISION-05: isolation test asserts client A decisions do not change client B evidence.

### Manual verification

No manual browser gate is required for Phase 168 planning. UI changes should be covered by focused component tests. Browser UAT can be added in later execution if the component layout changes materially.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Duplicated evidence on retry | Use idempotency key based on evaluation id or corpus item id |
| Source label lost in bridge | Resolve source label once in service and pass it into the bridge |
| Fixture rows become product claims | Add source-specific copy and tests for `synthetic_fixture` wording |
| Cross-brand contamination | Test distinct `clientProfileId` payloads and evidence/profile filters |
| Raw prompt/storage leakage | Reuse existing sanitized snapshot builders and do not add artifact payload fields |

## Open Questions

- Whether Phase 168 should add a visible client profile filter to the queue or only expose the current item profile metadata. The existing API already accepts `clientProfileId`, so adding the UI filter is low-risk if brand list data is easily available.
- Whether output decision events should be written before or after feedback artifact insertion. Recommendation: after artifact insertion, using evaluation id for idempotency.

---

## RESEARCH COMPLETE

Phase 168 should be planned as a generic bridge from owner corpus evaluation to output decision events and calibration signals, plus fixture-safe UI copy and isolation tests.
