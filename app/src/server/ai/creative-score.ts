import { z } from "zod";
import { env } from "@/server/validation/env";
import { getOpenAI, extractOutputText } from "./utils";
import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailureCode } from "./creative-quality-gate";
import { SCORE_BREAKDOWN_TO_CRITERION } from "./creative-quality-taxonomy";
import { resolveAllowedEntitiesForCampaign } from "./creative-corpus";
import { buildObservableScoreRubricSection } from "./observable-rubric";

import {
  buildRegenerationSuggestion,
  ctaTextFromContract,
  type BuildSuggestionInput,
} from "./regeneration-suggestion";
import { buildRegenerationCorrectionBrief } from "./regeneration-correction-brief";

export interface ScoreResult {
  qualityScore: number;
  scoreStatus: "heuristic" | "analyzed" | "failed";
  scoreBreakdown: {
    ctaClarity: number;
    textLegibility: number;
    briefMatch: number;
    visualQuality: number;
    formatFit: number;
    variationLevelFit: number;
    informationPreservation: number;
  };
  scoreIssues: string[];
  regenerationSuggestion: string;
}

const SCORE_BREAKDOWN_KEYS = [
  "ctaClarity",
  "textLegibility",
  "briefMatch",
  "visualQuality",
  "formatFit",
  "variationLevelFit",
  "informationPreservation",
] as const;

type ScoreBreakdownKey = (typeof SCORE_BREAKDOWN_KEYS)[number];

const rawScoreJsonSchema = z.object({
  qualityScore: z.unknown().optional(),
  scoreBreakdown: z.record(z.unknown()).optional(),
  scoreIssues: z.unknown().optional(),
  regenerationSuggestion: z.unknown().optional(),
});

function emptyBreakdown(): ScoreResult["scoreBreakdown"] {
  return {
    ctaClarity: 0,
    textLegibility: 0,
    briefMatch: 0,
    visualQuality: 0,
    formatFit: 0,
    variationLevelFit: 0,
    informationPreservation: 0,
  };
}

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function parseDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return clampScore(value);
}

function asScoreIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 3);
}

export function normalizeCreativeScoreResult(value: unknown): ScoreResult {
  const parsed = rawScoreJsonSchema.safeParse(value);
  if (!parsed.success) {
    return {
      qualityScore: 0,
      scoreStatus: "failed",
      scoreBreakdown: emptyBreakdown(),
      scoreIssues: [],
      regenerationSuggestion: "",
    };
  }

  const input = parsed.data;
  const breakdown = emptyBreakdown();
  let validDimensionCount = 0;

  for (const key of SCORE_BREAKDOWN_KEYS) {
    const raw = input.scoreBreakdown?.[key];
    const dimension = parseDimension(raw);
    breakdown[key] = dimension ?? 0;
    if (dimension !== null) {
      validDimensionCount += 1;
    }
  }

  const qualityScoreDirect = parseDimension(input.qualityScore);
  let qualityScore: number;
  let scoreStatus: ScoreResult["scoreStatus"];

  if (qualityScoreDirect !== null) {
    qualityScore = qualityScoreDirect;
    scoreStatus = "analyzed";
  } else if (validDimensionCount > 0) {
    const validValues = SCORE_BREAKDOWN_KEYS.map((key) => parseDimension(input.scoreBreakdown?.[key])).filter(
      (v): v is number => v !== null
    );
    qualityScore = clampScore(
      validValues.reduce((sum, v) => sum + v, 0) / validValues.length
    );
    scoreStatus = "analyzed";
  } else {
    qualityScore = 0;
    scoreStatus = "failed";
  }

  const regenerationSuggestion =
    typeof input.regenerationSuggestion === "string" ? input.regenerationSuggestion.trim() : "";

  return {
    qualityScore,
    scoreStatus,
    scoreBreakdown: breakdown,
    scoreIssues: asScoreIssues(input.scoreIssues),
    regenerationSuggestion,
  };
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
    variationLevelFit: clamped,
    informationPreservation: clamped - 2,
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
    creativeLevel?: string | null | undefined;
    creativeDiagnosis?: unknown;
  };
  locale: string;
  contract?: CreativeContract | null;
}

