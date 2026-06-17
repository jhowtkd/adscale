import type { EvaluatedCorpusRow } from "../calibration/types";
import type {
  HumanQualityQualitySnapshot,
  OutputLearningApplicationResolution,
  OutputLearningApplicationSnapshot,
} from "../corpus";

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

export function resolveLearningApplied(
  snapshot: HumanQualityQualitySnapshot & {
    outputLearningApplication?: OutputLearningApplicationSnapshot;
  }
): boolean {
  return snapshot.outputLearningApplication?.applied === true;
}

function readQualitySnapshot(
  row: EvaluatedCorpusRow
): HumanQualityQualitySnapshot | null {
  const raw = row.item.qualitySnapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as HumanQualityQualitySnapshot;
}

export function buildImpactRow(row: EvaluatedCorpusRow): ImpactEvaluatedRow {
  const qualitySnapshot = readQualitySnapshot(row);
  const application = qualitySnapshot?.outputLearningApplication;

  return {
    corpusItemId: row.item.id,
    clientProfileId: row.item.clientProfileId,
    generationMode: row.item.generationMode,
    format: row.item.format,
    cohort: row.item.cohort,
    learningApplied: application?.applied === true,
    applicationResolution: application?.resolution ?? "not_recorded",
    visualScore: row.evaluation.visualScore,
    factualPass: row.evaluation.factualPass,
    intent: row.evaluation.intent,
  };
}
