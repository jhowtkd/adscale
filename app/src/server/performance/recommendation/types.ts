import type { StrategyRecipeId } from "@/server/ai/strategy-recipes";
import type {
  LearningConfidenceLevel,
  LearningEvidenceRef,
  SupportedVariableKey,
} from "../learning/types";

export interface RecommendationEvidenceSummary {
  learningId: string;
  variableKey: string;
  variableValue: string;
  statement: string;
  confidence: LearningConfidenceLevel;
  supportingCount: number;
  contradictingCount: number;
}

export interface NextExperimentPrefill {
  recipeId: StrategyRecipeId;
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  ctaVariants: string[];
  targetFormats?: string[];
}

export interface NextExperimentRecommendation {
  id: string;
  campaignId: string;
  clientProfileId: string;
  primaryVariableKey: SupportedVariableKey;
  primaryVariableValue: string;
  justification: string;
  confidence: LearningConfidenceLevel;
  confidenceScore: string;
  sampleImpressions: number;
  sampleCampaignCount: number;
  evidence: RecommendationEvidenceSummary[];
  contradictions: LearningEvidenceRef[];
  prefill: NextExperimentPrefill;
  learningsSource: "mem0" | "postgres";
  algorithmVersion: string;
}

export type RecommendationStatus =
  | "ready"
  | "insufficient_evidence"
  | "no_client_profile";

export interface NextExperimentRecommendationResult {
  status: RecommendationStatus;
  recommendation: NextExperimentRecommendation | null;
}
