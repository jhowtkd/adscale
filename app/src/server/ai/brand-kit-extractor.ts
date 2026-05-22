import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/server/validation/env";

function getOpenAI() {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });
}

const extractionSchema = z.object({
  colors: z.array(z.string()).describe("Array of hex color codes extracted from the brand guide"),
  fonts: z.array(z.string()).describe("Array of font family names extracted from the brand guide"),
  logoDescription: z.string().describe("Brief description of the logo style and placement rules"),
  toneOfVoice: z.string().describe("The brand's tone of voice description"),
  prohibitedElements: z.string().describe("Elements or practices that should be avoided"),
  requiredElements: z.string().describe("Elements that must always be present in creatives"),
});

export type ExtractedBrandKit = z.infer<typeof extractionSchema>;

const BRAND_KIT_SYSTEM_PROMPT = `You are a brand identity analyst. Analyze the provided brand guide image and extract structured brand kit information.
Return ONLY a JSON object with this exact structure:
{
  "colors": ["#HEX1", "#HEX2", ...],
  "fonts": ["Font Name 1", "Font Name 2", ...],
  "logoDescription": "description of logo usage rules",
  "toneOfVoice": "description of brand tone",
  "prohibitedElements": "things to avoid",
  "requiredElements": "things that must be present"
}

For colors, include all primary, secondary, and accent colors as hex codes.
For fonts, include all font families specified.
Be thorough but concise.`;

export async function extractBrandKitFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ExtractedBrandKit> {
  const base64 = imageBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [
      { role: "system", content: BRAND_KIT_SYSTEM_PROMPT },
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
    throw new Error("Empty vision response for brand kit extraction");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  const parsed = JSON.parse(jsonString);

  const validated = extractionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Brand kit extraction validation failed: ${validated.error.message}`);
  }

  return validated.data;
}

export function buildBrandKitPromptSection(
  brandKit: Partial<ExtractedBrandKit> & {
    name?: string;
    description?: string;
    visualNotes?: string;
    toneNotes?: string;
    constraints?: string;
    logoAssetKey?: string | null;
  }
): string {
  const parts: string[] = [];

  if (brandKit.name) parts.push(`Brand Name: ${brandKit.name}`);
  if (brandKit.description) parts.push(`Brand Description: ${brandKit.description}`);
  if (brandKit.visualNotes) parts.push(`Visual Notes: ${brandKit.visualNotes}`);
  if (brandKit.toneNotes) parts.push(`Tone Notes: ${brandKit.toneNotes}`);
  if (brandKit.constraints) parts.push(`Constraints: ${brandKit.constraints}`);

  if (brandKit.colors && brandKit.colors.length > 0) {
    parts.push(`Brand Colors: ${brandKit.colors.join(", ")}`);
  }
  if (brandKit.fonts && brandKit.fonts.length > 0) {
    parts.push(`Brand Fonts: ${brandKit.fonts.join(", ")}`);
  }
  if (brandKit.logoDescription) {
    parts.push(`Logo Rules: ${brandKit.logoDescription}`);
  }
  if (brandKit.logoAssetKey) {
    parts.push(`Logo Asset: ${brandKit.logoAssetKey}`);
  }
  if (brandKit.toneOfVoice) {
    parts.push(`Tone of Voice: ${brandKit.toneOfVoice}`);
  }
  if (brandKit.prohibitedElements) {
    parts.push(`Prohibited Elements: ${brandKit.prohibitedElements}`);
  }
  if (brandKit.requiredElements) {
    parts.push(`Required Elements: ${brandKit.requiredElements}`);
  }

  if (parts.length === 0) return "";
  return `\n--- Brand Kit ---\n${parts.join("\n")}\n`;
}
