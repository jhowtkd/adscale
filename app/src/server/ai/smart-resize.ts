import OpenAI from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });

export interface SmartResizeAnalysis {
  crops: Record<string, { x: number; y: number; width: number; height: number }>;
  safeZones: Array<{ x: number; y: number; width: number; height: number; label: string }>;
  criticalElements: Array<{ x: number; y: number; width: number; height: number; type: string }>;
  platformRecommendations: Array<{ platform: string; recommendation: string; compliance: string }>;
}

export async function analyzeSmartResize(imageBase64: string): Promise<SmartResizeAnalysis> {
  logger.info("[smart-resize] analyzing image for smart resize");

  const dataUri = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert in digital ad creative optimization. Analyze ad images and provide structured cropping recommendations for different aspect ratios. Return ONLY valid JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this ad creative and provide structured resize recommendations.

Return ONLY a JSON object with this exact shape:
{
  "crops": {
    "1:1": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
    "4:5": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
    "9:16": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 }
  },
  "safeZones": [
    { "x": 0.1, "y": 0.1, "width": 0.8, "height": 0.3, "label": "Text safe zone" }
  ],
  "criticalElements": [
    { "x": 0.3, "y": 0.4, "width": 0.4, "height": 0.2, "type": "product/logo" }
  ],
  "platformRecommendations": [
    { "platform": "meta_ads", "recommendation": "Keep text under 20% of image area", "compliance": "pass|warning|fail" }
  ]
}

Guidelines:
- All coordinates are relative (0.0 to 1.0)
- crops: recommended crop windows for each aspect ratio
- safeZones: areas where text/CTA can be safely placed without being cut
- criticalElements: important visual elements that must be preserved (logos, faces, products, text)
- platformRecommendations: specific rules for Meta Ads, TikTok, Google Ads`,
          },
          {
            type: "image_url",
            image_url: { url: dataUri },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1200,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  try {
    return JSON.parse(content) as SmartResizeAnalysis;
  } catch {
    logger.error("[smart-resize] invalid JSON response", { content: content.slice(0, 200) });
    throw new Error("Invalid analysis response from AI");
  }
}

export function getPlatformRules(): Record<string, { textMaxPercent: number; safeZones: string[]; notes: string }> {
  return {
    meta_ads: {
      textMaxPercent: 20,
      safeZones: ["top", "center"],
      notes: "Text cannot cover more than 20% of the image area. Keep important elements away from edges.",
    },
    tiktok_ads: {
      textMaxPercent: 15,
      safeZones: ["top", "center"],
      notes: "Avoid bottom 150px (UI overlay area). Text should be minimal and centered.",
    },
    google_ads: {
      textMaxPercent: 25,
      safeZones: ["center", "left"],
      notes: "PMAX prefers 1:1 with neutral backgrounds. Keep product clearly visible.",
    },
  };
}
