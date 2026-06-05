# Stack Research: v11.5 Qualidade IA Orientada por Feedback

**Date:** 2026-06-05
**Milestone:** v11.5 Qualidade IA Orientada por Feedback

## Existing Stack To Reuse

- Next.js App Router, TypeScript, Drizzle and Inngest remain the execution backbone.
- OpenAI text model is used for scoring, QA, diagnosis and plan generation through Responses/Chat APIs.
- OpenAI image generation/editing runs through `openai.images.generate` and `openai.images.edit` in `app/src/server/jobs/derivation.ts`.
- Existing quality primitives:
  - `app/src/server/ai/prompt-builder.ts`
  - `app/src/server/ai/creative-score.ts`
  - `app/src/server/ai/creative-qa.ts`
  - `app/src/server/ai/creative-quality-gate.ts`
  - `app/src/lib/derivation-regeneration-feedback.ts`
  - feedback reports in `feedback_reports`

## Official API Notes Relevant To Quality

- OpenAI image docs identify persistent limitations around text rendering, visual consistency across generations, and precise composition/layout control.
- The image API exposes output size, quality, format, compression and background options; ADScale already maps target formats through `app/src/lib/formats.ts`.
- The Responses image generation tool can expose a revised prompt, and the Image API can return `revised_prompt` in some flows. ADScale currently stores `inputPrompt` and `prompt`/revised prompt fields, but the quality loop should make prompt provenance easier to compare.
- Structured Outputs support JSON schema subsets and are better suited than loose JSON mode when the application needs stable scoring/QA shapes.

## Recommended Stack Additions

- No new provider or model migration in this milestone.
- Add internal quality fixture files for representative failure modes:
  - wrong CTA
  - cropped/hidden logo or text
  - style-reference factual contamination
  - format adaptation that looks like a padded/cropped poster
  - weak preservation of product/offer
  - low legibility
- Add contract snapshot tests for prompt-builder outputs by generation mode.
- Add stable schema validation for score/QA outputs with Zod or existing typed normalizers.
- Add a lightweight quality-debug view or report section only if needed to inspect prompt, contract, score, QA, and regeneration suggestion together.

## What Not To Add

- Do not switch image models as the primary fix.
- Do not create an autonomous agent loop that spends credits repeatedly without user control.
- Do not make QA block every export; keep blocking reserved for hard failures.
- Do not store raw private creative assets in test fixtures unless sanitized/synthetic.

## Sources

- OpenAI Image generation docs: image model options, revised prompt, limitations around text rendering/consistency/composition.
- OpenAI Structured Outputs docs: stable JSON/schema-driven model outputs.
- ADScale repo inspection on 2026-06-05.
