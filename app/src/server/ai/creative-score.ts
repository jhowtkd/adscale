import OpenAI from "openai";
import { env } from "@/server/validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface ScoreResult {
  qualityScore: number;
  scoreStatus: "heuristic" | "analyzed" | "failed";
  scoreBreakdown: {
    ctaClarity: number;
    textLegibility: number;
    briefMatch: number;
    visualQuality: number;
    formatFit: number;
  };
  scoreIssues: string[];
  regenerationSuggestion: string;
}

export interface HeuristicInput {
  status: string;
  format: string | null | undefined;
  generationMode: string | null | undefined;
  ctaText: string | null | undefined;
  parentId: string | null | undefined;
}

export function scoreDerivationHeuristic(input: HeuristicInput): ScoreResult {
  let base = 70;

  if (input.status === "completed") base += 10;
  if (input.format) base += 5;
  if (input.ctaText) base += 5;
  if (input.generationMode === "art_variation") base += 5;
  if (input.parentId) base += 5;

  const clamped = Math.min(100, Math.max(0, base));

  const breakdown = {
    ctaClarity: clamped,
    textLegibility: clamped - 2,
    briefMatch: clamped - 1,
    visualQuality: clamped - 3,
    formatFit: clamped,
  };

  return {
    qualityScore: clamped,
    scoreStatus: "heuristic",
    scoreBreakdown: breakdown,
    scoreIssues: [],
    regenerationSuggestion: "",
  };
}

export interface AnalyzeInput {
  imageBuffer: Buffer;
  mimeType: string;
  campaign: {
    name: string;
    client: string;
    product: string;
    offer: string;
    objective: string;
    audience: string;
  };
  derivation: {
    ctaText: string | null | undefined;
    format: string | null | undefined;
    generationMode: string | null | undefined;
    feedback: string | null | undefined;
  };
  locale: string;
}

export async function analyzeDerivationCreative(input: AnalyzeInput): Promise<ScoreResult> {
  const base64 = input.imageBuffer.toString("base64");
  const dataUrl = `data:${input.mimeType};base64,${base64}`;

  const ctaText = input.derivation.ctaText ?? "none";
  const format = input.derivation.format ?? "unknown";
  const generationMode = input.derivation.generationMode ?? "unknown";

  const prompt = `Evaluate the generated ad as a reviewer. Do not invent a new CTA.
The exact CTA, if present, must remain: ${ctaText}.
The target format must remain: ${format}.
The generation mode must remain: ${generationMode}.
Return only JSON with qualityScore, scoreBreakdown, scoreIssues, regenerationSuggestion.

Campaign context:
- Name: ${input.campaign.name}
- Client: ${input.campaign.client}
- Product: ${input.campaign.product}
- Offer: ${input.campaign.offer}
- Objective: ${input.campaign.objective}
- Audience: ${input.campaign.audience}

Score each criterion from 0 to 100.
Provide 1-3 specific issues.
The regenerationSuggestion must preserve the exact CTA text, format, and generation mode.`;

  const response = await openai.responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: "You are an expert creative director scoring ad creatives." },
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const raw = (response as unknown as { output_text?: string }).output_text;
  if (!raw) {
    throw new Error("Empty vision response for creative scoring");
  }

  const parsed = JSON.parse(raw) as {
    qualityScore?: number;
    scoreBreakdown?: {
      ctaClarity?: number;
      textLegibility?: number;
      briefMatch?: number;
      visualQuality?: number;
      formatFit?: number;
    };
    scoreIssues?: string[];
    regenerationSuggestion?: string;
  };

  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

  const breakdown = {
    ctaClarity: clamp(parsed.scoreBreakdown?.ctaClarity ?? 70),
    textLegibility: clamp(parsed.scoreBreakdown?.textLegibility ?? 70),
    briefMatch: clamp(parsed.scoreBreakdown?.briefMatch ?? 70),
    visualQuality: clamp(parsed.scoreBreakdown?.visualQuality ?? 70),
    formatFit: clamp(parsed.scoreBreakdown?.formatFit ?? 70),
  };

  const qualityScore = clamp(parsed.qualityScore ?? 70);

  return {
    qualityScore,
    scoreStatus: "analyzed",
    scoreBreakdown: breakdown,
    scoreIssues: parsed.scoreIssues ?? [],
    regenerationSuggestion:
      parsed.regenerationSuggestion ?? "Refine the creative while preserving the exact CTA text.",
  };
}

export interface BuildSuggestionInput {
  ctaText: string | null | undefined;
  format: string | null | undefined;
  generationMode: string | null | undefined;
  scoreIssues: string[];
  modelSuggestion: string;
}

export function buildRegenerationSuggestion(input: BuildSuggestionInput): string {
  const parts: string[] = [];

  if (input.scoreIssues.length > 0) {
    parts.push(`Issues: ${input.scoreIssues.join("; ")}.`);
  }

  parts.push(`Suggestion: ${input.modelSuggestion}`);

  const cta = input.ctaText ?? "none";
  const fmt = input.format ?? "unknown";
  const mode = input.generationMode ?? "unknown";

  parts.push(`Preserve the exact CTA "${cta}", the ${fmt} format, and the ${mode} generation mode.`);

  return parts.join(" ");
}
