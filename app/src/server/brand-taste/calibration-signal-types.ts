/**
 * Canonical calibration signal contract for human judgment events.
 * Calibration signals are durable teaching events — not disposable reviews.
 */

export const HUMAN_CALIBRATION_VERDICTS = [
  "entra",
  "quase",
  "nao_entra",
] as const;

export type HumanCalibrationVerdict = (typeof HUMAN_CALIBRATION_VERDICTS)[number];

export const CALIBRATION_SOURCE_LABELS = [
  "synthetic_fixture",
  "operator_imported",
  "real_customer",
] as const;

export type CalibrationSourceLabel = (typeof CALIBRATION_SOURCE_LABELS)[number];

export const CALIBRATION_MISMATCH_BUCKETS = [
  "system_too_permissive",
  "system_too_harsh",
  "voice_nuance",
  "export_setup_issue",
  "acceptable_override",
  "unclear_sample",
] as const;

export type CalibrationMismatchBucket = (typeof CALIBRATION_MISMATCH_BUCKETS)[number];

export const EVIDENCE_LEVELS = [
  "uncalibrated",
  "seed_calibrated",
  "assisted",
  "evidence_backed",
] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const RULE_CATEGORIES = [
  "figure",
  "gestalt",
  "hierarchy",
  "voice",
  "invite",
  "export_conflict",
  "brand_nuance",
] as const;

export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const RULE_STATUSES = ["candidate", "approved", "rejected", "deprecated"] as const;

export type RuleStatus = (typeof RULE_STATUSES)[number];

export interface CalibrationSignalPayload {
  workspaceId: string;
  clientProfileId: string | null;
  campaignId: string;
  derivationId: string;
  outputDecisionEventId: string | null;
  humanVerdict: HumanCalibrationVerdict;
  systemOlharVerdict: string | null;
  systemExportStatus: string | null;
  mismatchBucket: CalibrationMismatchBucket | null;
  sourceLabel: CalibrationSourceLabel;
  reviewerId: string;
  reviewedAt: string;
  sanitizedNote: string | null;
  idempotencyKey: string | null;
}

export interface BrandTastePattern {
  verdict: HumanCalibrationVerdict;
  mismatchBucket: CalibrationMismatchBucket | null;
  count: number;
  sampleDerivationIds: string[];
  rationale: string;
}

export interface BrandTasteProfile {
  clientProfileId: string;
  workspaceId: string;
  evidenceLevel: EvidenceLevel;
  sourceComposition: Record<CalibrationSourceLabel, number>;
  positivePatterns: BrandTastePattern[];
  rejectionPatterns: BrandTastePattern[];
  quasePatterns: BrandTastePattern[];
  decisionCount: number;
  comparableCount: number;
  generatedAt: string;
  caveats: string[];
}

export interface CalibrationRuleCandidate {
  id: string;
  clientProfileId: string;
  category: RuleCategory;
  status: RuleStatus;
  rationale: string;
  supportingDecisionIds: string[];
  confidence: "low" | "medium" | "high";
  caveats: string[];
  version: number;
  mismatchBucket: CalibrationMismatchBucket | null;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface UncertaintyReason {
  code:
    | "low_sample"
    | "new_brand"
    | "rule_conflict"
    | "disagreement_history"
    | "high_impact_export"
    | "low_confidence";
  message: string;
}

export interface JudgmentUncertainty {
  score: number;
  level: "low" | "medium" | "high";
  reasons: UncertaintyReason[];
  requiresHumanReview: boolean;
}
