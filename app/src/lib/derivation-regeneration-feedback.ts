import type { RegenerationIssueBreakdown } from "@/lib/regeneration-preview-types";

export type RegenerationFeedbackBuildResult = {
  feedbackText: string;
  primaryReason?: string;
  issueBreakdown?: RegenerationIssueBreakdown;
};

export function buildRegenerationFeedback(input: {
  regenerationSuggestion?: string | null;
  hardFailures?: Array<{ code: string; message: string }> | null;
  regenerationPrimaryReason?: string | null;
  regenerationIssueBreakdown?: RegenerationIssueBreakdown | null;
}): RegenerationFeedbackBuildResult {
  const primaryReason = input.regenerationPrimaryReason?.trim() || undefined;
  const issueBreakdown = input.regenerationIssueBreakdown ?? undefined;

  const suggestion = input.regenerationSuggestion?.trim();
  if (suggestion) {
    return {
      feedbackText: suggestion,
      primaryReason,
      issueBreakdown,
    };
  }

  const failures = input.hardFailures ?? [];
  if (failures.length === 0) {
    return {
      feedbackText: "",
      primaryReason,
      issueBreakdown,
    };
  }

  return {
    feedbackText: failures.map((failure) => `${failure.code}: ${failure.message}`).join("\n"),
    primaryReason,
    issueBreakdown,
  };
}

export function derivationNeedsRegenerateDialog(input: {
  hardFailures?: Array<{ code: string; message: string }> | null;
  regenerationSuggestion?: string | null;
  regenerationPrimaryReason?: string | null;
  qualityVerdict?: string | null;
  qaChecklist?: Record<string, { status: string; note: string }> | null;
}): boolean {
  if ((input.hardFailures?.length ?? 0) > 0) return true;
  if (input.regenerationPrimaryReason?.trim()) return true;
  if (input.regenerationSuggestion?.trim()) return true;
  if (input.qualityVerdict === "invalid") return true;

  const checklist = input.qaChecklist ?? {};
  return Object.values(checklist).some(
    (entry) => entry?.status === "failed" || entry?.status === "warning"
  );
}
