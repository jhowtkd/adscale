# Phase 129: Live Human Quality Corpus - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 129 creates the internal live human-quality corpus foundation for real generated outputs. It lets selected outputs become versioned corpus items and gives a technical/admin reviewer a structured one-at-a-time evaluation workflow.

This phase does not calibrate automatic scoring, measure learning impact, change prompt/gate/rubric behavior, or define the final release gate. Those are Phases 130-133.

</domain>

<decisions>
## Implementation Decisions

### Corpus Entry Flow
- Corpus inclusion is explicit, not automatic. Outputs enter the corpus only when manually selected for evaluation.
- The first implementation should favor owner/feedback/admin surfaces over placing the full corpus workflow in the campaign review path.
- The operator/admin should get a discrete confirmation when an output is added to the corpus, but Phase 129 does not need a broad dashboard trend view.
- The corpus queue should contain manually selected outputs, not every recent derivation and not every strong signal from `output_decision_events`.

### Review Queue Surface
- The evaluation queue belongs in the owner/feedback area or an equivalent internal owner surface.
- Review happens in batch, one corpus item at a time.
- Phase 129 is an internal technical/admin workflow. Only admin/technical reviewer access is required for filling the human evaluation.
- Workspace members or external reviewers are deferred until the process is proven.

### Human Evaluation Form
- Human visual score uses a 0-100 scale so Phase 130 can compare it directly against existing `qualityScore`.
- Factual judgment is stored separately as pass/fail. It must not be blended into the visual score.
- Human intent should capture the real output decision shape: approve, reject, or regenerate.
- Primary visible failure reason should use a closed list plus "other", not free text only.
- Required first-class failure reasons include: visual overload, weak hierarchy, generic template feel, illegible CTA, and unfocused composition.

### Corpus Versioning Defaults
- Corpus items should be versioned and preserve enough metadata for later baseline/pre-learning/post-learning comparisons.
- Use conservative cohorts by default: baseline, pre-learning, and post-learning.
- Comparable slices should be scoped by workspace/client profile/campaign context, generation mode, and output format.
- Phase 129 should store enough structure for later measurement, but should not claim improvement or calibration yet.

### Privacy and Payload Boundary
- Store bounded artifact references and evaluation metadata only.
- Do not store raw prompts, signed URLs, auth/session material, image bytes, full model responses, or unbounded diagnostic payloads.
- Reuse the v12.4 pattern where Postgres is the canonical source of truth and memory/analytics are projections at most.

### Claude's Discretion
- Exact table names, route names, component names, and repository helper names.
- Whether the internal queue is implemented as a new owner panel, a feedback subpanel, or a minimal admin-only page.
- Exact wording of the failure reason labels, as long as the canonical codes remain aggregatable.
- Whether corpus selection is exposed first from review sheet, owner tooling, or a small action on existing derivation cards, provided full evaluation stays in the internal queue.

</decisions>

<specifics>
## Specific Ideas

- The corpus is for proving real quality movement, not for collecting every output.
- The first reviewer persona is internal/admin/technical, not the end customer.
- The evaluation form should be short enough to fill repeatedly: visual score, factual pass/fail, approve/reject/regenerate intent, primary visible failure reason, and optional notes.
- The admin queue should support careful visual judgment one item at a time rather than fast grid scoring.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/components/workspace/DerivationReviewSheet.tsx`: existing output review surface with quality score, verdict, hard failures, approve/reject/regenerate actions.
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx`: campaign workspace already wires review and regeneration flows.
- `app/src/components/feedback/*`: owner/feedback area is the likely home for internal evaluation surfaces.
- `app/src/server/output-learning/output-decision-events.ts`: existing bounded snapshot and privacy pattern for output evidence.
- `app/src/server/output-learning/output-decision-recorder.ts`: existing best-effort canonical evidence recorder pattern.
- `app/src/server/ai/creative-quality-gate.ts`: existing factual/visual hard-failure codes and gate semantics.
- `app/src/server/ai/creative-quality-taxonomy.ts`: existing quality dimensions and regex-backed visible-failure taxonomy.

### Established Patterns
- Canonical learning/evidence data should live in Postgres; Mem0 and analytics are not sources of truth.
- Quality and factual metrics must stay separate.
- Workspace/entity ownership checks are mandatory before writing records tied to campaigns or derivations.
- Bounded snapshots should avoid prompts, signed URLs, image payloads, auth material, and large model diagnostics.
- Internal owner surfaces already exist and are preferable for operational/evaluation tooling.

### Integration Points
- Derivation records for source output metadata and quality fields.
- Existing output-decision events for linking human review intent where useful.
- Feedback/owner UI for the one-at-a-time evaluation queue.
- Future Phase 130 calibration will compare human visual score against existing automatic `qualityScore`.
- Future Phase 131 impact measurement will use cohort/version metadata and whether output-learning recommendation/prefill was applied.

</code_context>

<deferred>
## Deferred Ideas

- Score calibration and rubric/gate changes — Phase 130.
- Learning impact reports for learned vs non-learned outputs — Phase 131.
- Prompt/gate/rubric improvements targeting proven visual failure reasons — Phase 132.
- Final real-quality release gate and milestone closure thresholds — Phase 133.
- Workspace-member or external-reviewer evaluation roles — future live rollout.
- Owner dashboard trend lines for human quality score over time — future live rollout.
- Media performance blending with human output quality — future `PERFOUT-*`.

</deferred>

---

*Phase: 129-live-human-quality-corpus*
*Context gathered: 2026-06-17*
