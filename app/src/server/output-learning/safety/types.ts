import type { OutputLearningConfidenceLevel } from "../types";

export const OUTPUT_LEARNING_SAFETY_VERSION = "1.0.0";

/** Postgres approved rows only — Mem0 relevance never authorizes application (SAFE-02). */
export type AppliedLearningSource = "postgres";

export type SafetyGuardCode =
  | "factual_mode_conflict"
  | "readiness_blocked_cap"
  | "format_identity_creative_cap"
  | "bounded_key_only"
  | "avoid_pattern_hint_only";

export interface BlockedPrefillField {
  field: string;
  requestedValue: unknown;
  resolvedValue: unknown;
  guardCode: SafetyGuardCode;
  reason: string;
}

export interface AppliedLearningTraceEntry {
  learningId: string;
  variableKey: string;
  variableValue: string;
  preferenceDirection: "prefer" | "avoid";
  applied: boolean;
  evidenceEventIds: string[];
  guardCode?: SafetyGuardCode;
  note?: string;
}

export interface AppliedLearningTrace {
  traceId: string;
  learningsSource: AppliedLearningSource;
  safetyVersion: string;
  algorithmVersion: string;
  entries: AppliedLearningTraceEntry[];
  blockedFields: BlockedPrefillField[];
  avoidPatternHints: Array<{
    learningId: string;
    pattern: string;
    confidence: OutputLearningConfidenceLevel;
  }>;
}
