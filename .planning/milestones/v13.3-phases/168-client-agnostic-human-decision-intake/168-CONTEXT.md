# Phase 168: Client-Agnostic Human Decision Intake - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** User direction in milestone reset

<domain>
## Phase Boundary

This phase turns existing owner corpus evaluation into canonical brand decision evidence for any `clientProfileId`.

It must not create a Cenbrap-specific workflow. Cenbrap can appear only as existing seed/fixture compatibility data. The product model is any workspace, any brand/profile, with source labels preserved.
</domain>

<decisions>
## Implementation Decisions

### Client-agnostic proof
- Human decision intake targets corpus or derivation evidence scoped by `clientProfileId`, not a named customer.
- The smallest product path is the existing owner human-quality corpus queue: corpus items already carry workspace, campaign, derivation, clientProfile and source label.
- Successful evaluation should create durable calibration evidence that feeds per-brand evidence reports without requiring one-off scripts.

### Evidence honesty
- `synthetic_fixture` rows validate operation only.
- `operator_imported` and `real_customer` must remain separate source states.
- Copy must avoid implying that Cenbrap fixture rows are customer-real proof.

### Deferred
- Manual approve/deprecate rule governance is deferred.
- Uncertainty queue automation is deferred.
- Multi-brand dashboard indexing is deferred.
</decisions>

<specifics>
## Relevant Existing Surface

- `POST /api/feedback/human-quality-corpus/[id]/evaluation` already accepts owner evaluation fields.
- `submitHumanEvaluation` currently writes `human_quality_evaluations` and `human_quality_feedback_artifacts`.
- `recordOutputDecisionEvidence` and `recordCalibrationSignalFromOutputDecisionEvent` already exist but are not wired to generic corpus evaluation.
- `HumanQualityCorpusPanel` already supports global/workspace queue review, source labels and item metadata.
- Per-brand evidence reads from `calibration_signals`, so Phase 168 must bridge generic evaluation into signals.
</specifics>

<deferred>
## Deferred Ideas

- Direct evaluation of arbitrary derivation IDs without selecting/promoting to corpus first.
- New customer import workflow. That belongs to Phase 169.
- Claims gate changes beyond proving the new signals feed existing per-brand evidence.
</deferred>

---

*Phase: 168-client-agnostic-human-decision-intake*
*Context gathered: 2026-06-25*
