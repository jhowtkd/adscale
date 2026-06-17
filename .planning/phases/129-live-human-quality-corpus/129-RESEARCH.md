# Phase 129: Live Human Quality Corpus - Research

**Researched:** 2026-06-17
**Status:** Ready for planning

## Phase Summary

Phase 129 should create a canonical internal corpus for real generated outputs and structured human quality evaluations. It should not calibrate scoring or prove improvement yet; it should make those later phases possible with clean, bounded, versioned data.

## Existing Surfaces

| Surface | Current behavior | Phase 129 use |
|---|---|---|
| `derivations` | Stores generated output metadata, mode, format, status, quality score, hard failures and output asset references | Source output identity and quality snapshot |
| `output_decision_events` | Canonical append-only human decision evidence | Link prior approve/reject/regenerate intent where useful, but do not auto-populate corpus |
| `DerivationReviewSheet` | Existing output review UI with quality panel and actions | Possible selection entry point; not the full evaluation workflow |
| `feedback` owner surfaces | Existing internal owner analytics/session/reports area | Preferred home for the evaluation queue |
| `creative-quality-gate` and taxonomy | Factual and visible quality failure codes | Source for first-class failure reason options |
| v12.4 evidence scripts | Separate quality/factual metrics in release evidence | Pattern for later release-gate evidence, not Phase 129 closure |

## Recommended Architecture

Create a dedicated Postgres-backed corpus module:

- `human_quality_corpus_items` or equivalent table for selected real outputs
- `human_quality_evaluations` or equivalent table for structured reviewer judgments
- version/cohort fields for baseline, pre-learning, and post-learning
- workspace/campaign/client-profile/derivation/mode/format scope
- bounded artifact references and quality snapshot fields
- admin/internal API routes under feedback or owner namespace
- small internal queue UI that reviews one item at a time

Do not use Mem0, beta analytics, or `output_decision_events` as the corpus source of truth. They can be linked or used for context, but the corpus needs its own canonical records.

## Suggested Data Contract

### Corpus Item

- `workspaceId`
- `clientProfileId`
- `campaignId`
- `derivationId`
- `generationMode`
- `format`
- `cohort`: `baseline | pre_learning | post_learning`
- `corpusVersion`
- `artifactRef`: bounded object with stable asset/output identifiers, not signed URLs
- `qualitySnapshot`: current automatic score, verdict, hard failures, score issues
- `selectedByUserId`
- `selectedAt`
- `status`: `pending | evaluated | removed`

### Human Evaluation

- `corpusItemId`
- `reviewerUserId`
- `visualScore`: integer 0-100
- `factualPass`: boolean
- `intent`: `approve | reject | regenerate`
- `primaryFailureReason`: closed enum plus `other`
- `otherReasonText`: bounded nullable text
- `notes`: bounded nullable text
- `createdAt`

## Failure Reason Seed List

Use canonical, aggregatable codes:

- `visual_overload`
- `weak_hierarchy`
- `generic_template_feel`
- `illegible_cta`
- `unfocused_composition`
- `factual_issue`
- `format_or_crop_issue`
- `other`

## Implementation Notes

- Selection should be explicit/manual.
- Evaluation queue should live in the owner/feedback/internal area.
- First reviewer role is admin/technical; no external reviewer workflow in this phase.
- Keep evaluation one item at a time; do not build comparison UI yet.
- Validate workspace membership and owner/admin access before corpus writes.
- Preserve privacy boundaries: no raw prompt, signed URL, model response, image bytes, auth/session material, or unbounded diagnostics.

## Validation Architecture

### Automated Tests

- Unit tests for corpus item/evaluation enums and validation helpers.
- Repository tests for insert/list/evaluate behavior and workspace isolation.
- API route tests for selecting a derivation into the corpus and submitting evaluation.
- Component tests for one-at-a-time internal evaluation queue and required fields.
- Regression tests proving raw prompt/signed URL/model response fields are rejected or stripped.

### Commands

- Focused quick suite:
  `cd app && npm test -- tests/unit/human-quality app/src/app/api/feedback/human-quality-corpus app/src/components/feedback`
- Full phase gate:
  `cd app && npm test && npm run lint && npm run build`

### Manual Verification

No production/browser human gate is required to plan Phase 129. Browser UAT can be added during execution if the UI path becomes substantial, but automated component/route tests should cover the phase contract.

## Risks

| Risk | Mitigation |
|---|---|
| Corpus becomes a dumping ground | Explicit/manual selection only |
| Evaluation form becomes too heavy | Required short form plus optional notes |
| Factual and visual metrics get mixed | Store visual score and factual pass/fail separately |
| Privacy leakage through asset URLs/prompts | Bounded references and forbidden-field tests |
| Phase creep into calibration/impact | Leave calibration to Phase 130 and impact to Phase 131 |

## Planning Recommendation

Use three plans:

1. Canonical corpus contract, schema, repository and pure validation helpers.
2. Internal API routes for selecting corpus items, listing pending queue, and submitting evaluation.
3. Owner/feedback UI for one-at-a-time evaluation plus verification and docs update.

