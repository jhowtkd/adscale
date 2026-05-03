# Restyling Style Transfer — Design Document

## Problem

The current restyling pipeline uses `openai.images.edit()` with two images (base + style_reference). The API interprets the style reference as **content to be incorporated** into the base image, resulting in a crude collage — the reference image is pasted on top of the base layout instead of having its visual style extracted and applied.

**Example:**
- Base image: UCDB Agronomy ad (professional layout with model, CTA, offer)
- Reference image: Ronaldo poster (grunge collage style with textured typography)
- Current result: The Ronaldo image is overlaid on the UCDB ad layout
- Desired result: A UCDB ad **reimagined** through the grunge/collage aesthetic of the Ronaldo poster

## Goal

Replace the collage-style restyling with a true style-transfer pipeline that:
1. Analyzes the base image to extract **content** (offer, CTA, brand, subject)
2. Analyzes the reference image to extract **style** (palette, typography, textures, mood)
3. Generates a completely new image from scratch using `images.generate()` with a unified prompt

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────────┐
│  Base Image     │────▶│  GPT-4o/gpt-5 Vision        │────▶│  Content Brief  │
│  (advertising)  │     │  • detail: "high"           │     │  (structured)   │
└─────────────────┘     └─────────────────────────────┘     └─────────────────┘
                                                                   │
┌─────────────────┐     ┌─────────────────────────────┐     ┌─────────────────┐
│  Reference Image│────▶│  GPT-4o/gpt-5 Vision        │────▶│  Style Brief    │
│  (style source) │     │  • detail: "high"           │     │  (structured)   │
└─────────────────┘     └─────────────────────────────┘     └─────────────────┘
                                                                   │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  Unified Prompt  │
                                                          │  (content+style) │
                                                          └─────────────────┘
                                                                   │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  images.generate│
                                                          │  (gpt-image-2)  │
                                                          └─────────────────┘
                                                                   │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  Restyled Ad     │
                                                          │  (from scratch)  │
                                                          └─────────────────┘
```

## Key Changes

### 1. Replace `images.edit` with `images.generate`

**Current:**
```typescript
openai.images.edit({
  model: env.OPENAI_IMAGE_MODEL,
  image: [baseFile, styleFile], // SDK accepts array for two images
  prompt,
  n: 1,
  size: openaiSize,
});
```

**New:**
```typescript
// Step 1 & 2: Vision analysis (parallel)
const [contentBrief, styleBrief] = await Promise.all([
  analyzeImageContent(baseBuffer, baseAsset.type),
  analyzeImageStyle(styleBuffer, styleAsset.type),
]);

// Step 3: Generate from scratch
const prompt = buildRestylingPrompt(contentBrief, styleBrief, campaign, ctaText, locale);

openai.images.generate({
  model: env.OPENAI_IMAGE_MODEL,
  prompt,
  n: 1,
  size: openaiSize,
});
```

### 2. Vision Analysis Functions

Two new functions in `server/ai/prompt-builder.ts` (or a new file `server/ai/image-analysis.ts`):

#### `analyzeImageContent(imageBuffer, mimeType)`
Uses GPT-4o/gpt-5 vision via Chat Completions or Responses API with `detail: "high"`.

**System prompt:**
```
You are an advertising image analyst. Extract structured content from the provided ad image.
Return ONLY a JSON object with no markdown formatting.
```

**Expected output structure:**
```json
{
  "product": "string",
  "offer": "string",
  "cta": { "text": "string", "style": "string" },
  "brandElements": ["string"],
  "keyVisual": "string",
  "textContent": { "headline": "string", "bullets": ["string"] },
  "format": "string"
}
```

#### `analyzeImageStyle(imageBuffer, mimeType)`
Uses GPT-4o/gpt-5 vision via Chat Completions or Responses API with `detail: "high"`.

**System prompt:**
```
You are a visual style analyst. Analyze the provided image as a STYLE SOURCE ONLY.
Extract visual language elements: color palette, typography personality, textures, composition style, mood, decorative elements, and photo treatment.
Do NOT describe the subject matter or content — only the visual style.
Return ONLY a JSON object with no markdown formatting.
```

**Expected output structure:**
```json
{
  "colorPalette": { "dominant": ["string"], "accents": ["string"], "gradients": "string" },
  "typography": { "personality": "string", "effects": ["string"] },
  "textures": ["string"],
  "composition": "string",
  "mood": "string",
  "decorativeElements": ["string"],
  "photoTreatment": "string"
}
```

### 3. Unified Prompt Builder

A new function `buildRestylingPrompt(contentBrief, styleBrief, campaign, ctaText, locale)` that assembles:

```
Create a professional advertising image for [campaign.product] with this offer: [contentBrief.offer].

