import { env } from "@/server/validation/env";
import { getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { z } from "zod";

export const contentBriefSchema = z.object({
  product: z.string(),
  offer: z.string(),
  cta: z.object({ text: z.string(), style: z.string() }),
  brandElements: z.array(z.string()),
  keyVisual: z.string(),
  textContent: z.object({ headline: z.string(), bullets: z.array(z.string()) }),
  format: z.string(),
});
export type ContentBrief = z.infer<typeof contentBriefSchema>;

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
  if (isE2EControlledProviderEnabled()) {
    return contentBriefSchema.parse({
      product: "Produto da arte",
      offer: "Oferta da arte",
      cta: { text: "Saiba mais", style: "botão" },
      brandElements: ["marca controlada"],
      keyVisual: "produto em destaque",
      textContent: { headline: "Headline da arte", bullets: [] },
      format: "4:5",
    });
  }
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await getOpenAI().chat.completions.create({
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
  return contentBriefSchema.parse(JSON.parse(jsonString));
}

export const styleBriefSchema = z.object({
  colorPalette: z.object({ dominant: z.array(z.string()), accents: z.array(z.string()), gradients: z.string() }),
  typography: z.object({ personality: z.string(), effects: z.array(z.string()) }),
  textures: z.array(z.string()),
  composition: z.string(),
  mood: z.string(),
  decorativeElements: z.array(z.string()),
  photoTreatment: z.string(),
});
export type StyleBrief = z.infer<typeof styleBriefSchema>;

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
  if (isE2EControlledProviderEnabled()) {
    return styleBriefSchema.parse({
      colorPalette: { dominant: ["#ff0080"], accents: ["#20c060"], gradients: "nenhum" },
      typography: { personality: "direta", effects: [] },
      textures: [],
      composition: "centralizada",
      mood: "direto e vibrante",
      decorativeElements: [],
      photoTreatment: "alto contraste",
    });
  }
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await getOpenAI().chat.completions.create({
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
  return styleBriefSchema.parse(JSON.parse(jsonString));
}
