export const LEARNING_ALGORITHM_VERSION = "1.0.0";

export const LEARNING_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type LearningConfidenceLevel = (typeof LEARNING_CONFIDENCE_LEVELS)[number];

export const LEARNING_STATUSES = ["draft", "approved", "superseded", "removed"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export const SUPPORTED_VARIABLE_KEYS = ["cta", "format", "recipe", "style"] as const;
export type SupportedVariableKey = (typeof SUPPORTED_VARIABLE_KEYS)[number];

export type EvidencePolarity = "supporting" | "contradicting";

export interface LearningEvidenceRef {
  comparisonId: string;
  hypothesisId: string | null;
  campaignId: string;
  campaignName?: string | null;
  derivationId: string;
  variableKey: string;
  variableValue: string;
  polarity: EvidencePolarity;
  outcome: string | null;
  verdict: string;
  primaryMetric: string;
  impressions: number;
  platform: string | null;
  objective: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  recordedAt: string;
}

export interface DerivedLearningDraft {
  variableKey: string;
  variableValue: string;
  primaryMetric: string;
  expectedDirection: "increase" | "decrease" | null;
  statement: string;
  confidence: LearningConfidenceLevel;
  confidenceScore: string;
  sampleImpressions: number;
  sampleCampaignCount: number;
  contextPlatforms: string[];
  contextObjectives: string[];
  supportingEvidence: LearningEvidenceRef[];
  contradictingEvidence: LearningEvidenceRef[];
  lastEvidenceAt: Date | null;
  status: LearningStatus;
}

export interface ResolvedPerformanceLearning extends DerivedLearningDraft {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  algorithmVersion: string;
  mem0MemoryId: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  relevance?: number;
}