function scoreDimensionPromptLines(): string {
  return SCORE_BREAKDOWN_KEYS.map((key) => {
    const criterion = SCORE_BREAKDOWN_TO_CRITERION[key];
    const labels: Record<ScoreBreakdownKey, string> = {
      ctaClarity: "ctaClarity (CTA/offer preservation)",
      textLegibility: "textLegibility (legibility)",
      briefMatch: "briefMatch (brief alignment)",
      visualQuality: "visualQuality (creative risk / polish)",
      formatFit: "formatFit (format layout fit)",
      variationLevelFit: "variationLevelFit (variation level fit)",
      informationPreservation: "informationPreservation (information preservation)",
    };
    return `- ${labels[key]} → canonical: ${criterion}`;
  }).join("\n");
}

function buildScoreDimensionMapSection(): string {
  return `SCORE DIMENSION MAP (SCR-01 concern buckets → breakdown keys):
- Factual integrity → briefMatch, informationPreservation
- Hierarchy → visualQuality (creativeRisk criterion)
- Legibility → textLegibility
- Art direction → visualQuality
- Originality → variationLevelFit
- Format fit → formatFit

After QA, server-side score ceilings (SCR-02) cap qualityScore when hard failures are detected — do not let a high model score contradict classified failures.`;
}

function buildCtaInstruction(input: AnalyzeInput): string {
  const ctaSemantics = input.contract?.ctaSemantics;
  if (ctaSemantics?.kind === "explicit") {
    return `The exact CTA must remain: ${ctaSemantics.text}. Penalize if CTA is absent or replaced.`;
  }
  if (ctaSemantics?.kind === "inherited") {
    return `The output must preserve a CTA element from the base creative. The exact text is determined by the base image content. Do NOT penalize for missing explicit CTA text — instead check that a CTA is visually present and consistent with the base creative.`;
  }
  const ctaText = input.derivation.ctaText ?? "none";
  return `The exact CTA, if present, must remain: ${ctaText}.`;
}

