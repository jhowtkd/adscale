export type CreativeWorkObjectiveVerdict = "pass" | "fail" | "inconclusive";
export type CreativeWorkSelectionVerdict = CreativeWorkObjectiveVerdict | "legacy";

export type CreativeWorkSelectionPolicy = {
  verdict: CreativeWorkSelectionVerdict;
  selectable: boolean;
  requiresConfirmation: boolean;
  rationale: "objective_pass" | "objective_fail" | "objective_inconclusive" | "objective_legacy";
  nextStep: "approve" | "generate_again" | "review_then_confirm";
};

export function getCreativeWorkObjectiveVerdict(
  quality: unknown,
): CreativeWorkObjectiveVerdict | null {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  const payload = quality as Record<string, unknown>;
  if (payload.schemaVersion !== 1) return null;
  const verdict = payload.objectiveVerdict;
  return verdict === "pass" || verdict === "fail" || verdict === "inconclusive"
    ? verdict
    : null;
}

export function getCreativeWorkSelectionPolicy(
  quality: unknown,
): CreativeWorkSelectionPolicy {
  const verdict = getCreativeWorkObjectiveVerdict(quality) ?? "legacy";
  if (verdict === "pass") {
    return {
      verdict,
      selectable: true,
      requiresConfirmation: false,
      rationale: "objective_pass",
      nextStep: "approve",
    };
  }
  if (verdict === "fail") {
    return {
      verdict,
      selectable: false,
      requiresConfirmation: false,
      rationale: "objective_fail",
      nextStep: "generate_again",
    };
  }
  return {
    verdict,
    selectable: true,
    requiresConfirmation: true,
    rationale: verdict === "inconclusive" ? "objective_inconclusive" : "objective_legacy",
    nextStep: "review_then_confirm",
  };
}

export function getCreativeWorkEvaluatorSummary(
  quality: unknown,
): string | null {
  if (!quality || typeof quality !== "object" || Array.isArray(quality)) return null;
  const payload = quality as Record<string, unknown>;
  return typeof payload.evaluatorSummary === "string" && payload.evaluatorSummary.trim().length > 0
    ? payload.evaluatorSummary
    : null;
}
