import OpenAI from "openai";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });

export interface CopyVariant {
  headline: string;
  ctaText: string | null;
  toneLabel: string;
  confidenceScore: number;
  reasoning: string;
}

export interface CopyGenerationContext {
  briefing: {
    client?: string | null;
    product?: string | null;
    offer?: string | null;
    objective?: string | null;
    audience?: string | null;
    tone?: string | null;
  };
  brandKit?: {
    toneOfVoice?: string | null;
    constraints?: string | null;
    prohibitedElements?: string | null;
  } | null;
  currentCta?: string | null;
  platform?: string;
}

export async function generateCopyVariants(
  context: CopyGenerationContext,
  options: {
    count?: number;
    tones?: string[];
  } = {}
): Promise<CopyVariant[]> {
  const count = Math.min(Math.max(options.count ?? 5, 3), 10);
  const requestedTones = options.tones?.length ? options.tones : ["urgent", "emotional", "factual", "social_proof", "curiosity"];

  const prompt = buildCopyPrompt(context, count, requestedTones);

  logger.info("[copy-generator] generating variants", { count, tones: requestedTones });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert advertising copywriter specializing in high-converting ad headlines and CTAs. You write concise, impactful copy optimized for digital ads. Return ONLY valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  try {
    const parsed = JSON.parse(content);
    const variants: CopyVariant[] = parsed.variants ?? [];
    return variants.slice(0, count).map((v) => ({
      headline: v.headline?.trim() ?? "",
      ctaText: v.ctaText?.trim() ?? null,
      toneLabel: v.toneLabel ?? "neutral",
      confidenceScore: Math.min(Math.max(Math.round(v.confidenceScore ?? 70), 0), 100),
      reasoning: v.reasoning ?? "",
    }));
  } catch (err) {
    logger.error("[copy-generator] failed to parse response", { content: content.slice(0, 200) });
    throw new Error("Invalid response format from AI");
  }
}

function buildCopyPrompt(
  context: CopyGenerationContext,
  count: number,
  tones: string[]
): string {
  const { briefing, brandKit, currentCta, platform } = context;

  const parts = [
    "Generate high-converting ad copy variants.",
    "",
    `## Campaign Context`,
    briefing.client ? `- Client: ${briefing.client}` : "",
    briefing.product ? `- Product: ${briefing.product}` : "",
    briefing.offer ? `- Offer: ${briefing.offer}` : "",
    briefing.objective ? `- Objective: ${briefing.objective}` : "",
    briefing.audience ? `- Audience: ${briefing.audience}` : "",
    briefing.tone ? `- Current tone: ${briefing.tone}` : "",
    platform ? `- Platform: ${platform}` : "",
    "",
    brandKit?.toneOfVoice ? `## Brand Tone of Voice\n${brandKit.toneOfVoice}` : "",
    brandKit?.constraints ? `## Constraints\n${brandKit.constraints}` : "",
    brandKit?.prohibitedElements ? `## Prohibited\n${brandKit.prohibitedElements}` : "",
    currentCta ? `\n## Current CTA\n${currentCta}` : "",
    "",
    `## Instructions`,
    `- Generate exactly ${count} variants`,
    `- Each variant should use a different approach: ${tones.join(", ")}`,
    `- Headlines: max 60 characters`,
    `- CTAs: max 20 characters, action-oriented`,
    `- Match the brand tone of voice`,
    `- Respect all constraints and prohibited elements`,
    "",
    `## Output Format`,
    `Return ONLY a JSON object with this exact shape:`,
    `{"variants": [`
  ];

  parts.push(`  {
    "headline": "string (max 60 chars)",
    "ctaText": "string (max 20 chars, or null)",
    "toneLabel": "string (one of: ${tones.join(", ")})",
    "confidenceScore": number (0-100, estimated CTR potential),
    "reasoning": "string (brief explanation of why this works)"
  }`);

  parts.push(`]}`);

  return parts.filter(Boolean).join("\n");
}
