import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "../../db/schema";
import type { HumanQualityFailureReason } from "../corpus";
import type { HumanQualitySourceLabel } from "../corpus";

export interface EvaluatedCorpusRow {
  item: HumanQualityCorpusItem;
  evaluation: HumanQualityEvaluation;
  sourceLabel?: HumanQualitySourceLabel;
  feedbackArtifactId?: string;
}

export interface CalibrationComparison {
  corpusItemId: string;
  derivationId: string;
  generationMode: string;
  format: string;
  cohort: string;
  automaticQualityScore: number | null;
  humanVisualScore: number;
  scoreDelta: number | null;
  absError: number | null;
  primaryFailureReason: HumanQualityFailureReason;
  factualPass: boolean;
  qualityVerdict: string | null;
  hardFailureCodes: string[];
}

export interface CalibrationAdjustmentEvidenceItemRef {
  corpusItemId: string;
  scoreDelta: number | null;
}

export interface CalibrationAdjustmentEvidence {
  corpusItemIds: string[];
  sliceStats: {
    count: number;
    meanSignedDelta: number;
    meanAbsError: number | null;
  };
  itemRefs: CalibrationAdjustmentEvidenceItemRef[];
  fixtureOnly?: boolean;
  supportingClientRuleIds?: string[];
  primaryFailureReason?: string;
  promotionSource?: "cross_client";
}

export interface ClientLearningProposalEvidence {
  corpusItemIds: string[];
  artifactIds?: string[];
  fixtureOnly?: boolean;
  stats: {
    count: number;
    meanSignedDelta: number | null;
    meanAbsError: number | null;
    overScoreCount: number;
    underScoreCount: number;
  };
}

export interface FactualIssueAlertEvidence {
  corpusItemIds: string[];
  artifactIds?: string[];
  stats: {
    count: number;
    meanSignedDelta: number | null;
    meanAbsError: number | null;
    overScoreCount: number;
    underScoreCount: number;
  };
}

export interface FactualIssueAlert {
  workspaceId: string;
  clientProfileId: string;
  sliceKey: string;
  evidenceRefs: FactualIssueAlertEvidence;
  rationale: "factual_guard_review_required";
}
