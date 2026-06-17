import type { CreativeHardFailure } from "../ai/creative-quality-gate";
import type { OutputDecisionReason } from "./output-decision-events";

export interface StructuredReasonInput {
  hardFailures?: CreativeHardFailure[] | unknown;
  scoreIssues?: string[] | unknown;
  regenerationSuggestion?: string | null;
  feedbackCategory?: string | null;
  correctionPrimaryReason?: string | null;
  userFeedback?: string | null;
}

function parseHardFailures(value: unknown): CreativeHardFailure[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CreativeHardFailure =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { code?: unknown }).code === "string"
  );
}

function parseScoreIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function extractPrimaryStructuredReason(
  input: StructuredReasonInput
): OutputDecisionReason | undefined {
  const hardFailures = parseHardFailures(input.hardFailures);
  if (hardFailures.length > 0) {
    const primary = hardFailures[0];
    return {
      code: primary.code,
      text: primary.message,
      source: "hard_failures",
    };
  }

  const scoreIssues = parseScoreIssues(input.scoreIssues);
  if (scoreIssues.length > 0) {
    return {
      text: scoreIssues[0],
      source: "score_issues",
    };
  }

  if (input.correctionPrimaryReason?.trim()) {
    return {
      text: input.correctionPrimaryReason.trim(),
      source: "correction_brief",
    };
  }

  if (input.regenerationSuggestion?.trim()) {
    return {
      text: input.regenerationSuggestion.trim(),
      source: "regeneration_suggestion",
    };
  }

  if (input.feedbackCategory?.trim()) {
    return {
      code: input.feedbackCategory.trim(),
      source: "feedback_category",
    };
  }

  if (input.userFeedback?.trim()) {
    return {
      text: input.userFeedback.trim().slice(0, 500),
      source: "user_feedback",
    };
  }

  return undefined;
}

export function extractRejectionReason(
  input: StructuredReasonInput
): OutputDecisionReason | undefined {
  return extractPrimaryStructuredReason(input);
}

export function extractRegenerationReason(
  input: StructuredReasonInput
): OutputDecisionReason | undefined {
  return extractPrimaryStructuredReason(input);
}
