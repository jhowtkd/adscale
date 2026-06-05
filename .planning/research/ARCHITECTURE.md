# Architecture Research: v11.5 Qualidade IA Orientada por Feedback

**Date:** 2026-06-05
**Milestone:** v11.5 Qualidade IA Orientada por Feedback

## Current Architecture

Generation flow:

1. User queues derivation.
2. `app/src/server/jobs/derivation.ts` fetches campaign, plan, asset, parent derivation, brand kit, competitors, client references and brand memory.
3. `buildDerivationPrompt` creates the image prompt.
4. OpenAI image generation/editing runs.
5. Output is normalized and uploaded to R2.
6. Heuristic score is saved, then visual scoring runs.
7. Quality gate runs QA and classifies hard failures/polish suggestions.
8. Regeneration uses stored suggestion/hard failures when available.

## Integration Points

- `prompt-builder.ts`: contract/prompt source of truth.
- `creative-contract.ts`: CTA and mode contract semantics.
- `creative-score.ts`: score dimensions and regeneration suggestion builder.
- `creative-qa.ts`: visual QA checklist and normalized issues/suggestions.
- `creative-quality-gate.ts`: hard failure classification and export/approval blocking.
- `derivation.ts`: stores input prompt/revised prompt/output and orchestrates scoring/gate.
- `feedback_reports`: can provide real beta context, but must be sanitized and categorized before influencing regeneration.

## Build Order

1. Align contract vocabulary and prompt snapshots before touching scoring.
2. Align score/QA schemas and hard failure taxonomy.
3. Feed score/QA/hard failure/feedback context into regeneration in a controlled way.
4. Add fixtures and verification to prevent regressions.

## New Versus Modified

### New

- Quality fixture directory with sanitized/synthetic cases.
- Prompt contract snapshot tests for each generation mode.
- Quality regression tests for scoring/QA normalization and hard failure mapping.
- Optional owner-facing quality debug document or internal view.

### Modified

- `prompt-builder.ts` for clearer mode-specific contract sections.
- `creative-score.ts` and `creative-qa.ts` to produce consistent, schema-validated quality outputs.
- `creative-quality-gate.ts` to ensure hard failures map to actionable regeneration suggestions.
- `regenerate` route and regeneration feedback builder to include QA and feedback context without accepting unsafe prompt injection.

## Security and Cost Shape

- Feedback context must be treated as user input, never as trusted system instruction.
- Regeneration remains user-triggered and spend-gated.
- Fixtures must avoid real customer assets unless explicitly sanitized and approved.