CONTENT TO INCLUDE (from original ad):
- Main subject: [contentBrief.keyVisual]
- Headline: [contentBrief.textContent.headline]
- Offer/CTA: [ctaText || contentBrief.cta.text]
- Brand: [contentBrief.brandElements.join(", ")]
- Supporting copy: [contentBrief.textContent.bullets.join(" | ")]

VISUAL STYLE TO APPLY (from reference):
- Color palette: [styleBrief.colorPalette.dominant.join(", ")] with accents [styleBrief.colorPalette.accents.join(", ")]
- Typography: [styleBrief.typography.personality] ([styleBrief.typography.effects.join(", ")])
- Textures: [styleBrief.textures.join(", ")]
- Composition: [styleBrief.composition]
- Mood: [styleBrief.mood]
- Decorative elements: [styleBrief.decorativeElements.join(", ")]
- Photo treatment: [styleBrief.photoTreatment]

CRITICAL RULES:
- Do NOT copy content from the style reference. Use ONLY its visual language.
- Reimagine the ad concept through the lens of this aesthetic.
- The result should feel like an original ad, not a collage or pasted overlay.
- Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or borders.
- Keep all text in [locale language].
- Output format: [targetFormat]
```

### 4. Fallback Strategy

If either vision analysis fails (network error, malformed response, timeout), the pipeline falls back to the current prompt-based restyling without the structured briefs. This ensures the feature never completely breaks.

```typescript
try {
  const [contentBrief, styleBrief] = await Promise.all([
    analyzeImageContent(...),
    analyzeImageStyle(...),
  ]);
  prompt = buildRestylingPrompt(contentBrief, styleBrief, ...);
} catch {
  // Fallback: use legacy prompt (current behavior without vision analysis)
  prompt = buildDerivationPrompt({ generationMode: "restyling", ... });
}
```

## API Usage & Cost

| Step | API | Model | Input | Approx. Cost |
|------|-----|-------|-------|-------------|
| Content analysis | Chat Completions or Responses | gpt-4o / gpt-5 | 1 image (1080x1080) base64 + prompt | ~$0.01–0.02 |
| Style analysis | Chat Completions or Responses | gpt-4o / gpt-5 | 1 image (1080x1080) base64 + prompt | ~$0.01–0.02 |
| Image generation | Images API | gpt-image-2 | Text prompt only | ~$0.02–0.04 |
| **Total per restyling** | | | | **~$0.04–0.08** |

Compared to the current `images.edit` call (which also uses gpt-image-2), the additional cost is the two vision calls (~$0.02–0.04 total).

## Files to Modify

1. `src/server/jobs/derivation.ts` — Replace `images.edit` branch with new 3-step pipeline
2. `src/server/ai/prompt-builder.ts` — Add `buildRestylingPrompt` function
3. **New:** `src/server/ai/image-analysis.ts` — Add `analyzeImageContent` and `analyzeImageStyle`
4. `src/lib/api-response.ts` — (no changes needed)

## Testing Strategy

1. **Unit test:** Mock vision API responses and verify prompt assembly
2. **Integration test:** Run restyling with test images, verify output is not a collage
3. **Visual QA:** Compare outputs before/after — the reference image should never appear literally in the result

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Vision API hallucinates wrong content/style | Use structured JSON with strict system prompts; validate output |
| Generation loses brand logo/CTA | Content Brief explicitly includes brand elements and CTA text |
| Generation drifts to unrelated visual universe | Style Brief is constrained to visual language only; prompt forbids inventing new brands |
| Increased latency (3 API calls) | Run content + style analysis in parallel with `Promise.all` |
| Higher cost per generation | Fallback to legacy mode if budget is constrained |