export function buildCreativeScorePrompt(input: AnalyzeInput): string {
  const format = input.derivation.format ?? "unknown";
  const generationMode = input.derivation.generationMode ?? "unknown";
  const creativeLevel = input.derivation.creativeLevel ?? "balanced";
  const ctaInstruction = buildCtaInstruction(input);

  const restylingScoringInstruction =
    input.contract?.generationMode === "restyling"
      ? `\nRestyling evaluation: The base image is the factual source. The informationPreservation dimension must verify facts against BASE IMAGE content only. Penalize if the output contains factual claims (price, brand name, offer, CTA text, course name, product name) that match the style reference rather than the base image. Score the informationPreservation dimension down if style-reference facts contaminate the output.`
      : "";

  const allowedEntities = resolveAllowedEntitiesForCampaign({
    name: input.campaign.name,
    client: input.campaign.client,
  });
  const allowedEntitiesInstruction = allowedEntities
    ? `\nFor briefMatch scoring: compare visible people, brands, products, and claims against the campaign allowed entity registry — people: ${allowedEntities.people.join(", ") || "none"}; brands: ${allowedEntities.brands.join(", ")}; products: ${allowedEntities.products.join(", ")}; claims: ${allowedEntities.claims.join(", ")}. Penalize briefMatch when the output depicts entities absent from this list.`
    : "";

  const rubricSection = buildObservableScoreRubricSection({
    generationMode: input.contract?.generationMode ?? input.derivation.generationMode ?? undefined,
    targetFormat: input.derivation.format ?? input.contract?.targetFormat ?? undefined,
    dominantIdea: input.contract?.canonicalCreative?.dominantIdea,
  });

  return `Evaluate the generated ad as a reviewer. Do not invent a new CTA.
${ctaInstruction}
The target format must remain: ${format}.
The generation mode must remain: ${generationMode}.
The creativity/variation level is: ${creativeLevel}.
Return only JSON with qualityScore, scoreBreakdown, scoreIssues, regenerationSuggestion.

Score breakdown dimensions (score key → canonical concern):
${scoreDimensionPromptLines()}

${buildScoreDimensionMapSection()}

Campaign context:
- Name: ${input.campaign.name}
- Client: ${input.campaign.client}
- Product: ${input.campaign.product}
- Offer: ${input.campaign.offer}
- Objective: ${input.campaign.objective}
- Audience: ${input.campaign.audience}
- Creative diagnosis / preservation checklist: ${JSON.stringify(input.derivation.creativeDiagnosis ?? null)}

Score each criterion from 0 to 100.
Provide 1-3 specific issues.

CONTRACT VIOLATIONS IN scoreIssues (required):
- Any violation of CTA semantics, brand/client, offer, or format layout from the creative contract MUST appear explicitly in scoreIssues (e.g. wrong CTA, brand mismatch, unsupported offer, invalid format layout).
- Do NOT let a high visualQuality or overall qualityScore hide contract violations — list them in scoreIssues even when the image looks polished.

CRITICAL INFORMATION PRESERVATION:
- Compare the output against the campaign context, exact CTA, offer, product/service, brand cues, and any creative diagnosis / preservation checklist.
- Penalize heavily if important text, offer, CTA, logo, product, badge, legal/small-print, face, or other information-bearing element appears cropped, hidden, truncated, blurred, overlapped, deleted, or too small to read.
- Penalize if the composition changed by merely cropping the source instead of rearranging elements into a deliberate layout.
- scoreBreakdown MUST include informationPreservation.

CRITICAL: scoreBreakdown MUST include variationLevelFit. Evaluate it as follows based on the selected creativity level:
- conservative: did the output preserve layout and recognizable structure? High score if nearly identical structure with minor changes.
- balanced: did it change composition or concept without losing campaign intent? High score if clearly a sibling creative.
- bold: did it change background and hierarchy while preserving core brand assets? High score if dramatically different but same campaign.
- extreme: did it create a fresh reading while preserving product, offer, CTA, and brand constraints? High score if almost unrecognizable side-by-side yet clearly same campaign independently.${allowedEntitiesInstruction}
${rubricSection}

The regenerationSuggestion must preserve the exact CTA text, format, and generation mode.${restylingScoringInstruction}`;
}

export async function analyzeDerivationCreative(input: AnalyzeInput): Promise<ScoreResult> {
  const base64 = input.imageBuffer.toString("base64");
  const dataUrl = `data:${input.mimeType};base64,${base64}`;

  const prompt = buildCreativeScorePrompt(input);

  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: "You are an expert creative director scoring ad creatives." },
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" }
        ],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const raw = extractOutputText(response);
  if (!raw) {
    throw new Error("Empty vision response for creative scoring");
  }

  const normalized = normalizeCreativeScoreResult(JSON.parse(raw));

  return {
    ...normalized,
    scoreStatus: normalized.scoreStatus === "failed" ? "failed" : "analyzed",
    regenerationSuggestion: buildRegenerationSuggestion({
      ctaText: input.derivation.ctaText,
      format: input.derivation.format,
      generationMode: input.derivation.generationMode,
      scoreIssues: normalized.scoreIssues,
      modelSuggestion:
        normalized.regenerationSuggestion || "Refine the creative while preserving the exact CTA text.",
      contract: input.contract ?? null,
    }),
  };
}

export type { BuildSuggestionInput } from "./regeneration-suggestion";
export { buildRegenerationSuggestion } from "./regeneration-suggestion";

export function buildHardFailureRegenerationSuggestion(input: {
  hardFailures: Array<{ code: CreativeHardFailureCode; message: string }>;
  contract: CreativeContract;
  scoreIssues?: string[];
  modelSuggestion?: string;
  qaChecklist?: Record<string, { status?: string; note?: string }> | null;
}): string {
  const brief = buildRegenerationCorrectionBrief({
    contract: input.contract,
    hardFailures: input.hardFailures,
    scoreIssues: input.scoreIssues,
    qaChecklist: input.qaChecklist,
    modelSuggestion: input.modelSuggestion,
  });
  return brief.promptFeedback;
}
