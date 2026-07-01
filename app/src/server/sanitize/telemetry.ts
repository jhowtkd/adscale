import { sanitizeBetaEventProperties } from "@/server/beta-analytics/sanitize";
import type { BetaEventPropertyValue } from "@/server/beta-analytics/sanitize";
import { sanitizeDiagnosticContext } from "./diagnostic";
import {
  sanitizeMissionInsightInput,
  type SanitizedMissionInsight,
} from "@/server/mission-insights/sanitize";

export type TelemetrySanitizeKind = "feedback" | "beta_event" | "mission_insight";

export type MissionInsightTelemetryInput = Parameters<typeof sanitizeMissionInsightInput>[0];

export type TelemetrySanitizeOptions =
  | { kind: "feedback" }
  | { kind: "beta_event" }
  | { kind: "mission_insight" };

export function sanitizeForTelemetry(
  input: unknown,
  options: { kind: "feedback" }
): Record<string, unknown>;
export function sanitizeForTelemetry(
  input: unknown,
  options: { kind: "beta_event" }
): Record<string, BetaEventPropertyValue>;
export function sanitizeForTelemetry(
  input: MissionInsightTelemetryInput,
  options: { kind: "mission_insight" }
): SanitizedMissionInsight | null;
export function sanitizeForTelemetry(
  input: unknown,
  options: TelemetrySanitizeOptions
): Record<string, unknown> | Record<string, BetaEventPropertyValue> | SanitizedMissionInsight | null {
  switch (options.kind) {
    case "feedback":
      return sanitizeDiagnosticContext(input);
    case "beta_event":
      return sanitizeBetaEventProperties(input);
    case "mission_insight":
      return sanitizeMissionInsightInput(input as MissionInsightTelemetryInput);
    default: {
      const _exhaustive: never = options;
      return _exhaustive;
    }
  }
}
