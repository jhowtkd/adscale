import type { StrategyRecipeId } from "@/server/ai/strategy-recipes";
import type {
  OutputLearningConfidenceLevel,
  OutputLearningEvidenceRef,
  OutputSupportedVariableKey,
} from "../types";
import { OUTPUT_LEARNING_ALGORITHM_VERSION } from "../types";

export { OUTPUT_LEARNING_ALGORITHM_VERSION };

export interface OutputRecommendationEvidenceSummary {
  learningId: string;
  variableKey: string;
  variableValue: string;
  statement: string;
  confidence: OutputLearningConfidenceLevel;
  preferenceDirection: "prefer" | "avoid";
  supportingCount: number;
  contradictingCount: number;
  scopeGenerationMode: string;
  scopeFormat: string;
}

export interface OutputGenerationPrefill {
  recipeId: StrategyRecipeId;
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  ctaVariants: string[];
  targetFormats?: string[];
}

export interface OutputAvoidPatternHint {
  pattern: string;
  statement: string;
  confidence: OutputLearningConfidenceLevel;
}

export interface OutputLearningRecommendation {
  id: string;
  campaignId: string;
  clientProfileId: string;
  primaryVariableKey: OutputSupportedVariableKey;
  primaryVariableValue: string;
  justification: string;
  confidence: OutputLearningConfidenceLevel;
  confidenceScore: string;
  sampleEventCount: number;
  sampleCampaignCount: number;
  evidence: OutputRecommendationEvidenceSummary[];
  contradictions: OutputLearningEvidenceRef[];
  avoidPatterns: OutputAvoidPatternHint[];
  prefill: OutputGenerationPrefill;
  learningsSource: "postgres";
  algorithmVersion: string;
}

export type OutputRecommendationStatus =
  | "ready"
  | "insufficient_evidence"
  | "no_client_profile";

export interface OutputLearningRecommendationResult {
  status: OutputRecommendationStatus;
  recommendation: OutputLearningRecommendation | null;
}

export const OUTPUT_PREFILL_VARIABLE_KEYS = [
  "cta",
  "generation_mode",
  "format",
  "style_policy",
] as const;

export type OutputPrefillVariableKey =
  (typeof OUTPUT_PREFILL_VARIABLE_KEYS)[number];
