# Phase 134: Live Corpus Operations - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Source:** v12.6 milestone scope plus live repo inspection

<domain>
## Phase Boundary

Phase 134 operationalizes the existing v12.5 human-quality corpus infrastructure. It must let platform owners select controlled batches of real generated outputs, track pending review progress, and complete structured evaluations faster, while preserving the privacy boundary already established in `app/src/server/human-quality/corpus.ts`.

This phase does not define sample sufficiency math, trend dashboards, or the final operational release gate. Those are Phases 135-137.

</domain>

<decisions>
## Implementation Decisions

### Reuse Existing Corpus Foundation
- Keep Postgres corpus tables and `app/src/server/human-quality/service.ts` as the source of truth.
- Reuse `/api/feedback/human-quality-corpus` rather than creating a new owner API surface unless the current route cannot express batch/progress needs cleanly.
- Keep evaluation in `HumanQualityCorpusPanel`; campaign review surfaces may enqueue items, but should not become the evaluation workflow.

### Operation Model
- Treat selection as controlled operator batches, not automatic inclusion of every generated output.
- Queue progress must show dimensions needed for later reports: workspace, campaign, generation mode, format, cohort and reviewer/evaluation status.
- Reviewer flow should optimize repeated evaluation work without weakening required fields: visual score, factual pass/fail, intent and primary failure reason.

### Privacy and Safety
- Do not persist raw prompts, signed URLs, image bytes, output keys, auth material, model responses or unbounded payloads.
- Preview URLs may be resolved ephemerally at queue read time only.
- Any new batch endpoint or helper must reuse `validatePrivacySafePayload` / `sanitizeCorpusPayloads` style checks.

### Verification
- Start with focused tests for repository/service/API/UI behavior.
- Build must remain the decisive Next.js route-module check.

</decisions>

<specifics>
## Specific Ideas

- Add an operator-facing batch/progress summary for pending/evaluated corpus items by status, cohort, generation mode and format.
- Add controlled batch selection helpers that can accept multiple derivation IDs while reporting per-item outcomes: selected, duplicate, invalid, unsafe payload, missing client profile.
- Improve the queue UI for repeated review with visible progress, current item position, compact metadata and quick advance after submit.
- Preserve duplicate handling by `(workspace_id, derivation_id, corpus_version)`.

</specifics>

<deferred>
## Deferred Ideas

- Sample thresholds and next-sample guidance belong to Phase 135.
- Trend charts and owner dashboard history belong to Phase 136.
- Rerunning aggregate CLIs and release audit closure belongs to Phase 137.
- Multi-reviewer agreement and external reviewer permissions remain future scope.

</deferred>

---

*Phase: 134-live-corpus-operations*
*Context gathered: 2026-06-17 via plan-phase*
