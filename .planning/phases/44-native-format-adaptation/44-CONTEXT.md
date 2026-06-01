# Phase 44: Native Format Adaptation - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase fixes **Variar tamanho** so format adaptation produces real target-format ad layouts for 4:5 and 9:16 instead of resizing a square poster into a new canvas.

The phase delivers:
- Native 9:16 and 4:5 layout behavior for existing format adaptation.
- Prompt and generation-size constraints that push the image model toward target-format reconstruction.
- Post-processing that preserves final dimensions without blurred bars, letterboxing, stretched filler, or centered-poster composition.
- Focused automated tests and at least one real visual check for 4:5 and 9:16.

This phase does **not** deliver the full creative-contract/QA system. Invalid-output blocking, scoring, regeneration reasons, and UI surfacing are refined in Phases 45-47, but Phase 44 must already define what a visually invalid format adaptation looks like.

</domain>

<decisions>
## Implementation Decisions

### Hard Visual Failures
- Treat any blurred side/top/bottom band, letterbox, stretched edge filler, pasted center poster, or visible "square creative placed on a background" as a hard failure for format adaptation.
- Treat crowded clusters as hard failures: headline, photo/subject, CTA, logo, offer/proof, and badges cannot be glued together with no breathing room, even if the text remains technically readable.
- A format adaptation should look purpose-built for the target placement, not like the original image was resized and framed.

### Preservation Priority
- Preserve factual/critical content above all else: headline, CTA, logo, offer/proof, product/service visual, faces or bodies when relevant, badges, legal copy, and any required visible source information.
- Decorative background, texture, abstract shapes, and non-informational edge areas may be extended, rearranged, cropped, or simplified to make the target layout work.
- Do not solve fit problems by dropping factual modules. Rebalance hierarchy, spacing, module size, and background area first.

### 9:16 Story/Reels Layout
- Prefer clear vertical zones: top zone for headline or brand hook, middle zone for the main photo/subject/product, lower zone for offer/proof/CTA/logo.
- The vertical output must use the tall canvas intentionally. It should not keep the square composition squeezed in the center.
- Only decorative background may bleed to the edges; important text, CTA, logo, product, and faces stay in safe central areas.

### 4:5 Feed Layout
- Prefer a portrait-feed layout with more vertical breathing room than the source 1:1.
- Keep the visual hierarchy ad-like and scannable: prominent subject/product, separated text/proof modules, and CTA/logo in a clean area.
- Avoid "almost square with filler" behavior. 4:5 should feel like a native feed creative, not a minimal resize.

### Final Dimension Normalization
- Final normalization may crop or expand decorative/non-informational background to reach exact target dimensions.
- It must not crop text, CTA, logo, product, faces, badges, offer/proof modules, or legal copy.
- If final resizing would make critical information unsafe, the output should be considered invalid rather than silently accepted as a finished creative.

### Failure Handling Expectation
- If the model still returns a poster-like or crowded output, do not treat it as a ready creative.
- The intended behavior is reject/regenerate or carry a clear invalid-output reason forward. Phase 44 can record the failure evidence if full blocking/regeneration plumbing belongs to Phase 46.

### Visual Evidence
- Phase 44 is not complete on tests alone.
- Verification must include real generated 4:5 and 9:16 samples from a campaign asset, presented as visual evidence or a contact sheet.
- Acceptance requires both samples to look like native target layouts. If the model cannot produce acceptable samples after the implemented constraints, document the concrete failure evidence for the quality-gate phase.

### Claude's Discretion
- Exact prompt wording and whether the 9:16/4:5 layout guidance lives in shared helpers or directly inside `buildDerivationPrompt`.
- Whether focused tests assert exact phrases or semantic prompt sections, as long as they fail when native-layout guidance is removed.
- Whether local visual evidence is stored as a contact sheet, screenshots, or linked generated outputs.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/ai/prompt-builder.ts` builds mode-specific derivation prompts and already branches on `generationMode === "format_adaptation"`.
- `app/src/server/jobs/derivation.ts` owns image generation/edit calls, OpenAI target size selection, and `normalizeGeneratedImage`.
- `app/src/lib/formats.ts` defines supported formats, final dimensions, and OpenAI size mapping. 4:5 and 9:16 both currently map to portrait model size `1024x1536`; final dimensions are `1080x1350` and `1080x1920`.
- `app/src/components/workspace/FormatAdaptationConfigModal.tsx` already collects single or batch target formats before generation.
- `app/src/server/ai/smart-resize.ts` can analyze crops/safe zones, but it is currently a preview/analysis helper, not the main format-adaptation generation path.

### Established Patterns
- Format adaptation jobs are created from campaign `targetFormats` in `app/src/app/api/campaigns/[id]/derivations/route.ts`.
- The derivation job first attempts OpenAI image edit with the campaign or parent output image as reference, then falls back to image generation for format adaptation if edit fails.
- Existing tests cover prompt content and sharp normalization behavior in `app/src/server/ai/prompt-builder.test.ts`, `app/tests/unit/prompt-builder.test.ts`, and `app/src/server/jobs/derivation.test.ts`.
- Previous v11.0 phases established that the format picker is configuration-only until the user confirms; Phase 44 should not change the Derivar modal flow unless needed for this quality fix.

### Integration Points
- Prompt changes connect through `buildDerivationPrompt` and should be visible in stored `inputPrompt`.
- Size and normalization changes connect through `formatToOpenAISize`, `getTargetDimensions`, and `normalizeGeneratedImage`.
- Visual UAT should use the campaign workspace or stored derivation outputs so the evidence reflects the real user path, not an isolated mock.

</code_context>

<specifics>
## Specific Ideas

- The original user complaint was that **Variar tamanho** produced "faixas" and left elements stuck together. This is the primary failure to eliminate.
- Good 9:16: a tall native story layout with distinct top/middle/bottom zones and no square poster sitting in the middle.
- Good 4:5: a portrait feed ad with clean spacing and separated modules, not a stretched or padded square.
- Bad output examples to reject: blurred side bars, blurred top/bottom bars, original creative pasted over a background, CTA/logo/text touching other modules, and any critical element cut by the final crop.

</specifics>

<deferred>
## Deferred Ideas

- Full hard-failure classification, score gating, and invalid-output UI badges belong to Phase 46 and Phase 47.
- Platform-specific safe-area overlays for Meta/TikTok/Google are future review UX work already tracked outside this phase.
- Multi-turn image repair loops are future image repair scope, not required for Phase 44.

</deferred>

---

*Phase: 44-native-format-adaptation*
*Context gathered: 2026-06-01*
