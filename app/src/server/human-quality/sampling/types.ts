export type SampleGate =
  | "calibration_global"
  | "calibration_slice"
  | "impact_global"
  | "impact_slice_arm"
  | "quality_improvement_reason"
  | "trend_global"
  | "trend_time_buckets";

export type EvidenceSource =
  | "live_human_corpus"
  | "deterministic_fixture"
  | "accepted_caveat"
  | "technical_gate";

export interface SampleGuidance {
  gate: SampleGate;
  sliceKey?: string;
  arm?: "learned" | "non_learned" | "before" | "after";
  dimension?: string;
  currentCount: number;
  requiredCount: number;
  additionalNeeded: number;
  blockedClaim: string;
}

export type SamplingStatus = "ok" | "insufficient_sample";

export type CalibrationSamplingStatus = "ok" | "insufficient_corpus";
