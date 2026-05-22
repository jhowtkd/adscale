import OpenAI from "openai";
import { z } from "zod";
import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";

function getOpenAI() {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });
}

// ── Schemas ───────────────────────────────────────────────────────────

const visualPatternsSchema = z.object({
  colors: z.array(z.string()).optional(),
  composition: z.string().optional(),
  typography: z.string().optional(),
});

const messagingSchema = z.object({
  headlineStyle: z.string().optional(),
  ctaStyle: z.string().optional(),
  offerType: z.string().optional(),
});

const competitorAnalysisSchema = z.object({
  visualPatterns: visualPatternsSchema,
  messaging: messagingSchema,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  differentiationOpportunities: z.array(z.string()),
});

const strategySchema = z.object({
  recommendations: z.array(z.string()),
  insights: z.array(z.string()),
});

export type CompetitorAnalysisResult = z.infer<typeof competitorAnalysisSchema>;
export type DifferentiationStrategy = z.infer<typeof strategySchema>;

// ── Prompt builders ───────────────────────────────────────────────────

function buildAnalyzePrompt(competitorName?: string, platform?: string): string {
  const contextParts: string[] = [];
  if (competitorName) contextParts.push(`Competitor name: ${competitorName}`);
  if (platform) contextParts.push(`Platform: ${platform}`);

  return `You are a senior creative strategist analyzing a competitor's advertising creative.
${contextParts.length > 0 ? contextParts.join("\n") : ""}

Analyze the provided image and return ONLY a JSON object with this exact structure:
{
  "visualPatterns": {
    "colors": ["dominant color 1", "dominant color 2"],
    "composition": "brief description of layout and composition",
    "typography": "brief description of font style and hierarchy"
  },
  "messaging": {
    "headlineStyle": "description of headline approach",
    "ctaStyle": "description of call-to-action style",
    "offerType": "type of offer or promotion shown"
  },
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "differentiationOpportunities": ["opportunity 1", "opportunity 2", "opportunity 3"]
}

Rules:
- Be specific and actionable. Avoid generic observations.
- strengths: what this creative does well visually or in messaging.
- weaknesses: what could be improved or what is missing.
- differentiationOpportunities: concrete ways our brand could stand out against this competitor.
- Keep arrays to 3–6 items.`;
}

