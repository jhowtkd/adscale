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
