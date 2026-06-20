export {
  HUMAN_CALIBRATION_VERDICTS,
  CALIBRATION_SOURCE_LABELS,
  CALIBRATION_MISMATCH_BUCKETS,
  EVIDENCE_LEVELS,
  RULE_CATEGORIES,
  RULE_STATUSES,
} from "./calibration-signal-types";

export type {
  HumanCalibrationVerdict,
  CalibrationSourceLabel,
  CalibrationMismatchBucket,
  EvidenceLevel,
  RuleCategory,
  RuleStatus,
  CalibrationSignalPayload,
  BrandTasteProfile,
  BrandTastePattern,
  CalibrationRuleCandidate,
  JudgmentUncertainty,
  UncertaintyReason,
} from "./calibration-signal-types";

export {
  buildCalibrationSignalFromOutputDecisionEvent,
  buildCalibrationIdempotencyKey,
  humanVerdictFromOutputDecisionEvent,
  sanitizeCalibrationNote,
  validateCalibrationSignalPayload,
} from "./calibration-signal";

export {
  recordCalibrationSignal,
  recordCalibrationSignalFromOutputDecisionEvent,
} from "./calibration-signal-recorder";

export {
  buildBrandTasteProfile,
  computeEvidenceLevel,
  computeSourceComposition,
  buildEvidenceCaveats,
} from "./taste-profile";

export {
  extractRuleCandidatesFromSignals,
  canPromoteRuleToApproved,
  ruleConstraintText,
} from "./rule-extraction";

export {
  persistRuleCandidate,
  approveCalibrationRule,
  rejectCalibrationRule,
  deprecateCalibrationRule,
  getApprovedRuleConstraints,
  mapRuleRowToCandidate,
} from "./calibration-rules";

export {
  buildBrandTastePromptSection,
  applyBrandTasteToVerdictExplanation,
  selectApplicableRules,
  mergeOlharAndBrandTasteSections,
} from "./taste-application";

export {
  classifyJudgmentUncertainty,
  buildReviewQueue,
  shouldSkipHumanReview,
} from "./uncertainty-queue";

export {
  buildCalibrationEvidenceReport,
  computeAgreementRate,
  evaluateClaimsMatrix,
  buildBrandProfilesFromSignals,
} from "./calibration-evidence";
