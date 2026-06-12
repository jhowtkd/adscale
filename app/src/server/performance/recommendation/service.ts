import { createHash } from "node:crypto";
import { getCampaignById } from "../../repositories/campaign";
import { listCampaignLearnings, LearningDomainError } from "../learning/service";
import {
  LEARNING_ALGORITHM_VERSION,
  SUPPORTED_VARIABLE_KEYS,
  type LearningConfidenceLevel,
  type ResolvedPerformanceLearning,
  type SupportedVariableKey,
} from "../learning/types";
import { mapLearningToPrefill } from "./map-prefill";
import type {
  NextExperimentRecommendation,
  NextExperimentRecommendationResult,
  RecommendationEvidenceSummary,
} from "./types";

export { LearningDomainError };

const CONFIDENCE_WEIGHT: Record<LearningConfidenceLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function isSupportedVariableKey(key: string): key is SupportedVariableKey {
  return (SUPPORTED_VARIABLE_KEYS as readonly string[]).includes(key);
}

function scoreLearning(learning: ResolvedPerformanceLearning): number {
  const confidence = CONFIDENCE_WEIGHT[learning.confidence];
  const sampleWeight = Math.log10(Math.max(learning.sampleImpressions, 1)) / 4;
  const contradictionPenalty =
    learning.contradictingEvidence.length > 0 ? 0.75 : 1;
  const relevance = learning.relevance ?? 0.5;

  return confidence * sampleWeight * contradictionPenalty * (0.5 + relevance);
}

function toEvidenceSummary(
  learning: ResolvedPerformanceLearning
): RecommendationEvidenceSummary {
  return {
    learningId: learning.id,
    variableKey: learning.variableKey,
    variableValue: learning.variableValue,
    statement: learning.statement,
    confidence: learning.confidence,
    supportingCount: learning.supportingEvidence.length,
    contradictingCount: learning.contradictingEvidence.length,
  };
}

function buildJustification(input: {
  primary: ResolvedPerformanceLearning;
  evidenceCount: number;
  hasContradictions: boolean;
}): string {
  const metric = input.primary.primaryMetric.toUpperCase();
  const direction =
    input.primary.expectedDirection === "decrease" ? "reduzir" : "aumentar";

  const variableLabel =
    input.primary.variableKey === "cta"
      ? `testar o CTA "${input.primary.variableValue}"`
      : input.primary.variableKey === "format"
        ? `priorizar o formato ${input.primary.variableValue}`
        : input.primary.variableKey === "recipe"
          ? `usar a receita ${input.primary.variableValue}`
          : `explorar o estilo ${input.primary.variableValue}`;

  const contradictionNote = input.hasContradictions
    ? " Há evidências contraditórias — trate como hipótese, não como regra fixa."
    : "";

  return `Com base em ${input.evidenceCount} aprendizado(s) aprovado(s), recomendamos ${variableLabel} para ${direction} ${metric} nesta campanha.${contradictionNote}`;
}

function buildRecommendationId(
  campaignId: string,
  primaryLearningId: string
): string {
  return createHash("sha256")
    .update(`${campaignId}:${primaryLearningId}:${LEARNING_ALGORITHM_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

export async function getNextExperimentRecommendation(input: {
  workspaceId: string;
  campaignId: string;
}): Promise<NextExperimentRecommendationResult> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new LearningDomainError("learningCampaignNotFound", 404);
  }

  if (!campaign.clientProfileId) {
    return { status: "no_client_profile", recommendation: null };
  }

  const learningsResult = await listCampaignLearnings({
    workspaceId: input.workspaceId,
    campaignId: input.campaignId,
  });

  const eligible = learningsResult.learnings.filter(
    (learning) =>
      learning.status === "approved" &&
      learning.supportingEvidence.length > 0 &&
      isSupportedVariableKey(learning.variableKey)
  );

  if (eligible.length === 0) {
    return { status: "insufficient_evidence", recommendation: null };
  }

  const ranked = [...eligible].sort(
    (left, right) => scoreLearning(right) - scoreLearning(left)
  );
  const primary = ranked[0];
  const primaryVariableKey = primary.variableKey as SupportedVariableKey;
  const evidence = ranked.slice(0, 3).map(toEvidenceSummary);
  const contradictions = primary.contradictingEvidence;

  const prefill = mapLearningToPrefill({
    variableKey: primaryVariableKey,
    variableValue: primary.variableValue,
    existingCtas: campaign.ctaVariants ?? undefined,
  });

  const recommendation: NextExperimentRecommendation = {
    id: buildRecommendationId(input.campaignId, primary.id),
    campaignId: input.campaignId,
    clientProfileId: campaign.clientProfileId,
    primaryVariableKey,
    primaryVariableValue: primary.variableValue,
    justification: buildJustification({
      primary,
      evidenceCount: eligible.length,
      hasContradictions: contradictions.length > 0,
    }),
    confidence: primary.confidence,
    confidenceScore: primary.confidenceScore,
    sampleImpressions: primary.sampleImpressions,
    sampleCampaignCount: primary.sampleCampaignCount,
    evidence,
    contradictions,
    prefill,
    learningsSource: learningsResult.source,
    algorithmVersion: LEARNING_ALGORITHM_VERSION,
  };

  return { status: "ready", recommendation };
}
