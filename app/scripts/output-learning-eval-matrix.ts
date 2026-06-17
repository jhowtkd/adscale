/**
 * Fixed evaluation matrix for v12.4 output learning pipeline (EVAL-01).
 * Single source of truth for release-gate evidence and pipeline eval tests.
 */

export const OUTPUT_LEARNING_EVAL_MATRIX_VERSION = 1;

/** Quality improvement signals — separate from factual fidelity (EVAL-02). */
export type OutputLearningEvalCategory = "quality_signal" | "factual_integrity";

export type OutputLearningEvalStage =
  | "capture"
  | "aggregate"
  | "recommend"
  | "safety"
  | "pipeline";

export type OutputLearningQualitySignal =
  | "approval_learning"
  | "rejection_learning"
  | "regeneration_signal"
  | "recommendation_prefill"
  | "contradiction_handling";

export type OutputLearningFactualExpectation =
  | "guards_active"
  | "postgres_only"
  | "avoid_hint_only";

export interface OutputLearningEvalScenario {
  key: string;
  description: string;
  category: OutputLearningEvalCategory;
  stage: OutputLearningEvalStage;
  qualitySignal?: OutputLearningQualitySignal;
  factualExpectation?: OutputLearningFactualExpectation;
}

const MATRIX: OutputLearningEvalScenario[] = [
  {
    key: "pipeline:cta-approval-aggregate",
    description: "Approval events aggregate into scoped CTA learning with supporting evidence",
    category: "quality_signal",
    stage: "pipeline",
    qualitySignal: "approval_learning",
  },
  {
    key: "pipeline:rejection-avoid-pattern",
    description: "Rejection hard failures produce avoid_pattern learning from reason codes",
    category: "quality_signal",
    stage: "pipeline",
    qualitySignal: "rejection_learning",
  },
  {
    key: "pipeline:regeneration-corrective",
    description: "Regeneration events capture corrective signals tied to prior failures",
    category: "quality_signal",
    stage: "pipeline",
    qualitySignal: "regeneration_signal",
  },
  {
    key: "pipeline:contradicting-superseded",
    description: "Contradicting rejection evidence supersedes prior approval learning",
    category: "quality_signal",
    stage: "pipeline",
    qualitySignal: "contradiction_handling",
  },
  {
    key: "pipeline:recommend-prefill-cta",
    description: "Top approved CTA learning ranks into bounded generation prefill packet",
    category: "quality_signal",
    stage: "pipeline",
    qualitySignal: "recommendation_prefill",
  },
  {
    key: "safety:restyling-format-block",
    description: "Restyling campaigns block format_adaptation prefill from learnings",
    category: "factual_integrity",
    stage: "safety",
    factualExpectation: "guards_active",
  },
  {
    key: "safety:postgres-approved-only",
    description: "Draft and superseded learnings excluded before recommendation ranking",
    category: "factual_integrity",
    stage: "safety",
    factualExpectation: "postgres_only",
  },
  {
    key: "safety:avoid-pattern-hint-only",
    description: "avoid_pattern entries appear in trace but never mutate prefill",
    category: "factual_integrity",
    stage: "safety",
    factualExpectation: "avoid_hint_only",
  },
];

export const OUTPUT_LEARNING_EVAL_MATRIX = MATRIX;

export function evalMatrixKeys(): string[] {
  return MATRIX.map((row) => row.key);
}

export function evalScenarioByKey(key: string): OutputLearningEvalScenario | undefined {
  return MATRIX.find((row) => row.key === key);
}

export function qualitySignalScenarios(): OutputLearningEvalScenario[] {
  return MATRIX.filter((row) => row.category === "quality_signal");
}

export function factualIntegrityScenarios(): OutputLearningEvalScenario[] {
  return MATRIX.filter((row) => row.category === "factual_integrity");
}

/** Minimum pass rate for quality improvement path scenarios (EVAL-01). */
export const QUALITY_IMPROVEMENT_PATH_THRESHOLD = 1;

/** Minimum pass rate for factual integrity scenarios (EVAL-03). */
export const FACTUAL_INTEGRITY_THRESHOLD = 1;
