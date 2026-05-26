import { getOpenAI } from "@/server/ai/utils";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { AiDeducedFields, aiDeducedFieldsSchema } from "../validation/ai-deduction";

const CampaignDeductionResponseSchema = z.object({
  product: z.object({
    value: z.string().nullable().describe("Product or service being advertised"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  }).nullable(),
  objective: z.object({
    value: z.string().nullable().describe("Campaign objective (e.g., awareness, conversion, engagement)"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  }).nullable(),
  targetAudience: z.object({
    value: z.string().nullable().describe("Target audience description"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  }).nullable(),
  tone: z.object({
    value: z.string().nullable().describe("Tone of voice (e.g., professional, playful, urgent)"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  }).nullable(),
  offer: z.object({
    value: z.string().nullable().describe("Offer or promotion mentioned"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  }).nullable(),
  platforms: z.object({
    value: z.array(z.string()).nullable().describe("Advertising platforms (e.g., Facebook, Instagram, Google)"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level"),
  }).nullable(),
});

export type CampaignDeductionResult = AiDeducedFields;

export async function analyzeCampaignCreative(imageUrl: string): Promise<CampaignDeductionResult> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert advertising creative analyst. Analyze the provided ad creative image and deduce campaign fields.
          
Return your analysis as structured JSON with these fields:
- product: What product or service is being advertised
- objective: The campaign objective (awareness, conversion, engagement, etc.)
- targetAudience: Who the ad is targeting
- tone: The tone of voice (professional, playful, urgent, luxurious, etc.)
- offer: Any promotion, discount, or offer mentioned
- platforms: Which advertising platforms this creative seems designed for

For each field, provide a confidence level: "high" (clearly visible), "medium" (inferred), or "low" (uncertain).
If a field cannot be determined, omit it or set value to empty string with "low" confidence.
Be concise but accurate. Do not invent information not present in the image.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this advertising creative and deduce the campaign fields. Return only valid JSON matching the schema.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(CampaignDeductionResponseSchema, "campaign_deduction"),
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {};
    }

    try {
      const parsed = JSON.parse(content);
      // Filter out null values to match optional schema fields
      const filtered = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v !== null)
      );
      const validated = aiDeducedFieldsSchema.parse({
        ...filtered,
        analyzedAt: new Date().toISOString(),
      });
      return validated;
    } catch (error) {
      console.error("Failed to parse AI deduction response:", error);
      return {};
    }
  } catch (error) {
    console.error("AI analysis failed:", error);
    return {};
  }
}
