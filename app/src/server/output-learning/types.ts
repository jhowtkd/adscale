export const OUTPUT_LEARNING_ALGORITHM_VERSION = "1.0.0";

export const OUTPUT_LEARNING_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type OutputLearningConfidenceLevel =
  (typeof OUTPUT_LEARNING_CONFIDENCE_LEVELS)[number];

export const OUTPUT_LEARNING_STATUSES = [
  "draft",
  "approved",
  "superseded",
  "removed",
] as const;
export type OutputLearningStatus = (typeof OUTPUT_LEARNING_STATUSES)[number];

export const OUTPUT_SUPPORTED_VARIABLE_KEYS = [
  "cta",
  "generation_mode",
  "format",
  "style_policy",
  "avoid_pattern",
  "creative_level",
] as const;
export type OutputSupportedVariableKey =
  (typeof OUTPUT_SUPPORTED_VARIABLE_KEYS)[number];

export type OutputEvidencePolarity = "supporting" | "contradicting";

export interface OutputLearningEvidenceRef {
  eventId: string;
  campaignId: string;
  derivationId: string;
  action: string;
  direction: string;
  strength: string;
  variableKey: string;
  variableValue: string;
  polarity: OutputEvidencePolarity;
  generationMode: string | null;
  format: string | null;
  reasonCode: string | null;
  recordedAt: string;
}

export interface DerivedOutputLearningDraft {
  variableKey: string;
  variableValue: string;
  scopeGenerationMode: string;
  scopeFormat: string;
  preferenceDirection: "prefer" | "avoid";
  statement: string;
  confidence: OutputLearningConfidenceLevel;
  confidenceScore: string;
  sampleEventCount: number;
  sampleCampaignCount: number;
  supportingEvidence: OutputLearningEvidenceRef[];
  contradictingEvidence: OutputLearningEvidenceRef[];
  lastEvidenceAt: Date | null;
  status: OutputLearningStatus;
}

export interface ResolvedOutputLearning extends DerivedOutputLearningDraft {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  algorithmVersion: string;
  mem0MemoryId: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
