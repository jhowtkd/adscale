# Studio Carousel Rollout & Rollback Runbook (Task 10)

## Gate

`STUDIO_CAROUSEL_ROLLOUT_PERCENT` (0–100, default `0`, `z.coerce.number().int()`)
gates ONLY new carousel creation. Both the web and the worker service receive
the value, but only the authenticated dashboard page consumes it — it derives
`isStudioCarouselEnabled(workspaceId, percent)` from the SAME deterministic
`studioRolloutBucket(workspaceId)` used by `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`
so both rollout percentages move workspaces together. The raw percentage never
reaches the browser.

## Stages

1. **Keep `0` until both proofs exist**
   - Automated proof: the Task 10 controlled-provider E2E
     (`tests/e2e/creative-work-carousel.spec.ts`, project `serial-flows`) plus
     the full Task 10 unit pass (see plan Step 8).
   - Human proof: the nine-deck gate (`docs/evidence/carousel-human-gate.template.json`)
     completed by a human reviewer and validated with
     `npx tsx scripts/check-carousel-human-gate.ts <evidence-file>`.
   The nine-deck batch itself needs a separate paid-generation authorization.
   **2026-08-31:** product owner waived the nine-deck human gate and left
   `STUDIO_CAROUSEL_ROLLOUT_PERCENT` at `0`. The template stays
   `pending_human_review`; this is not a validator PASS.
2. **Internal**: raise to a small percentage in the Render dashboard (not in
   `render.yaml` defaults) after both gates PASS. Watch carousel funnel
   telemetry (`briefing_ready → generation_confirmed → output_ready →
   creative_work_reviewed → creative_work_approved`) and the operational logs
   carrying the safe carousel fields (slideCount, inputKind,
   blockingQuestionCount, anchorState, failedSlideCount, manualRetryCount,
   deckRevisionCount).
3. **Restricted → expanded**: raise in separate deploy-controlled steps. Each
   step keeps the deterministic bucket: workspaces already included stay
   included; raising the percentage only ever ADDS workspaces.

## What the gate hides at 0

Only the NEW carousel selection card on the dashboard (`Criar carrossel` in
`CreativeToolCards`). Existing carousel works remain fully functional at any
percentage value: resume (`/?workId=…`), detail (`/api/creative-work/:id`),
retry, revision, deck approval and ZIP export all keep working when the value
returns to `0`.

## Rollback

Set `STUDIO_CAROUSEL_ROLLOUT_PERCENT=0` (Render env, web **and** worker) and
redeploy. Effect:

- New creation stops immediately for every workspace.
- Existing works stay readable, retryable, revisable, approvable and
  exportable. In-flight generation chains finish; slides already queued keep
  processing.

## Immediate rollback conditions (raise no questions — roll back first)

Roll back to `0` and investigate when ANY of these is observed:

- wrong slide order in a deck or in an exported ZIP;
- stale snapshot used by a slide (visual contract hash mismatch, `contract_mismatch`);
- duplicate credit charge for one slide or one deck;
- a slide rendered for another workspace (cross-workspace leak);
- approved copy mismatch between the deck review and the exported PNG/manifest;
- a missing approved position in the manifest (`missing_position`,
  `non_contiguous`, `deck_not_ready`);
- an overwritten older slide version (version numbers/lineage regression).

## Verification after rollback

1. Dashboard at a previously included workspace shows no `Criar carrossel` card.
2. Open an existing carousel work: sequence board, review, approval state and
   ZIP export all still work.
3. Funnel telemetry records no new `creative_work_started` for carousel.

## Human-gate artifacts (do not fabricate)

- `docs/evidence/carousel-human-gate.template.json` — validator input only.
- The validator (`app/scripts/check-carousel-human-gate.ts`) is code, not
  evidence. Verdicts are human review artifacts; provider ids and cost for the
  nine-deck batch are recorded separately from automated results.
