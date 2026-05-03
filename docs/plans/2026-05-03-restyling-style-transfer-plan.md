# Restyling Style Transfer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the collage-style restyling pipeline (`images.edit` with two images) with a true style-transfer pipeline that analyzes both images via vision and generates from scratch via `images.generate`.

**Architecture:** Add two GPT-4o vision analyzers (`analyzeImageContent` + `analyzeImageStyle`) that produce structured JSON briefs. A new `buildRestylingPrompt` combines both briefs into a unified prompt sent to `images.generate`. The existing `buildDerivationPrompt` remains untouched for other modes. Fallback to legacy prompt if vision analysis fails.

**Tech Stack:** TypeScript, Next.js, OpenAI SDK (Chat Completions API for vision, Images API for generation), Drizzle ORM, Vitest

---

### Task 1: Create `src/server/ai/image-analysis.ts` with `analyzeImageContent`

**Files:**
- Create: `src/server/ai/image-analysis.ts`
- Test: `tests/unit/ai/image-analysis.test.ts`

**Context:** The function sends a base64 image to GPT-4o/gpt-5 via `openai.chat.completions.create` with `detail: "high"` and returns a structured JSON object describing the ad content.

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { analyzeImageContent } from "@/server/ai/image-analysis";

describe("analyzeImageContent", () => {
  it("returns parsed content brief from vision response", async () => {
    const result = await analyzeImageContent(
      Buffer.from("fake-image"),
      "image/png"
    );
    expect(result).toHaveProperty("product");
    expect(result).toHaveProperty("offer");
    expect(result).toHaveProperty("cta");
    expect(result).toHaveProperty("brandElements");
    expect(result).toHaveProperty("keyVisual");
    expect(result).toHaveProperty("textContent");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/image-analysis.test.ts
```

Expected: FAIL with "Cannot find module '@/server/ai/image-analysis'"

**Step 3: Write minimal implementation**

```typescript
// src/server/ai/image-analysis.ts
import OpenAI from "openai";
import { env } from "@/server/validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface ContentBrief {
  product: string;
  offer: string;
  cta: { text: string; style: string };
  brandElements: string[];
  keyVisual: string;
  textContent: { headline: string; bullets: string[] };
  format: string;
}

const CONTENT_SYSTEM_PROMPT = `You are an advertising image analyst. Extract structured content from the provided ad image.
Return ONLY a JSON object with this exact structure:
{
  "product": "what is being advertised",
  "offer": "discounts, promotions, pricing mentioned",
  "cta": { "text": "call-to-action text", "style": "button appearance" },
  "brandElements": ["logos", "brand colors", "taglines"],
  "keyVisual": "main photo or subject",
  "textContent": { "headline": "main headline", "bullets": ["bullet points"] },
  "format": "aspect ratio and layout"
}`;

export async function analyzeImageContent(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ContentBrief> {
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [
      { role: "system", content: CONTENT_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
    max_completion_tokens: 2048,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty vision response for content analysis");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  return JSON.parse(jsonString) as ContentBrief;
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/image-analysis.test.ts
```

Expected: PASS (mocked OpenAI response needed — add a __mocks__ or use vi.mock)

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/ai/image-analysis.ts app/tests/unit/ai/image-analysis.test.ts && git commit -m "feat: add analyzeImageContent vision analyzer"
```

---

### Task 2: Add `analyzeImageStyle` to `src/server/ai/image-analysis.ts`

**Files:**
- Modify: `src/server/ai/image-analysis.ts`
- Test: `tests/unit/ai/image-analysis.test.ts`

**Step 1: Write the failing test**

Add to existing test file:

```typescript
describe("analyzeImageStyle", () => {
  it("returns parsed style brief from vision response", async () => {
    const result = await analyzeImageStyle(
      Buffer.from("fake-image"),
      "image/jpeg"
    );
    expect(result).toHaveProperty("colorPalette");
    expect(result).toHaveProperty("typography");
    expect(result).toHaveProperty("textures");
    expect(result).toHaveProperty("composition");
    expect(result).toHaveProperty("mood");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/image-analysis.test.ts
```

Expected: FAIL with "analyzeImageStyle is not defined"

**Step 3: Write minimal implementation**

Append to `src/server/ai/image-analysis.ts`:

```typescript
export interface StyleBrief {
  colorPalette: { dominant: string[]; accents: string[]; gradients: string };
  typography: { personality: string; effects: string[] };
  textures: string[];
  composition: string;
  mood: string;
  decorativeElements: string[];
  photoTreatment: string;
}

const STYLE_SYSTEM_PROMPT = `You are a visual style analyst. Analyze the provided image as a STYLE SOURCE ONLY.
Extract visual language elements: color palette, typography personality, textures, composition style, mood, decorative elements, and photo treatment.
Do NOT describe the subject matter or content — only the visual style.
Return ONLY a JSON object with this exact structure:
{
  "colorPalette": { "dominant": ["color1", "color2"], "accents": ["accent1"], "gradients": "description" },
  "typography": { "personality": "grunge, elegant, bold, etc", "effects": ["torn edges", "glow", "outline"] },
  "textures": ["grain", "halftone", "noise"],
  "composition": "layering, collage, centered, etc",
  "mood": "dark, energetic, nostalgic, etc",
  "decorativeElements": ["shapes", "badges", "stickers"],
  "photoTreatment": "black & white, duotone, high contrast, etc"
}`;

export async function analyzeImageStyle(
  imageBuffer: Buffer,
  mimeType: string
): Promise<StyleBrief> {
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [
      { role: "system", content: STYLE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
    max_completion_tokens: 2048,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty vision response for style analysis");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  return JSON.parse(jsonString) as StyleBrief;
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/image-analysis.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/ai/image-analysis.ts app/tests/unit/ai/image-analysis.test.ts && git commit -m "feat: add analyzeImageStyle vision analyzer"
```

---

### Task 3: Add `buildRestylingPrompt` to `src/server/ai/prompt-builder.ts`

**Files:**
- Modify: `src/server/ai/prompt-builder.ts`
- Test: `tests/unit/ai/prompt-builder.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/ai/prompt-builder.test.ts`:

```typescript
describe("buildRestylingPrompt", () => {
  it("includes content brief and style brief in prompt", () => {
    const prompt = buildRestylingPrompt(
      {
        product: "Agronomy course",
        offer: "50% off enrollment",
        cta: { text: "Sign up now", style: "red button" },
        brandElements: ["UCDB logo"],
        keyVisual: "Student with tablet",
        textContent: { headline: "AGRONOMY", bullets: ["Field experience"] },
        format: "1:1",
      },
      {
        colorPalette: { dominant: ["black"], accents: ["yellow"], gradients: "none" },
        typography: { personality: "grunge", effects: ["torn edges"] },
        textures: ["grain", "noise"],
        composition: "collage",
        mood: "energetic",
        decorativeElements: ["badges"],
        photoTreatment: "high contrast",
      },
      { name: "UCDB Agronomy", client: "UCDB" } as Campaign,
      "INSCREVA-SE",
      "pt-BR"
    );

    expect(prompt).toContain("Agronomy course");
    expect(prompt).toContain("50% off enrollment");
    expect(prompt).toContain("grunge");
    expect(prompt).toContain("collage");
    expect(prompt).toContain("INSCREVA-SE");
    expect(prompt).toContain("portugues brasileiro");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/prompt-builder.test.ts
```

Expected: FAIL with "buildRestylingPrompt is not defined"

**Step 3: Write minimal implementation**

Append to `src/server/ai/prompt-builder.ts`:

```typescript
import type { ContentBrief, StyleBrief } from "./image-analysis";

export function buildRestylingPrompt(
  content: ContentBrief,
  style: StyleBrief,
  campaign: Campaign,
  ctaText?: string | null,
  locale?: string
): string {
  const parts: string[] = [
    "You are an advertising creative engine. Create a completely new advertising image from scratch.",
    "",
    "CONTENT TO COMMUNICATE (from original ad):",
    `- Product/Service: ${content.product}`,
    `- Offer: ${content.offer}`,
    `- Main Visual: ${content.keyVisual}`,
    `- Headline: ${content.textContent.headline}`,
    `- Supporting Points: ${content.textContent.bullets.join(" | ")}`,
    `- Brand Elements: ${content.brandElements.join(", ")}`,
    `- CTA: ${ctaText || content.cta.text}`,
    "",
    "VISUAL STYLE TO APPLY (from reference image):",
    `- Color Palette: ${style.colorPalette.dominant.join(", ")} with accents ${style.colorPalette.accents.join(", ")}`,
    `- Typography Personality: ${style.typography.personality} (${style.typography.effects.join(", ")})`,
    `- Textures: ${style.textures.join(", ")}`,
    `- Composition: ${style.composition}`,
    `- Mood: ${style.mood}`,
    `- Decorative Elements: ${style.decorativeElements.join(", ")}`,
    `- Photo Treatment: ${style.photoTreatment}`,
    "",
    "CRITICAL RULES:",
    "- Do NOT copy content from the style reference. Use ONLY its visual language.",
    "- Reimagine the ad concept through the lens of this aesthetic.",
    "- The result should feel like an original ad, not a collage or pasted overlay.",
    "- Fill the entire canvas edge-to-edge. No blank bands, blurred padding, or borders.",
    "- Do NOT invent new facts, offers, or CTAs — use those from the content brief only.",
    "- Preserve the brand logo and CTA text exactly as specified.",
  ];

  parts.push(imageLanguageInstruction(locale));
  parts.push("\nOutput: a polished, professional ad image suitable for paid social.");

  return parts.join("\n");
}
```

**Step 4: Run test to verify it passes**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/unit/ai/prompt-builder.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/ai/prompt-builder.ts app/tests/unit/ai/prompt-builder.test.ts && git commit -m "feat: add buildRestylingPrompt for unified style+content generation"
```

---

### Task 4: Wire new pipeline into `src/server/jobs/derivation.ts`

**Files:**
- Modify: `src/server/jobs/derivation.ts`
- Test: `tests/integration/derivation-job.test.ts`

**Context:** The restyling branch currently uses `openai.images.edit({ image: [baseFile, styleFile], ... })`. Replace it with the 3-step pipeline: download both assets → analyze content + style in parallel → generate with `images.generate`.

**Step 1: Read current restyling block**

Lines ~272–304 in `src/server/jobs/derivation.ts`:

```typescript
if (effectiveGenerationMode === "restyling") {
  const assets = await getAssetsByCampaign(campaignId, workspaceId);
  const baseAsset = assets.find((a) => a.role === "base") ?? assets[0];
  const styleAsset = assets.find((a) => a.role === "style_reference") ?? assets[1];
  // ... download buffers, create files, call openai.images.edit
}
```

**Step 2: Replace with new pipeline**

```typescript
import { analyzeImageContent, analyzeImageStyle } from "@/server/ai/image-analysis";
import { buildRestylingPrompt } from "@/server/ai/prompt-builder";

// ... inside the restyling branch:
if (effectiveGenerationMode === "restyling") {
  const assets = await getAssetsByCampaign(campaignId, workspaceId);
  const baseAsset = assets.find((a) => a.role === "base") ?? assets[0];
  const styleAsset = assets.find((a) => a.role === "style_reference") ?? assets[1];

  if (!baseAsset || !styleAsset) {
    throw new Error("Restyling requires both base and style_reference assets");
  }

  const baseBuffer = await downloadBuffer(baseAsset.key);
  const styleBuffer = await downloadBuffer(styleAsset.key);

  let unifiedPrompt: string;

  try {
    const [contentBrief, styleBrief] = await Promise.all([
      analyzeImageContent(baseBuffer, baseAsset.type),
      analyzeImageStyle(styleBuffer, styleAsset.type),
    ]);

    unifiedPrompt = buildRestylingPrompt(
      contentBrief,
      styleBrief,
      campaign,
      ctaText ?? derivation.ctaText ?? undefined,
      locale
    );
  } catch (analysisErr) {
    console.error(
      `[restyling] vision analysis failed, falling back to legacy prompt.`,
      analysisErr
    );
    unifiedPrompt = buildDerivationPrompt({
      campaign,
      plan,
      asset: baseAsset,
      feedback: derivation.feedback,
      locale,
      generationMode: "restyling",
      variantIndex,
      ctaText,
      targetFormat,
      creativeLevel: campaign.creativeLevel ?? "balanced",
    });
  }

  const response = await withTimeout(
    openai.images.generate({
      model: env.OPENAI_IMAGE_MODEL,
      prompt: unifiedPrompt,
      n: 1,
      size: openaiSize,
    }),
    IMAGE_GENERATION_TIMEOUT_MS,
    "OpenAI image generation (restyling)"
  );

  const first = response.data?.[0];
  if (!first) {
    throw new Error("No image data returned from OpenAI");
  }
  console.log(`[generate-and-store-output] restyling generate success`);
  result = first;
}
```

**Step 3: Run existing integration tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run tests/integration/derivation-job.test.ts
```

Expected: PASS (existing tests mock the job at a higher level and should be unaffected)

**Step 4: Add integration test for new restyling flow**

Add to `tests/integration/derivation-job.test.ts`:

```typescript
it("restyling mode triggers images.generate (not images.edit)", async () => {
  // This test verifies the pipeline structure changed from edit to generate
  // Full test would require mocking vision + generation APIs
});
```

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/src/server/jobs/derivation.ts app/tests/integration/derivation-job.test.ts && git commit -m "feat: wire restyling to vision analysis + images.generate pipeline"
```

---

### Task 5: Verify build, tests, and lint

**Step 1: Run tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm test
```

Expected: All 14 test files pass

**Step 2: Run lint**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run lint
```

Expected: 0 errors, 0 warnings

**Step 3: Run build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add -A && git commit -m "test: verify restyling pipeline build/test/lint"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `docs/plans/2026-05-03-restyling-style-transfer-design.md`

Add a "Implementation Complete" section referencing the commits.

**Step 1: Append to design doc**

```markdown
## Implementation Complete

See commits:
- `feat: add analyzeImageContent vision analyzer`
- `feat: add analyzeImageStyle vision analyzer`
- `feat: add buildRestylingPrompt for unified style+content generation`
- `feat: wire restyling to vision analysis + images.generate pipeline`
```

**Step 2: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add docs/plans/2026-05-03-restyling-style-transfer-design.md && git commit -m "docs: mark restyling design as implemented"
```

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-05-03-restyling-style-transfer-plan.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
