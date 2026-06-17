import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "../../db/schema";
import type { HumanQualityFailureReason } from "../corpus";

export interface EvaluatedCorpusRow {
  item: HumanQualityCorpusItem;
  evaluation: HumanQualityEvaluation;
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
}
