# Phase 44: Native Format Adaptation - Research

**Researched:** 2026-06-01
**Phase:** 44 — Native Format Adaptation
**Question:** What do we need to know to plan `Variar tamanho` so it produces native 4:5/9:16 ad layouts instead of resized square posters?

## Summary

Phase 44 should harden the existing format-adaptation pipeline rather than add a new mode. The current code already has the right main integration points:

- `buildDerivationPrompt` has a `format_adaptation` branch.
- `derivationJob` sends image edit/generate requests and normalizes final output dimensions.
- `formatToOpenAISize` and `getTargetDimensions` centralize target format sizing.
- Tests already cover prompt content, derivation job behavior, and sharp normalization.

The remaining planning risk is that correct final dimensions do not guarantee native layout. The model should be asked for a target-aspect output as close as possible to 4:5 or 9:16 before sharp runs. Sharp should then only normalize dimensions and never create blurred bands, letterboxing, stretched edge filler, or a pasted-poster treatment for format adaptation.

## Current Implementation Findings

### Prompt Builder

`app/src/server/ai/prompt-builder.ts` already distinguishes `format_adaptation` from art variation and restyling. The existing branch includes rules for:

- native layout reconstruction rather than resized poster behavior,
- no blurred side/top/bottom bars,
- no crowded cluster,
- clear zones, gutters, whitespace, and safe areas,
- specific 9:16 and 4:5 guidance.

The plan should keep this branch focused on layout adaptation. It should not mix in creative-level exploration or restyling facts.

### Generation Job

`app/src/server/jobs/derivation.ts`:

- resolves `effectiveGenerationMode`, `targetFormat`, and CTA,
- downloads the campaign or parent image,
- calls OpenAI image edit first and falls back to generation for format adaptation,
- calls `formatToOpenAISize(targetFormat, isPreview)`,
- then calls `normalizeGeneratedImage(buffer, dimensions, effectiveGenerationMode)`.

For format adaptation, `normalizeGeneratedImage` currently uses `sharp(...).resize(..., { fit: "cover", position: "attention" })` and avoids blur/composite/contain. That matches the phase decision: no decorative blurred padding.

### Format Sizing

`app/src/lib/formats.ts` currently maps both `4:5` and `9:16` to `1024x1536`, then normalizes to final dimensions:

- `4:5` final: `1080x1350`
- `9:16` final: `1080x1920`

This is better than square generation, but it still asks the model for a 2:3 portrait when the desired aspect is 4:5 or 9:16. The plan should create a model-size helper that can use exact or near-exact target-aspect sizes for `gpt-image-2` when the configured model supports flexible sizes:

- `1:1`: `1024x1024`
- `4:5`: `1024x1280`
- `9:16`: `1152x2048`

If the local OpenAI SDK type is narrower than the current model capability, keep the unsafe part isolated in one helper with tests and comments. If the API rejects a custom size at runtime, the fallback must be explicit and logged; the code must not silently produce a square/letterboxed output and mark it good.

### Preview Mode

`formatToOpenAISize(..., isPreview)` currently returns `1024x1024` for preview. For format adaptation, preview mode should not force square output because that reintroduces the exact failure mode: square poster first, target canvas later.

Plan Phase 44 to make preview sizing target-aspect aware for format adaptation, even if it keeps lower quality or the same output size.

### Tests

Existing relevant tests:

- `app/src/server/ai/prompt-builder.test.ts`
- `app/tests/unit/prompt-builder.test.ts`
- `app/src/server/jobs/derivation.test.ts`
- `app/tests/integration/derivation-job.test.ts`
- `app/src/components/workspace/FormatAdaptationConfigModal.test.tsx`

Missing tests to plan:

- format sizing helper returns target-aspect sizes for `gpt-image-2`,
- non-`gpt-image-2` or unsupported model behavior remains explicit and safe,
- format-adaptation preview does not use square size,
- OpenAI edit/generate request receives the expected target-aspect size,
- normalization for format adaptation never calls `blur`, `composite`, or `contain`.

## External API Notes

Official OpenAI Image documentation says the Image API supports generation and edit endpoints for GPT Image models, and the guide positions the Image API as the right choice for a single image edit/generation prompt. The same guide says output customization includes size. The local package is `openai@6.34.0`, whose TypeScript definitions still expose a conservative `size` union for image edit/generate calls.

Planning implication: implement target-aspect sizing behind one helper, test it locally, and avoid spreading OpenAI SDK casts through the job. Use the configured model (`OPENAI_IMAGE_MODEL`, currently `gpt-image-2` locally) to decide whether flexible target sizes are allowed.

## Validation Architecture

Phase 44 should validate at three levels:

1. **Contract/unit validation**
   - Prompt includes native-layout rules, 9:16 vertical zones, 4:5 feed spacing, anti-band rules, anti-crowding rules, and preservation rules.
   - Format size helper returns target-aspect generation sizes for 4:5 and 9:16 when model support allows it.
   - Normalization for format adaptation uses no blur/composite/contain path.

2. **Integration validation**
   - Derivation job passes the target-aspect size into OpenAI edit/generate calls for `format_adaptation`.
   - Preview mode does not force square generation for format adaptation.
   - Existing derivation route behavior still creates the right number of jobs for selected `targetFormats`.

3. **Visual/UAT validation**
   - Generate or collect real 4:5 and 9:16 outputs from a campaign asset.
   - Create a visual evidence artifact or contact sheet.
   - Mark the phase accepted only if both outputs look native: no bands, no pasted square poster, no crowded modules, and critical source information inside safe areas.
   - If the model still fails, record concrete evidence and carry it into Phase 46 quality gating rather than calling the output ready.

## Risks

- **SDK/docs mismatch:** the configured model may support flexible image sizes before the local SDK types expose them. Keep model-size typing isolated.
- **Correct aspect, bad layout:** target-aspect size alone will not prevent crowding; prompt tests and visual UAT are still required.
- **Preview regression:** forcing preview to square can hide the problem during review; preview must be target-aware for this mode.
- **False confidence from tests:** unit tests can prove no blur-fill path exists, but only real output review can prove the model followed native layout instructions.

## Sources

- OpenAI Image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI local SDK types: `app/node_modules/openai/resources/images.d.ts`
- Local code: `app/src/lib/formats.ts`, `app/src/server/jobs/derivation.ts`, `app/src/server/ai/prompt-builder.ts`
- Phase context: `.planning/phases/44-native-format-adaptation/44-CONTEXT.md`

---

*Research complete: 2026-06-01*