function buildStrategyPrompt(
  campaignBrief: CampaignBrief,
  competitors: CompetitorAnalysisResult[]
): string {
  const briefText = `
Campaign Brief:
- Name: ${campaignBrief.name}
- Client/Product: ${campaignBrief.client || campaignBrief.product || "N/A"}
- Objective: ${campaignBrief.objective || "N/A"}
- Audience: ${campaignBrief.audience || "N/A"}
- Platforms: ${campaignBrief.platforms?.join(", ") || "N/A"}
- Tone: ${campaignBrief.tone || "N/A"}
- Offer: ${campaignBrief.offer || "N/A"}
- Constraints: ${campaignBrief.constraints || "None"}
- Notes: ${campaignBrief.notes || "None"}
`;

  const competitorText = competitors
    .map((c, i) => {
      const lines = [
        `Competitor ${i + 1}:`
      ];
      if (c.visualPatterns.colors?.length) {
        lines.push(`- Colors: ${c.visualPatterns.colors.join(", ")}`);
      }
      if (c.visualPatterns.composition) {
        lines.push(`- Composition: ${c.visualPatterns.composition}`);
      }
      if (c.visualPatterns.typography) {
        lines.push(`- Typography: ${c.visualPatterns.typography}`);
      }
      if (c.messaging.headlineStyle) {
        lines.push(`- Headline style: ${c.messaging.headlineStyle}`);
      }
      if (c.messaging.ctaStyle) {
        lines.push(`- CTA style: ${c.messaging.ctaStyle}`);
      }
      if (c.messaging.offerType) {
        lines.push(`- Offer type: ${c.messaging.offerType}`);
      }
      if (c.strengths.length) {
        lines.push(`- Strengths: ${c.strengths.join("; ")}`);
      }
      if (c.weaknesses.length) {
        lines.push(`- Weaknesses: ${c.weaknesses.join("; ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  return `You are a senior creative strategist. Given a campaign brief and analyses of competitor creatives, generate a differentiation strategy.

${briefText}

${competitorText}

Return ONLY a JSON object with this exact structure:
{
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "insights": ["insight 1", "insight 2", "insight 3"]
}

Rules:
- recommendations: concrete, actionable creative directions. E.g., "90% of competitors use blue backgrounds; test warm tones to stand out".
- insights: strategic observations about competitor patterns and market gaps.
- Be specific. Reference actual patterns from the competitor analyses when possible.
- Keep arrays to 3–8 items.`;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface CampaignBrief {
  name: string;
  client?: string | null;
  product?: string | null;
  objective?: string | null;
  audience?: string | null;
  platforms?: string[] | null;
  tone?: string | null;
  offer?: string | null;
  constraints?: string | null;
  notes?: string | null;
}

// ── Analysis ──────────────────────────────────────────────────────────

export async function analyzeCompetitorCreative(
  buffer: Buffer,
  mimeType: string,
  competitorName?: string,
  platform?: string
): Promise<CompetitorAnalysisResult> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const prompt = buildAnalyzePrompt(competitorName, platform);

  const response = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [
      { role: "system", content: prompt },
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
    throw new Error("Empty vision response for competitor analysis");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    logger.error("[competitor-analyzer] invalid JSON from AI:", raw);
    throw new Error("Invalid JSON response from competitor analysis");
  }

  const validated = competitorAnalysisSchema.safeParse(parsed);
  if (!validated.success) {
    logger.error("[competitor-analyzer] validation failed:", validated.error.flatten());
    throw new Error("Competitor analysis response validation failed");
  }

  return validated.data;
}

// ── Strategy ──────────────────────────────────────────────────────────

export async function generateDifferentiationStrategy(
  campaignBrief: CampaignBrief,
  competitorAnalyses: CompetitorAnalysisResult[]
): Promise<DifferentiationStrategy> {
  if (competitorAnalyses.length === 0) {
    throw new Error("At least one competitor analysis is required");
  }

  const prompt = buildStrategyPrompt(campaignBrief, competitorAnalyses);

  const response = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 2048,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response for differentiation strategy");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    logger.error("[competitor-analyzer] invalid JSON from strategy AI:", raw);
    throw new Error("Invalid JSON response from differentiation strategy");
  }

  const validated = strategySchema.safeParse(parsed);
  if (!validated.success) {
    logger.error("[competitor-analyzer] strategy validation failed:", validated.error.flatten());
    throw new Error("Differentiation strategy response validation failed");
  }

  return validated.data;
}

// ── Prompt builder helper (for prompt-builder.ts integration) ─────────

export function buildCompetitorContextPromptSection(
  analyses: CompetitorAnalysisResult[]
): string {
  if (analyses.length === 0) return "";

  const lines = [
    "\n--- Competitor Analysis Context ---",
    ...analyses.flatMap((a, i) => {
      const parts: string[] = [`Competitor ${i + 1}:`];
      if (a.visualPatterns.colors?.length) {
        parts.push(`  Colors: ${a.visualPatterns.colors.join(", ")}`);
      }
      if (a.visualPatterns.composition) {
        parts.push(`  Composition: ${a.visualPatterns.composition}`);
      }
      if (a.visualPatterns.typography) {
        parts.push(`  Typography: ${a.visualPatterns.typography}`);
      }
      if (a.messaging.headlineStyle) {
        parts.push(`  Headline: ${a.messaging.headlineStyle}`);
      }
      if (a.messaging.ctaStyle) {
        parts.push(`  CTA: ${a.messaging.ctaStyle}`);
      }
      if (a.strengths.length) {
        parts.push(`  Strengths: ${a.strengths.join("; ")}`);
      }
      if (a.weaknesses.length) {
        parts.push(`  Weaknesses: ${a.weaknesses.join("; ")}`);
      }
      if (a.differentiationOpportunities.length) {
        parts.push(`  Opportunities: ${a.differentiationOpportunities.join("; ")}`);
      }
      return parts;
    }),
    "--- End Competitor Context ---\n",
  ];

  return lines.join("\n");
}
