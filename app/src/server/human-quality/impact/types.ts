import type { OutputLearningApplicationResolution } from "../corpus";
import type { SampleGuidance } from "../sampling/types";

export const LEARNING_IMPACT_VERSION = "1.0.0";

export interface ImpactEvaluatedRow {
  corpusItemId: string;
  clientProfileId: string;
  generationMode: string;
  format: string;
  cohort: string;
  learningApplied: boolean;
  applicationResolution: OutputLearningApplicationResolution;
  visualScore: number;
  factualPass: boolean;
  intent: string;
}

export interface ImpactSliceKey {
  clientProfileId: string;
  generationMode: string;
  format: string;
}

export interface ImpactArmMetrics {
  count: number;
  meanVisualScore: number | null;
  rejectIntentRate: number | null;
  regenerateIntentRate: number | null;
  factualPassRate: number | null;
}

export interface ImpactSliceComparison {
  sliceKey: string;
  learned: ImpactArmMetrics;
  nonLearned: ImpactArmMetrics;
  visualScoreDelta: number | null;
  comparability: "ok" | "insufficient";
}

export interface LearningImpactMetrics {
  learnedCount: number;
  nonLearnedCount: number;
  unlabeledCount: number;
  slices: ImpactSliceComparison[];
  globalVisualScoreDelta: number | null;
}

export interface LearningImpactIntentMetrics {
  learned: { rejectRate: number | null; regenerateRate: number | null };
  nonLearned: { rejectRate: number | null; regenerateRate: number | null };
}

export interface LearningImpactVisualMovementMetrics {
  learnedMeanVisualScore: number | null;
  nonLearnedMeanVisualScore: number | null;
  deltaLearnedMinusNonLearned: number | null;
  cohortMovement?: {
    preLearningMean: number | null;
    postLearningMean: number | null;
    deltaPostMinusPre: number | null;
  };
}

export interface LearningImpactFactualMetrics {
  learnedFactualPassRate: number | null;
  nonLearnedFactualPassRate: number | null;
}

export interface LearningImpactReport {
  schemaVersion: 1;
  learningImpactVersion: string;
  capturedAt: string;
  status: "ok" | "insufficient_sample";
  evaluatedItemCount: number;
  insufficientReasons: string[];
  sampleGuidance: SampleGuidance[];
  learningImpactMetrics: LearningImpactMetrics;
  intentMetrics: LearningImpactIntentMetrics;
  visualMovementMetrics: LearningImpactVisualMovementMetrics;
  factualMetrics: LearningImpactFactualMetrics;
  rows: ImpactEvaluatedRow[];
}

export interface BuildImpactRowsResult {
  rows: ImpactEvaluatedRow[];
  unlabeledCount: number;
}

export function buildImpactSliceKey(
  row: Pick<ImpactEvaluatedRow, "clientProfileId" | "generationMode" | "format">
): string {
  return `${row.clientProfileId}|${row.generationMode}|${row.format}`;
}
