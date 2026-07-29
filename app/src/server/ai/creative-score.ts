import { z } from "zod";
import { env } from "@/server/validation/env";
import { getOpenAI, extractOutputText } from "./utils";
import type { CreativeContract } from "./creative-contract";
import type { CreativeHardFailureCode } from "./creative-quality-gate";
import { SCORE_BREAKDOWN_TO_CRITERION } from "./creative-quality-taxonomy";
import { resolveAllowedEntitiesForCampaign } from "./creative-corpus";
import { buildObservableScoreRubricSection } from "./observable-rubric";

import {
  buildCtaScoringInstruction,
  buildRegenerationPreservationInstruction,
  resolveContractPolicy,
} from "./canonical-creative-contract";
import { buildRegenerationSuggestion } from "./regeneration-suggestion";
import { buildRegenerationCorrectionBrief } from "./regeneration-correction-brief";
import type { OlharVerdictValue } from "./olhar/dual-verdict";
import {
  createE2EControlledScore,
  isE2EControlledProviderEnabled,
} from "./providers/e2e-controlled-provider";

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
  olharVerdict?: OlharVerdictValue | null;
  whatWorks?: string[];
  whatBlocks?: string[];
  directionNote?: string | null;
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

const OLHAR_VERDICT_VALUES = new Set<OlharVerdictValue>([
  "pronta",
  "quase",
  "sem_opiniao",
  "confusa",
]);

const rawScoreJsonSchema = z.object({
  qualityScore: z.unknown().optional(),
  scoreBreakdown: z.record(z.unknown()).optional(),
  scoreIssues: z.unknown().optional(),
  regenerationSuggestion: z.unknown().optional(),
  olharVerdict: z.unknown().optional(),
  whatWorks: z.unknown().optional(),
  whatBlocks: z.unknown().optional(),
  directionNote: z.unknown().optional(),
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

function asDirectionStringList(value: unknown, max = 3): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

function parseOlharVerdict(value: unknown): OlharVerdictValue | null {
  if (typeof value !== "string") {
    return null;
  }
  return OLHAR_VERDICT_VALUES.has(value as OlharVerdictValue)
    ? (value as OlharVerdictValue)
    : null;
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

  const directionNote =
    typeof input.directionNote === "string" && input.directionNote.trim().length > 0
      ? input.directionNote.trim()
      : null;

  return {
    qualityScore,
    scoreStatus,
    scoreBreakdown: breakdown,
    scoreIssues: asScoreIssues(input.scoreIssues),
    regenerationSuggestion,
    olharVerdict: parseOlharVerdict(input.olharVerdict),
    whatWorks: asDirectionStringList(input.whatWorks),
    whatBlocks: asDirectionStringList(input.whatBlocks),
    directionNote,
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

export function buildCreativeScoreImageDataUrl(input: Pick<AnalyzeInput, "imageBuffer" | "mimeType">): string {
  return `data:${input.mimeType};base64,${input.imageBuffer.toString("base64")}`;
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
  const contract = input.contract;
  if (!contract) {
    const ctaText = input.derivation.ctaText ?? "none";
    return `CTA policy: optional. If rendered, preserve action intent for "${ctaText}" without requiring literal wording.`;
  }
  return buildCtaScoringInstruction(contract);
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

  const policy = input.contract
    ? resolveContractPolicy(input.contract)
    : resolveContractPolicy({
        generationMode:
          (input.derivation.generationMode as CreativeContract["generationMode"]) ??
          "art_variation",
        targetFormat: input.derivation.format ?? "unknown",
        ctaSemantics: { kind: "inherited" },
        baseAssetId: null,
        styleAssetId: null,
        client: null,
        product: null,
        offer: null,
        constraints: null,
        creativeLevel:
          (input.derivation.creativeLevel as CreativeContract["creativeLevel"]) ?? "balanced",
      });

  return `Evaluate the generated ad as an art director first, then as an analytics reviewer.

PRIMARY OUTPUT (art direction — leads regeneration and human review):
- directionNote: one concise note on figure, gestalt, voice, and invite at thumbnail scale.
- whatWorks: 1-3 short strengths (art direction only).
- whatBlocks: 1-3 art-direction blockers (not export/CTA compliance — those belong in scoreIssues).
- olharVerdict: one of pronta, quase, sem_opiniao, confusa — art-direction readiness only.

SECONDARY / INTERNAL ANALYTICS (backward compatibility — do not treat as the primary judgment):
- qualityScore: 0-100 aggregate for analytics dashboards only; secondary to olharVerdict and directionNote.
- scoreBreakdown: per-dimension telemetry; internal compatibility field.

Return only JSON with directionNote, whatWorks, whatBlocks, olharVerdict, qualityScore, scoreBreakdown, scoreIssues, regenerationSuggestion.

Do not invent a new CTA.
${ctaInstruction}
The target format must remain: ${format}.
The generation mode must remain: ${generationMode}.
The creativity/variation level is: ${creativeLevel}.

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
- List objective integrity defects only: wrong brand/client, unsupported offer or claim, invented factual entity, severe cropping of rendered factual elements, invalid target format layout, or style-reference factual contamination.
- CTA absence, paraphrase, prominence, whitespace, zone count, and thumbnail legibility are ranking guidance — do not treat them as contract violations.
- Do NOT let a high visualQuality or overall qualityScore hide objective integrity defects.

CRITICAL INFORMATION PRESERVATION:
- Compare the output against campaign facts, offer, product/service, brand cues, and any creative diagnosis / preservation checklist.
- Penalize heavily only when rendered factual elements (price, brand, product, offer claims, logo, legal facts, faces tied to the campaign) are cropped, hidden, truncated, deleted, or replaced with invented facts.
- CTA wording may change; CTA display is optional under policy (${policy.cta.presence}, ${policy.cta.wording}).
- Penalize if the composition changed by merely cropping the source instead of rearranging elements into a deliberate layout.
- scoreBreakdown MUST include informationPreservation.

CRITICAL: scoreBreakdown MUST include variationLevelFit. Evaluate whether the output sits inside the requested fidelity band (${policy.fidelityLevel}):
- conservative: did the output preserve layout and recognizable structure? High score if nearly identical structure with minor changes.
- balanced: did it change composition or concept without losing campaign intent? High score if clearly a sibling creative.
- bold: did it change background and hierarchy while preserving core brand assets? High score if dramatically different but same campaign.
- extreme: did it create a fresh reading while preserving core campaign anchors? High score if almost unrecognizable side-by-side yet clearly same campaign independently.${allowedEntitiesInstruction}
${rubricSection}

${buildRegenerationPreservationInstruction(
  input.contract ?? {
    generationMode: policy.generationMode,
    targetFormat: format,
    ctaSemantics: input.derivation.ctaText
      ? { kind: "explicit", text: input.derivation.ctaText }
      : { kind: "inherited" },
    baseAssetId: null,
    styleAssetId: null,
    client: input.campaign.client,
    product: input.campaign.product,
    offer: input.campaign.offer,
    constraints: null,
    creativeLevel: policy.fidelityLevel,
    policy,
  },
  policy
)}.${restylingScoringInstruction}`;
}

export async function analyzeDerivationCreative(input: AnalyzeInput): Promise<ScoreResult> {
  if (isE2EControlledProviderEnabled()) {
    return createE2EControlledScore();
  }

  const prompt = buildCreativeScorePrompt(input);

  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: "You are an expert creative director scoring ad creatives." },
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: buildCreativeScoreImageDataUrl(input),
            detail: "high",
          }
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
        normalized.regenerationSuggestion || "Refine the creative while preserving campaign facts and format.",
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
