import { createHash } from "node:crypto";
import type { ClientOutputLearning } from "../../db/schema";
import { getCampaignById } from "../../repositories/campaign";
import { listOutputLearningsByClientProfile } from "../../repositories/client-output-learning";
import { weightedEvidenceCount } from "../confidence";
import { OutputLearningDomainError } from "../service";
import { normalizeScopeValue } from "../variable-value";
import type { OutputLearningConfidenceLevel, OutputSupportedVariableKey } from "../types";
import { OUTPUT_SUPPORTED_VARIABLE_KEYS } from "../types";
import { mapOutputLearningToPrefill } from "./map-prefill";
import {
  OUTPUT_LEARNING_ALGORITHM_VERSION,
  OUTPUT_PREFILL_VARIABLE_KEYS,
  type OutputAvoidPatternHint,
  type OutputLearningRecommendation,
  type OutputLearningRecommendationResult,
  type OutputPrefillVariableKey,
  type OutputRecommendationEvidenceSummary,
} from "./types";

export { OutputLearningDomainError };

const CONFIDENCE_WEIGHT: Record<OutputLearningConfidenceLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function isSupportedVariableKey(key: string): key is OutputSupportedVariableKey {
  return (OUTPUT_SUPPORTED_VARIABLE_KEYS as readonly string[]).includes(key);
}

function isPrefillVariableKey(key: string): key is OutputPrefillVariableKey {
  return (OUTPUT_PREFILL_VARIABLE_KEYS as readonly string[]).includes(key);
}

function matchesScope(
  learning: ClientOutputLearning,
  context: { generationMode?: string; format?: string }
): boolean {
  const scopedMode = learning.scopeGenerationMode.trim();
  const scopedFormat = learning.scopeFormat.trim();

  if (scopedMode) {
    const campaignMode = normalizeScopeValue(context.generationMode);
    if (campaignMode && scopedMode !== campaignMode) {
      return false;
    }
  }

  if (scopedFormat) {
    const campaignFormat = normalizeScopeValue(context.format);
    if (campaignFormat && scopedFormat !== campaignFormat) {
      return false;
    }
  }

  return true;
}

function scoreLearning(learning: ClientOutputLearning): number {
  const confidence = CONFIDENCE_WEIGHT[learning.confidence as OutputLearningConfidenceLevel];
  const sampleWeight = Math.log10(Math.max(learning.sampleEventCount, 1)) / 2;
  const contradictionPenalty =
    (learning.contradictingEvidence?.length ?? 0) > 0 ? 0.75 : 1;
  const supportWeight = weightedEvidenceCount(learning.supportingEvidence ?? []);

  return confidence * sampleWeight * contradictionPenalty * (0.5 + Math.min(supportWeight / 3, 1));
}

function toEvidenceSummary(learning: ClientOutputLearning): OutputRecommendationEvidenceSummary {
  return {
    learningId: learning.id,
    variableKey: learning.variableKey,
    variableValue: learning.variableValue,
    statement: learning.statement,
    confidence: learning.confidence as OutputLearningConfidenceLevel,
    preferenceDirection: learning.preferenceDirection as "prefer" | "avoid",
    supportingCount: learning.supportingEvidence?.length ?? 0,
    contradictingCount: learning.contradictingEvidence?.length ?? 0,
    scopeGenerationMode: learning.scopeGenerationMode,
    scopeFormat: learning.scopeFormat,
  };
}

function buildJustification(input: {
  primary: ClientOutputLearning;
  evidenceCount: number;
  hasContradictions: boolean;
}): string {
  const variableLabel =
    input.primary.variableKey === "cta"
      ? `priorizar o CTA "${input.primary.variableValue}"`
      : input.primary.variableKey === "format"
        ? `priorizar o formato ${input.primary.variableValue}`
        : input.primary.variableKey === "generation_mode"
          ? `usar o modo ${input.primary.variableValue}`
          : input.primary.variableKey === "style_policy"
            ? `aplicar política de estilo ${input.primary.variableValue}`
            : `considerar ${input.primary.variableKey}=${input.primary.variableValue}`;

  const contradictionNote = input.hasContradictions
    ? " Há evidências contraditórias — trate como hipótese, não como regra fixa."
    : "";

  return `Com base em ${input.evidenceCount} aprendizado(s) de output aprovado(s), recomendamos ${variableLabel} nesta campanha.${contradictionNote}`;
}

function buildRecommendationId(
  campaignId: string,
  primaryLearningId: string
): string {
  return createHash("sha256")
    .update(`${campaignId}:${primaryLearningId}:${OUTPUT_LEARNING_ALGORITHM_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

function collectAvoidPatterns(learnings: ClientOutputLearning[]): OutputAvoidPatternHint[] {
  return learnings
    .filter(
      (learning) =>
        learning.status === "approved" &&
        learning.variableKey === "avoid_pattern" &&
        learning.preferenceDirection === "avoid" &&
        (learning.supportingEvidence?.length ?? 0) > 0
    )
    .slice(0, 5)
    .map((learning) => ({
      pattern: learning.variableValue,
      statement: learning.statement,
      confidence: learning.confidence as OutputLearningConfidenceLevel,
    }));
}

export async function getOutputLearningRecommendation(input: {
  workspaceId: string;
  campaignId: string;
  generationMode?: string;
  format?: string;
}): Promise<OutputLearningRecommendationResult> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new OutputLearningDomainError("outputLearningCampaignNotFound", 404);
  }

  if (!campaign.clientProfileId) {
    return { status: "no_client_profile", recommendation: null };
  }

  const learnings = await listOutputLearningsByClientProfile(
    campaign.clientProfileId,
    input.workspaceId,
    { status: "approved" }
  );

  const scopeContext = {
    generationMode: input.generationMode ?? campaign.generationMode ?? undefined,
    format: input.format ?? campaign.targetFormats?.[0] ?? undefined,
  };

  const scoped = learnings.filter((learning) => matchesScope(learning, scopeContext));

  const eligible = scoped.filter(
    (learning) =>
      learning.preferenceDirection === "prefer" &&
      (learning.supportingEvidence?.length ?? 0) > 0 &&
      isSupportedVariableKey(learning.variableKey) &&
      isPrefillVariableKey(learning.variableKey)
  );

  if (eligible.length === 0) {
    return { status: "insufficient_evidence", recommendation: null };
  }

  const ranked = [...eligible].sort(
    (left, right) => scoreLearning(right) - scoreLearning(left)
  );
  const primary = ranked[0];
  const primaryVariableKey = primary.variableKey as OutputPrefillVariableKey;
  const evidence = ranked.slice(0, 3).map(toEvidenceSummary);
  const contradictions = primary.contradictingEvidence ?? [];
  const avoidPatterns = collectAvoidPatterns(scoped);

  const prefill = mapOutputLearningToPrefill({
    variableKey: primaryVariableKey,
    variableValue: primary.variableValue,
    existingCtas: campaign.ctaVariants ?? undefined,
  });

  const recommendation: OutputLearningRecommendation = {
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
    confidence: primary.confidence as OutputLearningConfidenceLevel,
    confidenceScore: String(primary.confidenceScore),
    sampleEventCount: primary.sampleEventCount,
    sampleCampaignCount: primary.sampleCampaignCount,
    evidence,
    contradictions,
    avoidPatterns,
    prefill,
    learningsSource: "postgres",
    algorithmVersion: OUTPUT_LEARNING_ALGORITHM_VERSION,
  };

  return { status: "ready", recommendation };
}
